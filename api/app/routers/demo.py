"""Demo controls: flip a lift outage or rain on and off so the live reroute can be shown on stage."""
from datetime import timedelta
from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app.db import get_session
from app.errors import ApiError
from app.models import Barrier, now
from app.seed import _src

router = APIRouter(prefix="/demo")


@router.post("/lifts/{exit_id}")
async def toggle_lift(exit_id: str, request: Request, session: Session = Depends(get_session)):
    st = request.app.state
    exit_ = next((e for e in st.places.exits if e["id"] == exit_id), None)
    if exit_ is None:
        raise ApiError(404, "exit_not_found", "We don't know that station exit.")
    b = session.exec(select(Barrier).where(Barrier.type == "lift_outage", Barrier.exit_id == exit_id)).first()
    if b is None:
        station = st.places.get(st.places.station_id)
        node = st.graph.nodes[exit_["osmNode"]]
        b = Barrier(type="lift_outage", title="Lift out of service", place=f"{station.name}, {exit_['name'].lower()}",
                    lat=node["y"], lng=node["x"], exit_id=exit_id, status="resolved", confidence=0.95,
                    update_type="transport")
    b.status = "resolved" if b.status == "confirmed" else "confirmed"
    b.title = "Lift out of service" if b.status == "confirmed" else "Lift working again"
    b.last_confirmed = now()
    if b.status == "confirmed":
        b.first_seen = now()
    b.sources = [_src("feed", "Transport for NSW lift alert (demo data)", timedelta(0))]
    session.add(b)
    session.commit()
    status = "Out of service" if b.status == "confirmed" else "Working"
    await st.broadcaster.publish("lift_changed", {"exitId": exit_id, "status": status})
    return {"exitId": exit_id, "status": status}


@router.post("/rain")
async def toggle_rain(request: Request):
    w = request.app.state.weather.toggle_override()
    await request.app.state.broadcaster.publish("weather_changed", w)
    return w
