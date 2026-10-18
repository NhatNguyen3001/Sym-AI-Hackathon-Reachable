from sqlmodel import Session, select

from app.agents import ago
from app.models import Barrier, Venue, aware, now

STATUS = {"confirmed": "Confirmed", "needs_checking": "Needs checking", "resolved": "Resolved"}


def _labels(sources: list) -> str:
    return "; ".join(s["label"] for s in sources)


def build_updates(session: Session, weather: dict, type_: str | None = None) -> list[dict]:
    items: list[tuple] = []
    for b in session.exec(select(Barrier)).all():
        items.append((aware(b.last_confirmed), {
            "id": b.id, "type": b.update_type, "title": b.title, "place": b.place, "time": ago(b.last_confirmed),
            "source": _labels(b.sources), "status": STATUS.get(b.status, b.status),
            "tone": "primary" if b.status == "resolved" else "warn",
            **({"detail": b.sources[-1]["text"]} if b.sources and b.sources[-1].get("text")
               and b.type == "roadworks" else {}),
            **({"lat": None, "lng": None} if b.lat == 0 and b.lng == 0 else {"lat": b.lat, "lng": b.lng})}))
    for v in session.exec(select(Venue)).all():
        items.append((aware(v.checked_at), {
            "id": f"venue-{v.id}", "type": "venue", "title": "Entrance details updated", "place": v.name,
            "time": ago(v.checked_at), "source": _labels(v.sources), "status": "Updated", "tone": "primary",
            "lat": v.lat, "lng": v.lng}))
    if weather.get("raining"):
        items.append((now(), {
            "id": "weather-now", "type": "weather", "title": "Rain around campus", "place": "Macquarie Park",
            "time": "just now", "source": weather["source"], "status": "Active", "tone": "warn", "lat": None, "lng": None}))
    items.sort(key=lambda t: t[0], reverse=True)
    out = [i for _, i in items]
    if type_ and type_ != "all":
        out = [i for i in out if i["type"] == type_]
    return out
