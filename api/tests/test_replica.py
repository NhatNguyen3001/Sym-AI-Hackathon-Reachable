"""The Turso embedded replica: start-up, offline start, sync loop and concurrency. No network: fake connections."""
import asyncio
import logging
import threading
import time

import libsql
import pytest
from sqlalchemy import text

from app.db import make_engine, make_read_engine
from app.replica import NO_COPY, Replica, ReplicaUnavailable

TOKEN = "secret-token-value"


class FakeConn:
    """Stands in for a libsql embedded-replica connection; delegates SQL to a real local libsql file."""

    def __init__(self, path, fail_sync=False, sync_delay=0.0):
        self._real = libsql.connect(path)
        self.fail_sync, self.sync_delay, self.synced = fail_sync, sync_delay, 0

    def sync(self):
        if self.fail_sync:
            raise RuntimeError("no network")
        time.sleep(self.sync_delay)
        self.synced += 1

    def __getattr__(self, name):
        return getattr(self._real, name)


def fake_connect(fail_sync=False, sync_delay=0.0):
    made = []

    def connect(path, **kw):
        if kw.get("_uri"):  # read-only fallback: file:<path>?mode=ro
            return libsql.connect(path, _uri=True)
        c = FakeConn(path, fail_sync=fail_sync, sync_delay=sync_delay)
        made.append(c)
        return c
    connect.made = made
    return connect


def test_start_syncs_and_reports_fresh(tmp_path):
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=fake_connect())
    assert r.start() is True and r.offline is False


def test_start_without_turso_uses_existing_file(tmp_path, caplog):
    path = tmp_path / "rep.db"
    libsql.connect(str(path)).execute("create table t (x int)")
    r = Replica(path, "libsql://x.turso.io", TOKEN, connect=fake_connect(fail_sync=True))
    with caplog.at_level(logging.WARNING):
        assert r.start() is False
    assert r.offline is True and "last local copy" in caplog.text


def test_start_without_turso_and_no_file_raises(tmp_path, caplog):
    r = Replica(tmp_path / "missing.db", "libsql://x.turso.io", TOKEN, connect=fake_connect(fail_sync=True))
    with pytest.raises(ReplicaUnavailable) as e:
        r.start()
    assert str(e.value) == NO_COPY == ("Can't reach the Turso database and there's no local copy yet. Check "
                                       "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN, or clear them to use local SQLite.")
    assert TOKEN not in caplog.text


def test_offline_copy_is_read_only(tmp_path):
    path = tmp_path / "rep.db"
    c = libsql.connect(str(path))
    c.execute("create table t (x int)")
    c.execute("insert into t values (1)")
    c.commit()
    r = Replica(path, "libsql://x.turso.io", TOKEN, connect=fake_connect(fail_sync=True))
    r.start()
    with make_read_engine(r).connect() as conn:
        assert conn.execute(text("select count(*) from t")).scalar() == 1
        with pytest.raises(Exception):
            conn.execute(text("insert into t values (2)"))
    with pytest.raises(Exception):          # no Turso connection: saving fails clearly
        with make_engine("", replica=r).begin() as conn:
            conn.execute(text("insert into t values (2)"))


def test_sync_loop_keeps_going_after_a_failure(tmp_path):
    connect = fake_connect()
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=connect)
    r.start()
    calls = {"n": 0}
    real = r.sync

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("blip")
        real()

    r.sync = flaky

    async def go():
        task = asyncio.create_task(r.run(0.01))
        await asyncio.sleep(0.1)
        task.cancel()
    asyncio.run(go())
    assert calls["n"] >= 3


