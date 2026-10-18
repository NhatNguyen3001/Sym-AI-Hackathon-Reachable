import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.weather import WeatherService
from tests.test_campus_graph import G, PL
from app.transit.lifts import LiftAlertSync
from app.transit.parse import LiftAlert

SOUTH_OUT = LiftAlert(id="ems-test-south", text="Macquarie University Station Lift 2 is not available", url=None,
                      station="Macquarie University Station", stop_ids=["211310"], osm_ids={9756349250})
NORTH_OUT = LiftAlert(id="ems-test-north", text="Macquarie University Station Lift 1 is not available", url=None,
                      station="Macquarie University Station", stop_ids=["211310"], osm_ids={9756349221})


class _Dry:
    status_code = 200

    def json(self):
        return {"current": {"precipitation": 0.0, "weather_code": 1}}

    def raise_for_status(self):
        pass


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path / 't.db'}", anthropic_api_key="", uploads_dir=tmp_path / "uploads",
                    router="campus", photon_url="", tfnsw_api_key="",
                    turso_database_url="", osm_snapshot_path="")


@pytest.fixture
def app(settings):
    return create_app(settings, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def lifts_live(app, client):
    """Fresh live lift data with the south exit lift out (what the old demo seed showed). Call it to change alerts."""
    from sqlmodel import Session
    from app.models import now
    st = app.state
    st.lift_feed.enabled, st.lift_feed.last_ok = True, now()
    sync = LiftAlertSync(st.places)

    def set_alerts(alerts):
        with Session(st.engine) as s:
            sync.sync(s, alerts)
    set_alerts([SOUTH_OUT])
    return set_alerts


@pytest.fixture
def campus_roadwork(app, client):
    """A Claude-checked roadwork on Management Drive (what the map agent stores), for report-checker tests."""
    from sqlmodel import Session
    from app.models import Barrier
    from app.routing.graph import nearest_edge
    edge, _ = nearest_edge(app.state.graph, -33.77215, 151.11590)
    with Session(app.state.engine) as s:
        s.add(Barrier(id="lt-test-1", type="roadworks", title="Footpath works", place="Management Drive, Macquarie Park",
                      lat=-33.77215, lng=151.11590, edge_id=edge, status="confirmed", confidence=0.8,
                      update_type="roadworks", sources=[{"kind": "feed", "label": "Live Traffic NSW, checked by Claude",
                                                         "url": None, "text": "The footpath is closed; use the other side."}]))
        s.commit()
