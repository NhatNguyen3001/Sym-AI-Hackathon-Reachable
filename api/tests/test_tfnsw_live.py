"""Live tests against the real Transport for NSW API. Skipped without TFNSW_API_KEY in api/.env.
The trip test also needs the local Valhalla container for the walks to and from the stations."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.transit.parse import Ride, parse_alert, parse_journeys
from app.transit.tfnsw import TfnswClient
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL

S = Settings()
pytestmark = [pytest.mark.tfnsw, pytest.mark.skipif(not S.tfnsw_api_key, reason="TFNSW_API_KEY not set")]


def _valhalla_up() -> bool:
    try:
        return httpx.get(f"{S.valhalla_url}/status", timeout=2).status_code == 200
    except httpx.HTTPError:
        return False


def test_real_trip_parses():
    js = parse_journeys(TfnswClient(S.tfnsw_url, S.tfnsw_api_key).trip(-33.8731, 151.2070, -33.7969, 151.1810))
    assert js and any(isinstance(l, Ride) for j in js for l in j.legs)


def test_real_lift_alerts_parse():
    alerts = [parse_alert(i) for i in TfnswClient(S.tfnsw_url, S.tfnsw_api_key).lift_alerts()]
    assert all(a.id and a.text for a in alerts)


@pytest.mark.skipif(not _valhalla_up(), reason="Valhalla container not running")
def test_real_door_to_door_trip(tmp_path):
    s = Settings(database_url=f"sqlite:///{tmp_path / 'live.db'}", anthropic_api_key="", uploads_dir=tmp_path / "u",
                 router="valhalla", photon_url="", turso_database_url="", lift_poll_seconds=0)
    app = create_app(s, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))
    with TestClient(app) as c:
        r = c.post("/route", json={"from": "coord:-33.8755,151.2065", "to": "coord:-33.7969,151.1810"}).json()
    assert r["ok"], r
    t = next(o for o in r["options"] if o["mode"] == "transit")
    assert any(l["kind"] == "ride" for l in t["legs"]) and t["legs"][0]["kind"] == "walk"
    print("\n", t["summary"], "|", t["minutes"], "min |", r["explanation"])
