from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.db import get_session
from app.errors import ApiError
from app.state import lift_rows

router = APIRouter()


@router.get("/stations/{station_id}/lifts")
def lifts(station_id: str, request: Request, session: Session = Depends(get_session)):
    place = request.app.state.places.get(station_id)
    if not place or place.kind != "station":
        raise ApiError(404, "station_not_found", "We don't know that station.")
    return lift_rows(session, request.app.state.places, station_id)
