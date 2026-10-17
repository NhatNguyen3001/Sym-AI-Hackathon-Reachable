import logging
import time

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.main import create_app
from app.mapdata.agent import MapAgent
from app.models import Barrier, MapPlace
from app.weather import WeatherService
from tests.conftest import _Dry
from tests.test_campus_graph import G, PL

KEY = "test-owner-key-123"


class SlowOverpass:
    """One tile with one toilet, slow enough to see the run in progress."""

    def accessible_places(self, bbox, sleep=None):
        time.sleep(0.3)
        return [{"type": "node", "id": 42, "lat": -33.7757, "lon": 151.1133,
                 "tags": {"amenity": "toilets", "wheelchair": "yes", "name": "Library toilet"}}]


def make(settings, **over):
    s = settings.model_copy(update=over)
    return create_app(s, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))


@pytest.fixture
def owner(settings):
    with TestClient(make(settings, admin_key=KEY)) as c:
        st = c.app.state
        st.map_agent = MapAgent(st.engine, SlowOverpass(), None, None, st.graph, tiles_=[(151.0, -33.9, 151.3, -33.6)])
        yield c


def press(c, key=KEY):
    return c.post("/agents/map/run", headers={"X-Admin-Key": key} if key is not None else {})


def wait_done(c):
    for _ in range(100):
        s = c.get("/agents/map/status").json()
        if not s["running"]:
            return s
        time.sleep(0.05)
    raise AssertionError("map agent never finished")


def test_run_is_off_without_an_admin_key(client):
    r = press(client)
    assert r.status_code == 403 and r.json()["error"]["code"] == "off"


def test_wrong_or_missing_key_is_refused_without_hints(owner, caplog):
    caplog.set_level(logging.DEBUG)
    for key in ("nope", None):
        r = press(owner, key)
        assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
        assert KEY not in r.text
    assert KEY not in caplog.text


def test_paused(settings):
    with TestClient(make(settings, admin_key=KEY, map_agent_paused=True)) as c:
        r = press(c)
        assert r.status_code == 403 and r.json()["error"] == {"code": "paused", "message": "Map updates are paused"}
        assert c.get("/agents/map/status").json()["paused"] is True


def test_run_starts_in_the_background_and_one_at_a_time(owner, caplog):
    caplog.set_level(logging.DEBUG)
    r = press(owner)
    assert r.status_code == 202 and r.json() == {"started": True}
    assert press(owner).status_code == 409
    s = wait_done(owner)
    assert s["places"] == 1 and s["lastRun"] and s["failed"] == ["roadworks"] and s["paused"] is False
    assert KEY not in caplog.text


def test_status_shape(client):
    s = client.get("/agents/map/status").json()
    assert set(s) == {"lastRun", "running", "places", "roadworks", "checked", "failed", "snapshot", "paused"}


def add_places(app, rows):
    with Session(app.state.engine) as s:
        for i, (lat, lng, kind, tags) in enumerate(rows):
            s.add(MapPlace(id=f"place:osm-n{i + 1}", osm_id=f"node/{i + 1}", name=f"Place {i + 1}", kind=kind,
                           lat=lat, lng=lng, tags=tags, tile="t"))
        s.commit()


TOILET = {"amenity": "toilets", "wheelchair": "yes"}


def test_places_in_view(client, app):
    add_places(app, [(-33.7757, 151.1133, "toilet", TOILET), (-33.87, 151.21, "parking",
                                                              {"amenity": "parking_space", "parking_space": "disabled"})])
    pins = client.get("/map/places", params={"bbox": "151.10,-33.78,151.12,-33.77"}).json()
    assert pins == [{"id": "place:osm-n1:pin", "placeId": "place:osm-n1", "name": "Place 1", "kind": "toilet",
                     "label": "Accessible toilet", "lat": -33.7757, "lng": 151.1133, "source": "OpenStreetMap"}]
    assert client.get("/map/places", params={"bbox": "nonsense"}).status_code == 422


def test_places_are_capped(client, app, monkeypatch):
    monkeypatch.setattr("app.routers.mapdata.MAX_PINS", 3)
    add_places(app, [(-33.7757 + i * 0.0001, 151.1133, "toilet", TOILET) for i in range(5)])
    assert len(client.get("/map/places", params={"bbox": "151.0,-33.9,151.3,-33.6"}).json()) == 3


def test_a_place_pin_can_be_routed_to_even_after_a_restart(settings):
    app = make(settings)
    with TestClient(app) as c:
        add_places(app, [(-33.7757, 151.1133, "toilet", TOILET)])
        r = c.post("/route", json={"from": "mq-station", "to": "place:osm-n1"})
        assert r.status_code == 200 and r.json()["ok"] is True
    with TestClient(make(settings)) as c:  # same database, fresh server
        assert c.post("/route", json={"from": "mq-station", "to": "place:osm-n1"}).status_code == 200


def test_venue_check_for_an_openstreetmap_place(client, app):
    add_places(app, [(-33.7757, 151.1133, "toilet", TOILET),
                     (-33.7758, 151.1134, "venue", {"shop": "books", "wheelchair": "limited"})])
    v = client.get("/venue/place:osm-n1/check").json()
    assert v["checkedBy"] == "Map agent" and v["name"] == "Place 1"
    assert dict((c["field"], c["status"]) for c in v["checks"]) == {
        "Level entrance": "Likely", "Step-free inside": "Likely", "Accessible toilet": "Likely"}
    assert v["sources"][0]["label"].startswith("OpenStreetMap, ")
    assert v["sources"][0]["url"] == "https://www.openstreetmap.org/node/1"
    lim = client.get("/venue/place:osm-n2/check").json()
    assert dict((c["field"], c["status"]) for c in lim["checks"]) == {
        "Level entrance": "Not sure", "Step-free inside": "Not sure", "Accessible toilet": "Not checked"}


def test_a_claude_roadwork_carries_its_sentence_in_the_feed(client, campus_roadwork):
    item = next(i for i in client.get("/updates").json() if i["id"] == "lt-test-1")
    assert item["detail"] == "The footpath is closed; use the other side."
    assert item["source"] == "Live Traffic NSW, checked by Claude"


def test_other_updates_have_no_detail(client):
    assert all("detail" not in i for i in client.get("/updates").json())


def test_barrier_model_unchanged_for_reports(app):
    assert "detail" not in Barrier.model_fields


def test_browser_test_hooks(settings):
    with TestClient(make(settings, seed_map_places=True, map_agent_fake=True, admin_key=KEY)) as c:
        assert len(c.get("/map/places", params={"bbox": "151.0,-33.9,151.3,-33.6"}).json()) == 40
        assert press(c).status_code == 202
        s = wait_done(c)
        assert s["places"] == 40 and s["roadworks"] == 1 and s["failed"] == []


def test_a_zoomed_out_sydney_box_returns_every_place(client, app):
    """Zoomed out over Sydney the map asks for the whole box: all ~5,500 places, not the southern 2,000."""
    add_places(app, [(-34.1 + i * 0.0002, 151.1, "toilet", TOILET) for i in range(2500)])
    pins = client.get("/map/places", params={"bbox": "150.5,-34.2,151.4,-33.4"}).json()
    assert len(pins) == 2500
