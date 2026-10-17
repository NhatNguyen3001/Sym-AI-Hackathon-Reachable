"""The Turso driver (libsql) through our SQLAlchemy dialect, on a local libsql file: no network."""
import threading
from datetime import timezone

import libsql
from sqlalchemy import create_engine
from sqlmodel import Session, select

import app.libsql_dialect  # noqa: F401  registers sqlite+libsql
from app.db import init_db, make_engine
from app.models import Barrier, aware
from app.seed import seed
from tests.test_campus_graph import G, PL


def local_libsql(tmp_path):
    return create_engine("sqlite+libsql://", creator=lambda: libsql.connect(str(tmp_path / "t.db")))


def test_schema_seed_json_and_threads_work_on_libsql(tmp_path):
    eng = local_libsql(tmp_path)
    init_db(eng)
    with Session(eng) as s:
        seed(s, G, PL)
        b = s.exec(select(Barrier).where(Barrier.place == "Herring Road crossing")).first()
        assert b.sources[0]["label"] == "One user report, no photo yet"  # JSON column round-trips
        assert aware(b.first_seen).tzinfo == timezone.utc
        b.status = "resolved"
        s.add(b)
        s.commit()
        bid = b.id
    seen = []

    def other_thread():
        with Session(eng) as s2:
            seen.append(s2.get(Barrier, bid).status)
    t = threading.Thread(target=other_thread)
    t.start()
    t.join()
    assert seen == ["resolved"]


def test_make_engine_picks_the_database():
    assert make_engine("sqlite:///x.db").dialect.driver == "pysqlite"
    turso = make_engine("sqlite:///x.db", turso_url="libsql://x.turso.io", turso_token="t")  # no connection yet
    assert turso.dialect.driver == "libsql"


def test_health_says_which_database(client):
    assert client.get("/health").json() == {"ok": True, "db": "sqlite"}
