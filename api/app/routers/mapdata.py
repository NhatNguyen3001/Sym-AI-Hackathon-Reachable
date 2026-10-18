"""The map agent's run button (owner only), its status, and the places it found (spec sections 4-5)."""
import asyncio
import hmac
import json
import logging
import threading
import time

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.db import get_session
from app.errors import ApiError
from app.mapdata.agent import AlreadyRunning
from app.models import MapPlace

router = APIRouter()
log = logging.getLogger("reachable")
MAX_PINS = 8000  # all of Greater Sydney (~5,500 places), so a zoomed-out view is never cut off
LABEL = {"toilet": "Accessible toilet", "parking": "Accessible parking", "entrance": "Step-free entrance",
         "venue": "Wheelchair-accessible place"}


def _status(st, session) -> dict:
    return {**st.map_agent.status(session), "paused": st.settings.map_agent_paused}


async def _run(st) -> None:
    try:
        await st.map_agent.run(claimed=True)
    except AlreadyRunning:
        return
    except Exception:  # noqa: BLE001 - a failed run must not take the server down
        log.exception("Map agent run failed")
    forget_places(st)
    with Session(st.read_engine) as s:
        status = _status(st, s)
    await st.broadcaster.publish("map_updated", status)


@router.post("/agents/map/run")
async def run_map_agent(request: Request, x_admin_key: str | None = Header(default=None)):
    st = request.app.state
    key = st.settings.admin_key
    if not key:
        raise ApiError(403, "off", "Map updates are off on this server.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key.encode(), key.encode()):
        raise ApiError(403, "forbidden", "Only the owner can update the map.")
    if st.settings.map_agent_paused:
        raise ApiError(403, "paused", "Map updates are paused")
    if not st.map_agent.claim():
        raise ApiError(409, "running", "The map is already updating.")
    st.map_task = asyncio.create_task(_run(st))  # keep a reference so the task isn't collected
    return JSONResponse({"started": True}, status_code=202)


@router.get("/agents/map/status")
def map_status(request: Request, session: Session = Depends(get_session)):
    return _status(request.app.state, session)


PLACES_CACHE_S = 300
_places_lock = threading.Lock()


def _cache(st) -> dict:
    """This app's built lists, per box (cycle 7: 80 phones open the map at once and all ask for the same box)."""
    if not hasattr(st, "places_cache"):
        st.places_cache = {}
    return st.places_cache


def forget_places(st) -> None:
    """After a map agent run: the next request builds the list again."""
    with _places_lock:
        _cache(st).clear()


def _build_places(session: Session, box: tuple) -> bytes:
    w, s, e, n = box
    rows = session.exec(select(MapPlace).where(MapPlace.lng >= w, MapPlace.lng <= e, MapPlace.lat >= s,
                                               MapPlace.lat <= n).limit(MAX_PINS)).all()
    return json.dumps([{"id": f"{p.id}:pin", "placeId": p.id, "name": p.name, "kind": p.kind, "label": LABEL[p.kind],
                        "lat": p.lat, "lng": p.lng, "source": "OpenStreetMap"} for p in rows],
                      separators=(",", ":")).encode()


@router.get("/map/places")
def map_places(bbox: str, request: Request, session: Session = Depends(get_session)):
    try:
        box = tuple(round(float(v), 4) for v in bbox.split(","))
        if len(box) != 4:
            raise ValueError
    except ValueError:
        raise ApiError(422, "bad_bbox", "bbox must be west,south,east,north.")
    cache = _cache(request.app.state)
    with _places_lock:   # one build at a time: the others wait a moment and reuse it
        hit = cache.get(box)
        if not hit or time.monotonic() - hit[0] > PLACES_CACHE_S:
            hit = cache[box] = (time.monotonic(), _build_places(session, box))
            while len(cache) > 200:
                cache.pop(next(iter(cache)))
    # The same for everyone and only changes when the owner runs the map agent: let CloudFront and phones keep it.
    return Response(content=hit[1], media_type="application/json", headers={"Cache-Control": "public, max-age=300"})
