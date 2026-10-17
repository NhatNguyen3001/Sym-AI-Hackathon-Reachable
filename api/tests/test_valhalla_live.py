"""Live tests against the local Valhalla container (docker compose up valhalla). Skipped when it isn't running."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL

VALHALLA = Settings().valhalla_url


def _up() -> bool:
    try:
        return httpx.get(f"{VALHALLA}/status", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = [pytest.mark.valhalla, pytest.mark.skipif(not _up(), reason="Valhalla container not running")]


@pytest.fixture
def live(tmp_path):
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'live.db'}", anthropic_api_key="", uploads_dir=tmp_path / "u",
                        router="valhalla", photon_url="")
    app = create_app(settings, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("name,a,b", [
    ("Town Hall station to State Library", (-33.8732, 151.2066), (-33.8661, 151.2129)),
    ("Parramatta station to Westfield Parramatta", (-33.8173, 151.0045), (-33.8174, 151.0026)),
    ("Central station to Town Hall", (-33.8830, 151.2063), (-33.8732, 151.2066)),
])
def test_sydney_trip_is_step_free(live, name, a, b):
    r = live.post("/route", json={"from": f"coord:{a[0]},{a[1]}", "to": f"coord:{b[0]},{b[1]}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True, body
    assert body["accessible"]["stepFree"] is True
    assert body["accessible"]["slopeEstimated"] is True and body["slopeNote"]
    assert body["accessible"]["distanceM"] > 100 and body["steps"]


def test_macquarie_demo_trip_uses_campus_router(live):
    body = live.post("/route", json={"from": "mq-station", "to": "library"}).json()
    assert body["ok"] is True and body["exitUsed"] == "north" and "slopeNote" not in body
    assert body["accessible"]["maxSlope"] <= 5


def test_outside_greater_sydney_is_422(live):
    r = live.post("/route", json={"from": "coord:-37.8136,144.9631", "to": "coord:-37.8183,144.9671"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "out_of_area"


def test_too_long_walk_is_ok_false(live):
    body = live.post("/route", json={"from": "coord:-33.8732,151.2066", "to": "coord:-33.7765,151.1160"}).json()
    assert body["ok"] is False and "too far to walk or roll" in body["reason"]


def test_town_hall_to_chatswood_suggests_public_transport(live):
    # 8.8 km straight line, about 11.5 km on foot: a train trip, not a walk.
    body = live.post("/route", json={"from": "coord:-33.8732,151.2066", "to": "coord:-33.7969,151.1803"}).json()
    assert body["ok"] is False and "public transport" in body["reason"]
