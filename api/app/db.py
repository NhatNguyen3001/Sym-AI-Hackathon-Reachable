from fastapi import Request
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine


def make_engine(url: str, turso_url: str = "", turso_token: str = "", replica=None):
    """Turso through its local replica when one is given, else Turso direct, else the local SQLite DATABASE_URL."""
    if replica is not None:
        # Writes (and anything run in a write session) go through the one Turso connection, one session at a time.
        import app.libsql_dialect  # noqa: F401  registers sqlite+libsql
        eng = create_engine("sqlite+libsql://", creator=replica.write_connect, poolclass=StaticPool)
        event.listen(eng, "checkout", lambda *_: replica.acquire())
        event.listen(eng, "checkin", lambda *_: replica.lock.release())
        return eng
    if turso_url:
        import libsql
        import app.libsql_dialect  # noqa: F401  registers sqlite+libsql
        return create_engine("sqlite+libsql://", pool_pre_ping=True,
                             creator=lambda: libsql.connect(database=turso_url, auth_token=turso_token))
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args)


def make_read_engine(replica):
    """Reads from the local copy of Turso: read-only, no network."""
    import app.libsql_dialect  # noqa: F401  registers sqlite+libsql
    return create_engine("sqlite+libsql://", pool_pre_ping=True, creator=replica.read_connect)


def init_db(engine):
    SQLModel.metadata.create_all(engine)


def get_session(request: Request):
    """For requests that only read (most of them): the local copy when Turso is on."""
    with Session(request.app.state.read_engine) as s:
        yield s


def get_write_session(request: Request):
    """For the few requests that save something."""
    with Session(request.app.state.engine) as s:
        yield s
