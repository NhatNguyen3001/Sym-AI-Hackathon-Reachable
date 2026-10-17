from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.agents import ago
from app.db import get_session
from app.errors import ApiError
from app.models import Venue

router = APIRouter()
FIELDS = [("Level entrance", "entrance"), ("Step-free inside", "step_free_inside"), ("Accessible toilet", "toilet")]


def _status(value: str, confidence: str | None) -> str:
    if value != "yes":
        return "Not found"
    return {"confirmed": "Confirmed", "likely": "Likely"}.get(confidence or "", "Not sure")


@router.get("/venue/{venue_id}/check")
def venue_check(venue_id: str, request: Request, session: Session = Depends(get_session)):
    place = request.app.state.places.get(venue_id)
    v = session.get(Venue, venue_id)
    if v is None:
        if place is None:
            raise ApiError(404, "venue_not_found", "We don't know that place yet.")
        return {"id": place.id, "name": place.name, "checkedBy": "Not checked yet", "checkedAgo": "",
                "sourceCount": 0, "sources": [],
                "checks": [{"field": f, "status": "Not found", "source": "Not checked yet"} for f, _ in FIELDS]}
    checks = []
    for label, key in FIELDS:
        srcs = [s["label"] for s in v.sources if key in s.get("fields", [])]
        checks.append({"field": label, "status": _status(getattr(v, key), v.confidence.get(key)),
                       "source": " and ".join(srcs) if srcs else "Not mentioned in any source"})
    return {"id": v.id, "name": v.name, "checks": checks, "checkedBy": v.checked_by, "checkedAgo": ago(v.checked_at),
            "sourceCount": len(v.sources), "sources": [{"label": s["label"], "url": s.get("url")} for s in v.sources]}
