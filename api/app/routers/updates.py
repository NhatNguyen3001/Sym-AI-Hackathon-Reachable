from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.db import get_session
from app.feed import build_updates

router = APIRouter()


@router.get("/updates")
def updates(request: Request, type: str | None = None, session: Session = Depends(get_session)):
    return build_updates(session, request.app.state.weather.current(), type)
