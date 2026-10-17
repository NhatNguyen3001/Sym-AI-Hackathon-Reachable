from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite hands back naive datetimes; everything we store is UTC."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def uid() -> str:
    return uuid4().hex


class Barrier(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    type: str
    title: str
    place: str
    lat: float
    lng: float
    edge_id: str | None = None
    exit_id: str | None = None
    status: str = "needs_checking"
    confidence: float = 0.4
    sources: list = Field(default_factory=list, sa_column=Column(JSON))
    update_type: str = "report"
    first_seen: datetime = Field(default_factory=now)
    last_confirmed: datetime = Field(default_factory=now)


class Report(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    photo_url: str | None = None
    ai_label: str | None = None
    user_label: str
    note: str = ""
    lat: float
    lng: float
    status: str = "pending"
    barrier_id: str | None = None
    created_at: datetime = Field(default_factory=now)


class Venue(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    address: str = ""
    lat: float
    lng: float
    entrance: str = "unknown"
    toilet: str = "unknown"
    parking: str = "unknown"
    step_free_inside: str = "unknown"
    confidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    sources: list = Field(default_factory=list, sa_column=Column(JSON))
    checked_at: datetime = Field(default_factory=now)
    checked_by: str = "Sym agent"


class AgentRun(SQLModel, table=True):
    id: str = Field(default_factory=uid, primary_key=True)
    agent: str
    started_at: datetime = Field(default_factory=now)
    finished_at: datetime | None = None
    status: str = "done"
    summary: str = ""
