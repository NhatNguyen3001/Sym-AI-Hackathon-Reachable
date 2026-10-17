from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.transit.tfnsw import TransitUnavailable
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL

LIB, MORT = (-33.775688, 151.113509), (-33.772053, 151.11663)


def campus_trip(depart_in_min=15, ride_min=6):
    """A small made-up journey on campus: Library, bus 141 two stops, Mortarboard Cafe."""
    dep = datetime.now(timezone.utc) + timedelta(minutes=depart_in_min)
    arr = dep + timedelta(minutes=ride_min)
    z = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
    walk = lambda a, b, secs: {"duration": secs, "transportation": {"product": {"class": 100}},
                               "origin": {"coord": list(a)}, "destination": {"coord": list(b)}, "coords": [list(a), list(b)]}
    s1, s2 = (-33.77600, 151.11420), (-33.77260, 151.11600)
    ride = {"duration": ride_min * 60, "transportation": {"disassembledName": "141", "product": {"class": 5},
                                                         "destination": {"name": "Manly"}},
            "origin": {"name": "Library Rd, Stand A", "coord": list(s1), "departureTimeEstimated": z(dep),
                       "parent": {"id": "2113001", "type": "stop"}, "properties": {"platformName": "Stand A"}},
            "destination": {"name": "Mortarboard Stop", "coord": list(s2), "arrivalTimeEstimated": z(arr),
                            "parent": {"id": "2113002", "type": "stop"}, "properties": {}},
            "stopSequence": [{}, {}, {}], "properties": {"PlanWheelChairAccess": "1"}, "coords": [list(s1), list(s2)]}
    return {"journeys": [{"interchanges": 0, "legs": [walk(LIB, s1, 120), ride, walk(s2, MORT, 120)]}]}


class FakeTfnsw:
    def __init__(self, raw=None, fail=False):
        self.raw, self.fail = raw, fail

    def trip(self, *a):
        if self.fail:
            raise TransitUnavailable("down")
        return self.raw or campus_trip()

    def lift_alerts(self):
        return []

    def stop_coord(self, _):
        return None


def make(tmp_path, tfnsw, **kw):
    s = Settings(database_url=f"sqlite:///{tmp_path / 't.db'}", anthropic_api_key="", uploads_dir=tmp_path / "u",
                 router="campus", photon_url="", tfnsw_api_key="", turso_database_url="", transit_min_km=0.3,
                 lift_poll_seconds=0, **kw)
    return TestClient(create_app(s, graph=G, places=PL, tfnsw=tfnsw,
                                 weather_service=WeatherService(http_get=lambda *a, **k: _Dry())))


BODY = {"from": "library", "to": "mortarboard-cafe", "profile": {"aid": "manual_wheelchair", "maxSlope": 5}}


def test_route_lists_walk_and_transit_options(tmp_path):
    with make(tmp_path, FakeTfnsw()) as c:
        r = c.post("/route", json=BODY).json()
    assert r["ok"] and r["accessible"] is not None              # old fields still describe the walk
    modes = [o["mode"] for o in r["options"]]
    assert modes[0] == "walk" and "transit" in modes            # short campus walk wins
    t = next(o for o in r["options"] if o["mode"] == "transit")
    assert [l["kind"] for l in t["legs"]] == ["walk", "ride", "walk"] and t["legs"][1]["label"] == "Bus 141"
    assert t["explanation"].startswith("Walk ") and "Bus 141" in t["explanation"]
    assert "unsure" not in t and "transitNote" not in r


def test_transit_only_when_too_far_is_shown_as_ok(tmp_path, monkeypatch):
    with make(tmp_path, FakeTfnsw()) as c:
        st = c.app.state
        real = st.campus.plan
        monkeypatch.setattr(st.campus, "plan", lambda s, e, p, ctx: (
            {"ok": False, "reason": "This is too far to walk or roll. Try public transport.", "suggestion": "x",
             "fastest": None} if (s.id, e.id) == ("library", "mortarboard-cafe") else real(s, e, p, ctx)))
        r = c.post("/route", json=BODY).json()
    assert r["ok"] is True and r["accessible"] is None and r["steps"] == []
    assert [o["mode"] for o in r["options"]] == ["transit"] and "Bus 141" in r["explanation"]


def test_tfnsw_down_gives_walk_and_a_note(tmp_path):
    with make(tmp_path, FakeTfnsw(fail=True)) as c:
        r = c.post("/route", json=BODY).json()
    assert r["ok"] and [o["mode"] for o in r["options"]] == ["walk"]
    assert r["transitNote"] == "Public transport options unavailable right now."


def test_no_key_means_walk_only(tmp_path):
    with make(tmp_path, None) as c:
        r = c.post("/route", json=BODY).json()
    assert [o["mode"] for o in r["options"]] == ["walk"] and "transitNote" not in r
    assert r["options"][0]["legs"][0]["steps"] == r["steps"]


def test_short_trip_does_not_ask_tfnsw(tmp_path):
    class Boom(FakeTfnsw):
        def trip(self, *a):
            raise AssertionError("should not be called")
    with make(tmp_path, Boom()) as c:
        r = c.post("/route", json={**BODY, "to": "library-cafe"}).json()
    assert r["ok"] and [o["mode"] for o in r["options"]] == ["walk"]
