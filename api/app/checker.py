"""Simple Report checker: decides what a user report does to the map, using nearby barriers and notices."""
from datetime import timedelta

from sqlmodel import Session, select

from app.agents import log_run
from app.models import Barrier, Report, aware, now
from app.routing.graph import dist_m, nearest_edge

SAME_SPOT_M = 30
ROADWORKS_M = 100
TITLES = {"blocked": "Footpath blocked", "stairs": "Stairs on the path", "broken_ramp": "Kerb ramp may be damaged",
          "slippery": "Slippery path", "narrow": "Path too narrow"}


def decide(report: Report, nearby_active: list, nearby_reports: int, roadworks_near: bool) -> tuple[str, str | None]:
    """Returns (report status, action) where action is resolve | confirm | needs_checking | None."""
    if report.user_label == "fine":
        return ("confirmed", "resolve") if nearby_active else ("rejected", None)
    agree = report.ai_label is not None and report.ai_label == report.user_label
    if agree and (nearby_active or nearby_reports > 0 or roadworks_near):
        return "confirmed", "confirm"
    return "needs_checking", "needs_checking"


def _place_name(G, edge: str) -> str:
    u, v, k = edge.rsplit("-", 2)
    conv = (lambda x: int(x) if x.isdigit() else x)
    name = G.edges[conv(u), conv(v), int(k)].get("name")
    if isinstance(name, list):
        name = name[0]
    return name or "Near the reported spot"


async def check_report(state, report_id: str) -> None:
    with Session(state.engine) as s:
        report = s.get(Report, report_id)
        if report is None:
            return
        def near(b, m):
            return dist_m(report.lat, report.lng, b.lat, b.lng) <= m
        active = [b for b in s.exec(select(Barrier).where(Barrier.status != "resolved")).all() if b.type != "lift_outage"]
        nearby_active = sorted((b for b in active if near(b, SAME_SPOT_M)), key=lambda b: dist_m(report.lat, report.lng, b.lat, b.lng))
        since = now() - timedelta(hours=24)
        nearby_reports = sum(1 for r in s.exec(select(Report).where(Report.id != report.id)).all()
                             if aware(r.created_at) >= since and near(r, SAME_SPOT_M))
        roadworks_near = any(b.update_type == "roadworks" and near(b, ROADWORKS_M) for b in active)
        status, action = decide(report, nearby_active, nearby_reports, roadworks_near)
        what = "photo" if report.photo_url else "report"
        barrier = None
        if action == "resolve":
            barrier = nearby_active[0]
            barrier.status, barrier.last_confirmed = "resolved", now()
            barrier.title = "Path is clear again" if barrier.title == TITLES.get(barrier.type) else barrier.title
            barrier.sources = barrier.sources + [{"kind": "user", "label": f"User {what}: path is fine now", "url": None, "seen_at": now().isoformat()}]
            summary = "Marked as fixed. Routes updated."
        elif action in ("confirm", "needs_checking"):
            confirmed = action == "confirm"
            barrier = next((b for b in nearby_active if b.update_type == "report" and b.type == report.user_label), None)
            if barrier is None:
                edge, _ = nearest_edge(state.graph, report.lat, report.lng)
                barrier = Barrier(type=report.user_label, title=TITLES[report.user_label], place=_place_name(state.graph, edge),
                                  lat=report.lat, lng=report.lng, edge_id=edge, update_type="report")
            if confirmed:
                match = "a roadworks notice" if roadworks_near else "nearby reports"
                label, barrier.status, barrier.confidence = f"User {what}, matched to {match}", "confirmed", 0.85
                summary = f"Matched to {match}. Routes updated."
            else:
                label, barrier.status, barrier.confidence = f"One user {what}, not confirmed yet", "needs_checking", 0.4
                summary = "Needs checking: no other source yet."
            barrier.last_confirmed = now()
            barrier.sources = barrier.sources + [{"kind": "user", "label": label, "url": None, "seen_at": now().isoformat()}]
        else:
            summary = "Report didn't match anything on the map."
        if barrier is not None:
            s.add(barrier)
            s.commit()
            s.refresh(barrier)
            report.barrier_id = barrier.id
        report.status = status
        s.add(report)
        s.commit()
        log_run(s, "report_checker", summary)
        if barrier is not None:
            await state.broadcaster.publish("barrier_changed", {"barrierId": barrier.id, "status": barrier.status,
                                                                "title": barrier.title, "reportId": report.id, "summary": summary})
        await state.broadcaster.publish("agent_run", {"agent": "report_checker", "summary": summary})


