"""Demo sandbox (cycle 7): about 80 judges test the map at once, each on their own phone. What a judge does (reports,
the rain toggle) changes only their own map, routes and live updates, and never reaches the real database."""
import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.main import create_app
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL

A, B = {"X-Session": "judge-a"}, {"X-Session": "judge-b"}
SPOT = {"lat": -33.77598, "lng": 151.11391}  # on the campus path to the library


@pytest.fixture
def sandbox(settings):
    app = create_app(settings.model_copy(update={"demo_sandbox": True}), graph=G, places=PL,
                     weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))
    with TestClient(app) as c:
        yield c


def report(c, headers, label="blocked"):
    r = c.post("/reports", json={"photoUrl": None, **SPOT, "userLabel": label, "note": ""}, headers=headers)
    assert r.status_code == 200
    return r.json()


def titles(c, headers):
    return [i["title"] for i in c.get("/updates", headers=headers).json()]


def test_a_judges_report_shows_only_on_their_phone(sandbox):
    before = titles(sandbox, B)
    report(sandbox, A)
    assert "Footpath blocked" in titles(sandbox, A)
    assert titles(sandbox, B) == before


def test_a_judges_rain_toggle_only_rains_on_them(sandbox):
    assert sandbox.post("/demo/rain", headers=A).json()["raining"] is True
    assert sandbox.get("/weather", headers=A).json()["raining"] is True
    assert sandbox.get("/weather", headers=B).json()["raining"] is False


def test_a_judges_barrier_changes_only_their_route(sandbox):
    trip = {"from": "mq-station", "to": "library"}
    a0 = sandbox.post("/route", json=trip, headers=A).json()
    b0 = sandbox.post("/route", json=trip, headers=B).json()
    for _ in range(2):  # a matching second report confirms the barrier
        report(sandbox, A)
    a1 = sandbox.post("/route", json=trip, headers=A).json()
    b1 = sandbox.post("/route", json=trip, headers=B).json()
    assert b1["barriers"] == b0["barriers"]
    assert len(a1["barriers"]) > len(a0["barriers"])


def test_nothing_from_the_sandbox_is_written_to_the_database(sandbox):
    writes = []
    event.listen(sandbox.app.state.engine, "commit", lambda conn: writes.append(1))
    report(sandbox, A)
    report(sandbox, A, label="fine")
    sandbox.post("/demo/rain", headers=A)
    time.sleep(0.2)  # the report check runs after the response
    assert writes == []


def test_live_events_from_a_sandbox_go_only_to_that_phone(sandbox):
    bc = sandbox.app.state.broadcaster

    async def run():
        got_a, got_b = [], []

        async def listen(session, out):
            async for e in bc.subscribe(session):
                out.append(e["event"])

        ta = asyncio.create_task(listen("judge-a", got_a))
        tb = asyncio.create_task(listen("judge-b", got_b))
        await asyncio.sleep(0.01)
        await bc.publish("barrier_changed", {"x": 1}, session="judge-a")
        await bc.publish("lift_changed", {"x": 2})   # shared: everyone
        await asyncio.sleep(0.01)
        ta.cancel(), tb.cancel()
        return got_a, got_b

    got_a, got_b = asyncio.run(run())
    assert got_a == ["barrier_changed", "lift_changed"]
    assert got_b == ["lift_changed"]


def test_without_the_sandbox_reports_are_shared_as_before(client):
    r = client.post("/reports", json={"photoUrl": None, **SPOT, "userLabel": "blocked", "note": ""}, headers=A)
    assert r.status_code == 200
    time.sleep(0.2)
    assert "Footpath blocked" in [i["title"] for i in client.get("/updates", headers=B).json()]
