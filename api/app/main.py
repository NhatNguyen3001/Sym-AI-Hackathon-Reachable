import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from app.config import Settings
from app.db import init_db, make_engine
from app.errors import ApiError, api_error_handler
from app.events import Broadcaster
from app.llm.client import get_client
from app.routers import agents, demo, events, health, places, profile, reports, route, stations, updates, venue, weather
from app.routing.graph import load_graph
from app.routing.places import Places
from app.seed import seed
from app.weather import WeatherService

log = logging.getLogger("reachable")
ROUTERS = [m.router for m in (health, places, profile, route, venue, reports, updates, agents, weather, stations, events, demo)]


async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = f"{where}: {first.get('msg', 'invalid value')}" if where else "The request was not valid."
    return JSONResponse({"error": {"code": "invalid_request", "message": msg}}, status_code=422)


async def server_error_handler(_: Request, exc: Exception):
    log.exception("Unhandled error", exc_info=exc)
    return JSONResponse({"error": {"code": "server_error", "message": "Something went wrong on our side."}}, status_code=500)


def create_app(settings: Settings | None = None, graph=None, places=None, weather_service=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        st = app.state
        st.settings = settings
        st.engine = make_engine(settings.database_url)
        init_db(st.engine)
        st.graph = graph if graph is not None else load_graph(settings.graph_path)
        st.places = places or Places(settings.places_path, settings.overrides_path, st.graph)
        st.weather = weather_service or WeatherService()
        st.broadcaster = Broadcaster()
        st.llm = get_client(settings.anthropic_api_key)
        st.photo_labels = {}
        if settings.seed:
            with Session(st.engine) as s:
                seed(s, st.graph, st.places)
        yield

    app = FastAPI(title="Reachable API", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(Exception, server_error_handler)
    for r in ROUTERS:
        app.include_router(r)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")
    return app


app = create_app()
