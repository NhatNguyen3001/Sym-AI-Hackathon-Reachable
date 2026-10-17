from fastapi import Request
from sqlmodel import SQLModel, Session, create_engine


def make_engine(url: str, turso_url: str = "", turso_token: str = ""):
    """Turso when TURSO_DATABASE_URL is set, else the local SQLite DATABASE_URL."""
    if turso_url:
        import libsql
        import app.libsql_dialect  # noqa: F401  registers sqlite+libsql
        return create_engine("sqlite+libsql://", pool_pre_ping=True,
                             creator=lambda: libsql.connect(database=turso_url, auth_token=turso_token))
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args)


def init_db(engine):
    SQLModel.metadata.create_all(engine)


def get_session(request: Request):
    with Session(request.app.state.engine) as s:
        yield s