async def check_report_in_sandbox(state, box, session_id: str, report: Report) -> None:
    """The same check for a demo sandbox report (cycle 7): reads the shared barriers, but keeps what it decides in
    this phone's box, so other judges' maps don't change and nothing is written to the database."""
    with Session(state.read_engine) as s:
        shared = [b for b in s.exec(select(Barrier).where(Barrier.status != "resolved")).all() if b.type != "lift_outage"]
    merged = {b.id: b for b in shared}
    merged.update(box.barriers)
    active = [b for b in merged.values() if b.status != "resolved" and b.type != "lift_outage"]

    def near(b, m):
        return dist_m(report.lat, report.lng, b.lat, b.lng) <= m
    nearby_active = sorted((b for b in active if near(b, SAME_SPOT_M)), key=lambda b: dist_m(report.lat, report.lng, b.lat, b.lng))
    since = now() - timedelta(hours=24)
    nearby_reports = sum(1 for r in box.reports.values()
                         if r.id != report.id and aware(r.created_at) >= since and near(r, SAME_SPOT_M))
    roadworks_near = any(b.update_type == "roadworks" and near(b, ROADWORKS_M) for b in active)
    status, action = decide(report, nearby_active, nearby_reports, roadworks_near)
    what = "photo" if report.photo_url else "report"
    barrier = None
    if action == "resolve":
        # A copy, so the shared barrier stays in effect for everyone else.
        barrier = Barrier(**nearby_active[0].model_dump())
        barrier.status, barrier.last_confirmed = "resolved", now()
        barrier.title = "Path is clear again" if barrier.title == TITLES.get(barrier.type) else barrier.title
        barrier.sources = barrier.sources + [{"kind": "user", "label": f"User {what}: path is fine now", "url": None, "seen_at": now().isoformat()}]
        summary = "Marked as fixed. Routes updated."
    elif action in ("confirm", "needs_checking"):
        confirmed = action == "confirm"
        found = next((b for b in nearby_active if b.update_type == "report" and b.type == report.user_label), None)
        if found is None:
            edge, _ = nearest_edge(state.graph, report.lat, report.lng)
            barrier = Barrier(type=report.user_label, title=TITLES[report.user_label], place=_place_name(state.graph, edge),
                              lat=report.lat, lng=report.lng, edge_id=edge, update_type="report")
        else:
            barrier = Barrier(**found.model_dump())
        if confirmed:
            match = "a roadworks notice" if roadworks_near else "nearby reports"
            label, barrier.status, barrier.confidence = f"User {what}, matched to {match}", "confirmed", 0.85
            summary = f"Matched to {match}. Routes updated."
        else:
            label, barrier.status, barrier.confidence = f"One user {what}, not confirmed yet", "needs_checking", 0.4
            summary = "Needs checking: no other source yet."
        barrier.last_confirmed = now()
        barrier.sources = barrier.sources + [{"kind": "user", "label": label, "url": None, "seen_at": now().isoformat()}]
    else:
        summary = "Report didn't match anything on the map."
    if barrier is not None:
        box.barriers[barrier.id] = barrier
        report.barrier_id = barrier.id
    report.status = status
    if barrier is not None:
        await state.broadcaster.publish("barrier_changed", {"barrierId": barrier.id, "status": barrier.status,
                                                            "title": barrier.title, "reportId": report.id,
                                                            "summary": summary}, session=session_id)
