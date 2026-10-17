"""Helpers that read live routing state (barriers, lift outages) from the database."""
from sqlmodel import Session, select

from app.agents import ago
from app.models import AgentRun, Barrier
from app.routing.cost import Context

LIFT_SOURCE = "Transport for NSW (demo data)"


def active_barriers(session: Session) -> list[Barrier]:
    return list(session.exec(select(Barrier).where(Barrier.status != "resolved")).all())


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


def lift_rows(session: Session, places, station_id: str) -> list[dict]:
    outages = {b.exit_id: b for b in active_barriers(session) if b.type == "lift_outage" and b.status == "confirmed"}
    last_check = session.exec(
        select(AgentRun).where(AgentRun.agent == "updates").order_by(AgentRun.started_at.desc())).first()
    checked = ago(last_check.started_at) if last_check else "just now"
    rows = []
    for e in places.station_exits(station_id):
        if e["via"] != "lift":
            continue
        out = outages.get(e["exitId"])
        rows.append({"exitId": e["exitId"], "exit": f"{e['name']} lift",
                     "status": "Out of service" if out else "Working", "source": LIFT_SOURCE,
                     "updated": ago(out.first_seen) if out else checked})
    return rows
