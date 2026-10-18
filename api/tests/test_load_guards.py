"""Ready for a room of judges (cycle 7): ~80 phones at once. Transport for NSW allows 5 requests a second on the
default plan, Photon is a fair-use service, and the Sydney places list is large."""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from app.places.photon import PhotonClient
from app.transit.tfnsw import TfnswClient, TransitUnavailable


class SlowTfnsw:
    """Counts calls and the times they were made; each call takes 50 ms."""
    def __init__(self):
        self.calls, self.times, self.lock = 0, [], threading.Lock()

    def get(self, url, params=None, headers=None):
        with self.lock:
            self.calls += 1
            self.times.append(time.monotonic())
        time.sleep(0.05)
        return httpx.Response(200, json={"journeys": []}, request=httpx.Request("GET", url))


def test_twenty_judges_asking_for_the_same_trip_cost_one_call():
    http = SlowTfnsw()
    c = TfnswClient("https://x", "k", http=http)
    with ThreadPoolExecutor(20) as pool:
        list(pool.map(lambda _: c.trip(-33.7757, 151.1135, -33.7720, 151.1166), range(20)))
    assert http.calls == 1


def test_different_trips_stay_under_five_calls_a_second():
    http = SlowTfnsw()
    c = TfnswClient("https://x", "k", http=http)
    with ThreadPoolExecutor(20) as pool:
        list(pool.map(lambda i: c.trip(-33.7757, 151.1135, -33.70 - i * 0.01, 151.1166), range(15)))
    assert http.calls == 15
    t = sorted(http.times)
    for i in range(len(t) - 5):   # any 6 calls in a row span at least about a second
        assert t[i + 5] - t[i] >= 0.95


def test_a_long_wait_gives_the_usual_unavailable_note(monkeypatch):
    monkeypatch.setattr("app.transit.tfnsw.LIMIT_WAIT_S", 0.3)
    http = SlowTfnsw()
    c = TfnswClient("https://x", "k", http=http)
    results = []

    def go(i):
        try:
            c.trip(-33.7757, 151.1135, -33.60 - i * 0.01, 151.1166)
            results.append("ok")
        except TransitUnavailable:
            results.append("busy")

    with ThreadPoolExecutor(12) as pool:
        list(pool.map(go, range(12)))
    assert "busy" in results and results.count("ok") <= 8


class Photon:
    def __init__(self):
        self.calls = 0

    def get(self, url, params=None, headers=None):
        self.calls += 1
        return httpx.Response(200, json={"features": []}, request=httpx.Request("GET", url))


def test_the_same_search_twice_asks_photon_once():
    http = Photon()
    c = PhotonClient("https://photon", http=http)
    bbox = (149.97, -34.33, 151.63, -32.99)
    c.search("macquarie centre", bbox, 8)
    c.search("Macquarie Centre ", bbox, 8)
    assert http.calls == 1


def test_sydney_places_are_cached_and_compressed(client):
    r = client.get("/map/places", params={"bbox": "150.5,-34.2,151.4,-33.4"}, headers={"Accept-Encoding": "gzip"})
    assert r.headers["cache-control"] == "public, max-age=300"


def test_places_list_is_gzipped_when_large(client, app):
    from sqlmodel import Session
    from app.models import MapPlace
    with Session(app.state.engine) as s:
        for i in range(200):
            s.add(MapPlace(id=f"place:osm-n{i}", osm_id=f"node/{i}", name="Accessible toilet", kind="toilet",
                           lat=-33.77, lng=151.11, tags={}, tile="t"))
        s.commit()
    r = client.get("/map/places", params={"bbox": "150.5,-34.2,151.4,-33.4"}, headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"


def test_in_the_sandbox_opening_a_searched_place_saves_nothing(settings):
    from fastapi.testclient import TestClient
    from sqlalchemy import event
    from app.main import create_app
    from app.routing.places import Place
    from app.weather import WeatherService
    from tests.conftest import _Dry
    from tests.test_campus_graph import G, PL
    app = create_app(settings.model_copy(update={"demo_sandbox": True}), graph=G, places=PL,
                     weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))
    with TestClient(app) as c:
        p = Place(id="osm:N42", name="Somewhere", kind="venue", lat=-33.776, lng=151.114)
        c.app.state.resolver._recent[p.id] = p
        writes = []
        event.listen(c.app.state.engine, "commit", lambda conn: writes.append(1))
        assert c.get("/places/osm:N42", headers={"X-Session": "judge-a"}).status_code == 200
        time.sleep(0.2)
        assert writes == []


def test_the_sydney_places_list_is_built_once_and_reused(client, app, monkeypatch):
    """80 phones opening the map at once all ask for the same Sydney box: build it once, not 80 times."""
    import app.routers.mapdata as m
    built = []
    real = m._build_places
    monkeypatch.setattr(m, "_build_places", lambda session, box: built.append(box) or real(session, box))
    for _ in range(5):
        assert client.get("/map/places", params={"bbox": "150.5,-34.2,151.4,-33.4"}).status_code == 200
    assert len(built) == 1


def test_a_map_agent_run_refreshes_the_places_list(client, app):
    import app.routers.mapdata as m
    client.get("/map/places", params={"bbox": "150.5,-34.2,151.4,-33.4"})
    assert app.state.places_cache
    m.forget_places(app.state)
    assert not app.state.places_cache
