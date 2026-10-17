import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app.config import Settings
from app.db import init_db, make_engine, make_read_engine
from app.errors import ApiError, api_error_handler
from app.events import Broadcaster
from app.replica import Replica
from app.llm.client import get_client
from app.routers import agents, demo, events, health, mapdata, places, profile, reports, route, stations, updates, venue, weather
from app.routing.graph import load_graph
from app.routing.places import Places
from app.routing.router import CampusRouter, get_router
from app.routing.geo import parse_bbox
from app.places.overpass import OverpassClient
from app.places.photon import PhotonClient
from app.places.resolver import PlaceResolver
from app.seed import seed
from app.mapdata.agent import MapAgent
from app.mapdata.snapshot import load_snapshot
from app.transit.lifts import LiftAlertSync, LiftFeed, LiftPoller
from app.transit.plan import TransitPlanner
from app.transit.tfnsw import TfnswClient
from app.weather import WeatherService

log = logging.getLogger("reachable")
ROUTERS = [m.router for m in (health, places, profile, route, venue, reports, updates, agents, mapdata, weather, stations,
                               events, demo)]


async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = f"{where}: {first.get('msg', 'invalid value')}" if where else "The request was not valid."
    return JSONResponse({"error": {"code": "invalid_request", "message": msg}}, status_code=422)


async def server_error_handler(_: Request, exc: Exception):
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse({"error": {"code": "server_error", "message": "Something went wrong on our side."}}, status_code=500)


QUIET_AFTER_S = 1.0  # sync only when no request is running and none finished in the last second


def _quiet(st) -> bool:
    return st.requests_in_flight == 0 and time.monotonic() - st.last_request_end >= QUIET_AFTER_S


def create_app(settings: Settings | None = None, graph=None, places=None, weather_service=None, router=None,
               tfnsw=None, replica=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        st = app.state
        st.settings = settings
        rep = replica
        if rep is None and settings.turso_database_url:
            rep = Replica(settings.turso_replica_path, settings.turso_database_url, settings.turso_auth_token)
        st.replica = rep
        st.db_kind = "turso" if rep else "sqlite"
        if rep:
            rep.start()  # raises ReplicaUnavailable when Turso is down and there's no local copy yet
        st.engine = make_engine(settings.database_url, replica=rep)          # writes
        st.read_engine = make_read_engine(rep) if rep else st.engine          # reads: the local copy
        sync_task = (asyncio.create_task(rep.run(settings.turso_sync_seconds, quiet=lambda: _quiet(st)))
                     if rep else None)
        try:
            init_db(st.engine)
        except Exception:
            if st.db_kind == "turso":  # no silent fallback: two databases would drift apart
                log.error("Can't reach the Turso database. Check TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, "
                          "or clear them to use local SQLite.")
            raise
        st.graph = graph if graph is not None else load_graph(settings.graph_path)
        st.places = places or Places(settings.places_path, settings.overrides_path, st.graph)
        st.weather = weather_service or WeatherService()
        st.campus = CampusRouter(st.graph, settings.speed_mps, st.places.exit_names)
        st.router = router or get_router(settings, st.graph, st.places)
        st.resolver = PlaceResolver(st.places, PhotonClient(settings.photon_url) if settings.photon_url else None,
                                    OverpassClient(settings.overpass_url) if settings.router == "valhalla" else None,
                                    st.engine, parse_bbox(settings.coverage_bbox))
        st.resolver.read_engine = st.read_engine  # map places are read from the local copy
        st.broadcaster = Broadcaster()
        st.llm = get_client(settings.anthropic_api_key)
        st.photo_labels = {}
        if settings.seed:
            with Session(st.engine) as s:
                seed(s, st.graph, st.places)
        # Transport for NSW: live lift alerts (and, in /route, public transport options). Off without a key.
        st.tfnsw = tfnsw or (TfnswClient(settings.tfnsw_url, settings.tfnsw_api_key) if settings.tfnsw_api_key else None)
        st.lift_feed = LiftFeed(enabled=st.tfnsw is not None)
        st.lift_poller = (LiftPoller(st.tfnsw, LiftAlertSync(st.places, st.tfnsw.stop_coord), st.lift_feed, st.engine,
                                     st.broadcaster, settings.lift_poll_seconds) if st.tfnsw else None)
        st.transit = (TransitPlanner(st.tfnsw, st.places.station_stop_id, frozenset(st.places.lift_osm_ids))
                      if st.tfnsw else None)
        # Map agent (cycle 5): runs only when the owner asks. The snapshot fills a map that was never updated.
        load_snapshot(st.engine, settings.osm_snapshot_path)
        agent_cls = MapAgent
        if settings.seed_map_places or settings.map_agent_fake:
            from app.mapdata import e2e
            if settings.seed_map_places:
                e2e.seed_map_places(st.engine)
            if settings.map_agent_fake:
                agent_cls = e2e.FakeMapAgent
        st.map_agent = agent_cls(st.engine, OverpassClient(settings.overpass_url) if settings.overpass_url else None,
                                 st.tfnsw, st.llm, st.graph, quiet=lambda: _quiet(st))
        task = asyncio.create_task(st.lift_poller.run()) if st.lift_poller and settings.lift_poll_seconds > 0 else None
        yield
        for t in (task, sync_task):
            if t:
                t.cancel()

    app = FastAPI(title="Reachable API", lifespan=lifespan)
    app.state.requests_in_flight, app.state.last_request_end = 0, 0.0

    @app.middleware("http")
    async def track_requests(request: Request, call_next):
        # The live stream stays open, and the map status is a tiny local read polled while the map updates:
        # neither counts as "busy" (the map agent and Turso sync wait for a quiet moment).
        if request.url.path in ("/events", "/agents/map/status"):
            return await call_next(request)
        app.state.requests_in_flight += 1
        try:
            return await call_next(request)
        finally:
            app.state.requests_in_flight -= 1
            app.state.last_request_end = time.monotonic()
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["X-Search-Limited"])
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(Exception, server_error_handler)
    for r in ROUTERS:
        app.include_router(r)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")
    return app


app = create_app()
