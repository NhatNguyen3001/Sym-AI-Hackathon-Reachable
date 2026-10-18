"""Helpers that read live routing state (barriers, lift outages) from the database."""
from sqlmodel import Session, select

from app.agents import ago
from app.models import Barrier
from app.sandbox import merge_barriers
from app.routing.cost import Context


def active_barriers(session: Session) -> list[Barrier]:
    """Barriers in effect: the shared ones plus, in demo sandbox mode, this phone's own (spec cycle 7 §5)."""
    shared = list(session.exec(select(Barrier).where(Barrier.status != "resolved")).all())
    return [b for b in merge_barriers(shared) if b.status != "resolved"]


def build_context(session: Session, raining: bool) -> Context:
    ctx = Context(raining=raining)
    for b in active_barriers(session):
        if b.type == "lift_outage":
            if b.status == "confirmed" and b.exit_id:
                ctx.lift_out_exits.add(b.exit_id)
        else:
            ctx.barrier_points.append((b.lat, b.lng, b.status))
        if b.type != "lift_outage" and b.edge_id:
            u, v, k = b.edge_id.rsplit("-", 2)
            for eid in (b.edge_id, f"{v}-{u}-{k}"):  # a blocked footpath is blocked both ways
                if ctx.barriers.get(eid) != "confirmed":
                    ctx.barriers[eid] = b.status
    return ctx


def lift_rows(session: Session, places, station_id: str, feed) -> list[dict]:
    """Lift status per station exit. Without fresh live data we say "Not sure" rather than "Working"."""
    lifts = [b for b in active_barriers(session) if b.type == "lift_outage"]
    outages = {b.exit_id: b for b in lifts if b.status == "confirmed" and b.exit_id}
    unsure = any(b.status == "needs_checking" and not b.exit_id for b in lifts)
    rows = []
    for e in places.station_exits(station_id):
        if e["via"] != "lift":
            continue
        out = outages.get(e["exitId"])
        if out:
            status, updated = "Out of service", ago(out.first_seen)
        else:
            status, updated = ("Not sure" if unsure or not feed.fresh() else "Working"), feed.updated()
        rows.append({"exitId": e["exitId"], "exit": f"{e['name']} lift", "status": status, "source": feed.source(),
                     "updated": updated, "lat": e["lat"], "lng": e["lng"]})
    return rows
