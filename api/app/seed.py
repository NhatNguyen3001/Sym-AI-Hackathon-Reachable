"""Demo data. Anything standing in for a real external feed says "(demo data)" in its source label."""
from datetime import timedelta
from sqlmodel import Session, select

from app.models import AgentRun, Barrier, Venue, now
from app.routing.graph import nearest_edge


def _src(kind: str, label: str, ago: timedelta, url: str | None = None, fields: list[str] | None = None) -> dict:
    s = {"kind": kind, "label": label, "url": url, "seen_at": (now() - ago).isoformat()}
    if fields:
        s["fields"] = fields
    return s


def retire_demo_lifts(session: Session) -> None:
    """Databases seeded before cycle 3 hold a simulated lift outage; lift status is live now (ids start tfnsw-)."""
    for b in session.exec(select(Barrier).where(Barrier.type == "lift_outage")).all():
        if not b.id.startswith("tfnsw-"):
            session.delete(b)
    session.commit()


def seed(session: Session, G, places) -> None:
    retire_demo_lifts(session)
    if session.exec(select(Barrier)).first():
        return
    t = now()
    m, h = timedelta(minutes=1), timedelta(hours=1)

    def barrier(lat, lng, ago, **kw):
        edge, _ = nearest_edge(G, lat, lng)
        return Barrier(lat=lat, lng=lng, edge_id=edge, first_seen=t - ago, last_confirmed=t - ago, **kw)

    session.add_all([
        barrier(-33.77215, 151.11590, 2 * h, type="blocked", title="Footpath works, detour in place", place="Management Drive",
                status="confirmed", confidence=0.9, update_type="roadworks",
                sources=[_src("feed", "Live Traffic NSW (demo data)", 2 * h)]),
        barrier(-33.77830, 151.11950, 25 * m, type="broken_ramp", title="Kerb ramp may be damaged", place="Herring Road crossing",
                status="needs_checking", confidence=0.4, update_type="report",
                sources=[_src("user", "One user report, no photo yet", 25 * m)]),
        barrier(-33.77590, 151.11390, 5 * h, type="broken_ramp", title="Ramp repaired", place="Near the Library",
                status="resolved", confidence=0.9, update_type="report",
                sources=[_src("user", "Confirmed by 3 users", 5 * h)]),
    ])
    lib, cafe, globe = places.get("library"), places.get("library-cafe"), places.get("globe-cafe")
    session.add_all([
        Venue(id=lib.id, name=lib.name, address="16 Macquarie Walk, Macquarie University", lat=lib.lat, lng=lib.lng,
              entrance="yes", step_free_inside="yes", toilet="yes", parking="yes",
              confidence={"entrance": "confirmed", "step_free_inside": "confirmed", "toilet": "confirmed", "parking": "likely"},
              sources=[_src("web", "Macquarie University accessibility page (demo data)", 2 * m, fields=["entrance", "step_free_inside", "toilet"]),
                       _src("review", "2 reviews agree (demo data)", 2 * m, fields=["entrance", "toilet"]),
                       _src("map", "Campus map lists accessible parking at C1 (demo data)", 2 * m, fields=["parking"])],
              checked_at=t - 2 * m),
        Venue(id=cafe.id, name=cafe.name, address="Waranara Library, ground floor", lat=cafe.lat, lng=cafe.lng,
              entrance="yes", step_free_inside="yes", toilet="unknown", parking="no",
              confidence={"entrance": "confirmed", "step_free_inside": "likely", "toilet": "not_sure", "parking": "likely"},
              sources=[_src("web", "Venue website (demo data)", 2 * m, fields=["entrance"]),
                       _src("review", "2 reviews agree (demo data)", 2 * m, fields=["entrance"]),
                       _src("user", "User photo, 3 days ago (demo data)", timedelta(days=3), fields=["step_free_inside"]),
                       _src("map", "No parking listed on campus map (demo data)", 2 * m, fields=["parking"])],
              checked_at=t - 2 * m),
        Venue(id=globe.id, name=globe.name, lat=globe.lat, lng=globe.lng,
              entrance="yes", step_free_inside="yes", toilet="yes", parking="unknown",
              confidence={"entrance": "likely", "step_free_inside": "likely", "toilet": "likely", "parking": "not_sure"},
              sources=[_src("review", "Reviews mention a ramp (demo data)", 3 * h, fields=["entrance", "step_free_inside", "toilet"])],
              checked_at=t - 3 * h),
    ])
    session.add_all([
        AgentRun(agent="updates", started_at=t - 3 * m, finished_at=t - 3 * m, summary="Checked the weather."),
        AgentRun(agent="report_checker", started_at=t - h, finished_at=t - h, summary="Rechecked 1 report."),
        AgentRun(agent="venue", started_at=t - 2 * m, finished_at=t - 2 * m, summary="Checked Waranara Library using 3 sources."),
        AgentRun(agent="route", started_at=t - h, finished_at=t - h, summary="Planned Macquarie University station to Waranara Library."),
    ])
    session.commit()
