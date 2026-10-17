from fastapi import Request
from sqlmodel import SQLModel, Session, create_engine


def make_engine(url: str):
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args)


def init_db(engine):
    SQLModel.metadata.create_all(engine)


def get_session(request: Request):
    with Session(request.app.state.engine) as s:
        yield s
