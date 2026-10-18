"""The map agent's run button (owner only), its status, and the places it found (spec sections 4-5)."""
import asyncio
import hmac
import logging

from fastapi import APIRouter, Depends, Header, Request
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


@router.get("/map/places")
def map_places(bbox: str, session: Session = Depends(get_session)):
    try:
        w, s, e, n = (float(v) for v in bbox.split(","))
    except ValueError:
        raise ApiError(422, "bad_bbox", "bbox must be west,south,east,north.")
    rows = session.exec(select(MapPlace).where(MapPlace.lng >= w, MapPlace.lng <= e, MapPlace.lat >= s,
                                               MapPlace.lat <= n).limit(MAX_PINS)).all()
    return [{"id": f"{p.id}:pin", "placeId": p.id, "name": p.name, "kind": p.kind, "label": LABEL[p.kind],
             "lat": p.lat, "lng": p.lng, "source": "OpenStreetMap"} for p in rows]