def test_concurrent_reads_during_sync(tmp_path):
    connect = fake_connect(sync_delay=0.05)
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=connect)
    r.start()
    with make_engine("", replica=r).begin() as conn:
        conn.execute(text("create table t (x int)"))
        conn.execute(text("insert into t values (1), (2), (3)"))
    eng = make_read_engine(r)
    errors, stop = [], threading.Event()

    def syncing():
        while not stop.is_set():
            r.sync()

    def reading():
        for _ in range(20):
            try:
                with eng.connect() as conn:
                    assert conn.execute(text("select count(*) from t")).scalar() == 3
            except Exception as e:  # noqa: BLE001 - any error is a failure of this test
                errors.append(repr(e))

    s = threading.Thread(target=syncing)
    s.start()
    readers = [threading.Thread(target=reading) for _ in range(8)]
    [t.start() for t in readers]
    [t.join() for t in readers]
    stop.set()
    s.join()
    assert errors == []


def test_sync_waits_for_a_quiet_moment(tmp_path):
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=fake_connect())
    r.start()
    synced, checks = [], {"n": 0}
    r.sync = lambda: synced.append(checks["n"])

    def quiet():
        checks["n"] += 1
        return checks["n"] > 5   # busy for the first five checks

    async def go():
        task = asyncio.create_task(r.run(0.01, quiet=quiet, check=0.005, max_wait=10))
        await asyncio.sleep(0.15)
        task.cancel()
    asyncio.run(go())
    assert synced and synced[0] > 5


def test_sync_is_forced_after_max_wait(tmp_path):
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=fake_connect())
    r.start()
    synced = []
    r.sync = lambda: synced.append(1)

    async def go():
        task = asyncio.create_task(r.run(0.01, quiet=lambda: False, check=0.005, max_wait=0.03))
        await asyncio.sleep(0.15)
        task.cancel()
    asyncio.run(go())
    assert synced


def replica_app(tmp_path, connect):
    from fastapi.testclient import TestClient
    from app.config import Settings
    from app.main import create_app
    from app.weather import WeatherService
    from tests.conftest import _Dry
    from tests.test_campus_graph import G, PL
    s = Settings(database_url=f"sqlite:///{tmp_path / 'unused.db'}", anthropic_api_key="", uploads_dir=tmp_path / "u",
                 router="campus", photon_url="", tfnsw_api_key="", turso_database_url="", osm_snapshot_path="", lift_poll_seconds=0)
    rep = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=connect)
    return TestClient(create_app(s, graph=G, places=PL, replica=rep,
                                 weather_service=WeatherService(http_get=lambda *a, **k: _Dry())))


def test_only_one_turso_connection_however_many_requests(tmp_path):
    connect = fake_connect()
    with replica_app(tmp_path, connect) as c:
        for _ in range(6):
            assert c.get("/updates").status_code == 200
            assert c.post("/route", json={"from": "mq-station", "to": "library"}).status_code == 200
        r = c.post("/reports", json={"lat": -33.776, "lng": 151.114, "userLabel": "stairs"})
        assert r.status_code == 200
        assert any(i["title"] == "Stairs on the path" for i in c.get("/updates").json())   # the write is readable at once
    assert len(connect.made) == 1   # reads use local read-only connections; writes and syncs share one


def test_reads_keep_working_when_turso_drops(tmp_path):
    connect = fake_connect()
    with replica_app(tmp_path, connect) as c:
        assert c.get("/updates").status_code == 200
        connect.made[0].fail_sync = True              # Turso goes away mid-run
        c.app.state.replica.sync_quietly()
        assert c.get("/updates").status_code == 200   # still served from the local copy


def test_a_session_that_never_lets_go_does_not_stall_saves_for_good(tmp_path, monkeypatch, caplog):
    monkeypatch.setattr("app.replica.LOCK_WAIT_S", 0.2)
    r = Replica(tmp_path / "rep.db", "libsql://x.turso.io", TOKEN, connect=fake_connect())
    r.start()
    eng = make_engine("sqlite://", replica=r)
    r.lock.acquire()              # a holder that is gone and will never release it
    with caplog.at_level(logging.ERROR):
        with eng.connect() as c:  # waits LOCK_WAIT_S, then takes the lock over
            assert c.execute(text("select 1")).scalar() == 1
        r.sync()                  # and the lock works normally afterwards
    assert "taking it over" in caplog.text and not r.lock.locked()