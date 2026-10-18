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


def test_many_rows_go_in_a_few_statements_not_one_each(tmp_path):
    """On Turso each statement is a network round trip with the GIL held: 5,500 map places must not be 5,500 trips."""
    from sqlalchemy import event
    from app.models import MapPlace
    eng = local_libsql(tmp_path)
    init_db(eng)
    statements = []
    event.listen(eng, "before_cursor_execute", lambda conn, cur, sql, params, ctx, many: statements.append(sql))
    with Session(eng) as s:
        for i in range(2500):
            s.add(MapPlace(id=f"place:osm-n{i}", osm_id=f"node/{i}", name="Accessible toilet", kind="toilet",
                           lat=-33.77, lng=151.11, tags={"amenity": "toilets"}, tile="t"))
        s.commit()
        assert s.get(MapPlace, "place:osm-n2499").tags == {"amenity": "toilets"}
    inserts = [q for q in statements if q.lstrip().upper().startswith("INSERT")]
    # A few multi-row INSERT ... VALUES (...), (...) statements, not one single-row statement run 2,500 times.
    assert 1 <= len(inserts) <= 6 and all("), (" in q for q in inserts)


def test_reads_under_load_never_crash_libsql(tmp_path):
    """Found 2026-10-18 ("search, then another search doesn't work"): the read engine's default pool closed its extra
    connections under load and libsql panicked (Option::unwrap on None), leaving the pool broken for later requests.
    A fixed pool that never closes connections while running has no panics."""
    import collections
    import time
    from app.db import make_read_engine
    from app.models import MapPlace
    path = tmp_path / "t.db"   # local_libsql() makes this file
    eng = local_libsql(tmp_path)
    init_db(eng)
    with Session(eng) as s:
        s.add(MapPlace(id="place:osm-n1", osm_id="node/1", name="Toilet", kind="toilet", lat=-33.77, lng=151.11,
                       tags={}, tile="t"))
        s.commit()

    class Rep:
        def read_connect(self):
            return libsql.connect(f"file:{path.as_posix()}?mode=ro", _uri=True, _check_same_thread=False)

    read = make_read_engine(Rep())
    errors, stop = collections.Counter(), time.time() + 3

    def work():
        while time.time() < stop:
            try:
                with Session(read) as s:
                    s.exec(select(MapPlace)).first()
            except BaseException as e:  # libsql's panic is a BaseException
                errors[type(e).__name__] += 1

    threads = [threading.Thread(target=work) for _ in range(20)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert dict(errors) == {}
