from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app.agents import ago
from app.db import get_session
from app.errors import ApiError
from app.mapdata.roadworks import TZ as SYDNEY_TZ
from app.models import MapPlace, Venue, aware

router = APIRouter()
FIELDS = [("Level entrance", "entrance"), ("Step-free inside", "step_free_inside"), ("Accessible toilet", "toilet")]
AMENITIES = [
    ("entrance", "Level or ramped entrance"),
    ("toilet", "Accessible toilet"),
    ("parking", "Accessible parking nearby"),
]


def _status(value: str, confidence: str | None) -> str:
    if value != "yes":
        return "Not found"
    return {"confirmed": "Confirmed", "likely": "Likely"}.get(confidence or "", "Not sure")


@router.get("/amenities")
def amenities(session: Session = Depends(get_session)):
    """Places with a level entrance, accessible toilet, or accessible parking, drawn on the map before a search."""
    spread = {"entrance": (0.0005, 0.0), "toilet": (0.0, 0.0006), "parking": (-0.0005, 0.0)}
    pins = []
    for venue in session.exec(select(Venue)).all():
        for key, label in AMENITIES:
            if getattr(venue, key) != "yes" or venue.confidence.get(key) not in ("confirmed", "likely"):
                continue
            dlat, dlng = spread[key]
            pin = {
                "id": f"{venue.id}:{key}",
                "placeId": venue.id,
                "name": venue.name,
                "kind": key,
                "label": label,
                "lat": venue.lat + dlat,
                "lng": venue.lng + dlng,
            }
            while any(abs(pin["lat"] - other["lat"]) < 0.0004 and abs(pin["lng"] - other["lng"]) < 0.0004 for other in pins):
                pin["lng"] += 0.00055
            pins.append(pin)
    return pins


def _osm_status(value: str | None) -> str:
    """OpenStreetMap tags are added by the community, so "yes" is Likely, never Confirmed (spec section 5)."""
    return {"yes": "Likely", "designated": "Likely", "limited": "Not sure"}.get(value or "", "Not checked")


def osm_check(p: MapPlace) -> dict:
    t = p.tags or {}
    toilet = t.get("toilets:wheelchair") or (t.get("wheelchair") if t.get("amenity") == "toilets" else None)
    step_free = _osm_status(t.get("wheelchair"))
    checks = [("Level entrance", step_free), ("Step-free inside", step_free), ("Accessible toilet", _osm_status(toilet))]
    label = f"OpenStreetMap, {aware(p.seen_at).astimezone(SYDNEY_TZ).day} {aware(p.seen_at).astimezone(SYDNEY_TZ):%b}"
    return {"id": p.id, "name": p.name, "checkedBy": "Map agent", "checkedAgo": ago(p.seen_at), "sourceCount": 1,
            "sources": [{"label": label, "url": f"https://www.openstreetmap.org/{p.osm_id}"}],
            "checks": [{"field": f, "status": s, "source": label if s != "Not checked" else "Not mentioned in OpenStreetMap"}
                       for f, s in checks]}


@router.get("/venue/{venue_id}/check")
def venue_check(venue_id: str, request: Request, session: Session = Depends(get_session)):
    if venue_id.startswith("place:"):
        row = session.get(MapPlace, venue_id)
        if row is None:
            raise ApiError(404, "venue_not_found", "We don't know that place yet.")
        return osm_check(row)
    place = request.app.state.resolver.get(venue_id)
    v = session.get(Venue, venue_id)
    if v is None:
        if place is None:
            raise ApiError(404, "venue_not_found", "We don't know that place yet.")
        return {"id": place.id, "name": place.name, "checkedBy": "Not checked yet", "checkedAgo": "",
                "sourceCount": 0, "sources": [],
                "checks": [{"field": f, "status": "Not checked", "source": "Not checked yet"} for f, _ in FIELDS]}
    checks = []
    for label, key in FIELDS:
        srcs = [s["label"] for s in v.sources if key in s.get("fields", [])]
        checks.append({"field": label, "status": _status(getattr(v, key), v.confidence.get(key)),
                       "source": " and ".join(srcs) if srcs else "Not mentioned in any source"})
    return {"id": v.id, "name": v.name, "checks": checks, "checkedBy": v.checked_by, "checkedAgo": ago(v.checked_at),
            "sourceCount": len(v.sources), "sources": [{"label": s["label"], "url": s.get("url")} for s in v.sources]}
