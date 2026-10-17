import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.routing.valhalla import OutOfArea, RoutingUnavailable
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL


class FakeRouter:
    def __init__(self, exc=None, result=None):
        self.exc, self.result, self.calls = exc, result, []

    def plan(self, start, end, profile, ctx):
        self.calls.append((start, end))
        if self.exc:
            raise self.exc
        return self.result


@pytest.fixture
def make_client(settings):
    def make(router):
        app = create_app(settings, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()),
                         router=router)
        return TestClient(app)
    return make


def test_valhalla_down_campus_trip_still_works(make_client):
    with make_client(FakeRouter(exc=RoutingUnavailable("down"))) as c:
        r = c.post("/route", json={"from": "mq-station", "to": "library"}).json()
    assert r["ok"] is True and r["exitUsed"] == "north"


def test_valhalla_down_off_campus_503(make_client):
    with make_client(FakeRouter(exc=RoutingUnavailable("down"))) as c:
        r = c.post("/route", json={"from": "coord:-33.8732,151.2066", "to": "coord:-33.8661,151.2129"})
    assert r.status_code == 503
    assert r.json()["error"] == {"code": "routing_unavailable",
                                 "message": "Route planning is unavailable right now. Please try again soon."}


def test_out_of_area_422(make_client):
    with make_client(FakeRouter(exc=OutOfArea("x"))) as c:
        r = c.post("/route", json={"from": "coord:-37.81,144.96", "to": "library"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "out_of_area"
    assert r.json()["error"]["message"] == "We only cover Greater Sydney for now."


def test_valhalla_result_is_used_and_passed_context(make_client):
    result = {"ok": True, "accessible": {"geometry": {"type": "LineString", "coordinates": [[151.2066, -33.8732], [151.2129, -33.8661]]},
                                         "distanceM": 900, "minutes": 15, "maxSlope": 2, "stepFree": True},
              "fastest": None, "minutesLonger": 0, "steps": [], "exitUsed": None}
    fake = FakeRouter(result=result)
    with make_client(fake) as c:
        r = c.post("/route", json={"from": "coord:-33.8732,151.2066", "to": "coord:-33.8661,151.2129"}).json()
    assert r["ok"] is True and r["accessible"]["distanceM"] == 900 and "note" not in r
    start, end = fake.calls[0]
    assert (start.lat, start.lng) == (-33.8732, 151.2066)


def test_mq_station_place_has_exit_points():
    st = PL.get("mq-station")
    assert [e["id"] for e in st.exit_points] == ["north", "south"]
    assert all(-34 < e["lat"] < -33 and e["via"] == "lift" for e in st.exit_points)


def test_same_start_and_end(client):
    r = client.post("/route", json={"from": "library", "to": "library"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False and body["reason"] == "Start and destination are the same place."


def test_bad_coord_is_404(client):
    r = client.post("/route", json={"from": "coord:abc", "to": "library"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "place_not_found"


def test_campus_trips_use_campus_router_even_when_valhalla_is_up(make_client):
    fake = FakeRouter(result={"ok": False, "reason": "should not be used", "suggestion": ""})
    with make_client(fake) as c:
        r = c.post("/route", json={"from": "mq-station", "to": "library"}).json()
    assert fake.calls == [] and r["ok"] is True and r["exitUsed"] == "north" and "note" not in r


def test_slope_note_passed_through(make_client):
    result = {"ok": True, "accessible": {"geometry": {"type": "LineString", "coordinates": [[151.2066, -33.8732], [151.2129, -33.8661]]},
                                         "distanceM": 900, "minutes": 15, "maxSlope": 2, "stepFree": True, "slopeEstimated": True},
              "fastest": None, "minutesLonger": 0, "steps": [], "exitUsed": None, "slopeNote": "Slopes are estimates."}
    with make_client(FakeRouter(result=result)) as c:
        r = c.post("/route", json={"from": "coord:-33.8732,151.2066", "to": "coord:-33.8661,151.2129"}).json()
    assert r["slopeNote"] == "Slopes are estimates." and r["accessible"]["slopeEstimated"] is True
