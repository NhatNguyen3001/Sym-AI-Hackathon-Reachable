import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.weather import WeatherService
from tests.test_campus_graph import G, PL


class _Dry:
    status_code = 200

    def json(self):
        return {"current": {"precipitation": 0.0, "weather_code": 1}}

    def raise_for_status(self):
        pass


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path / 't.db'}", anthropic_api_key="", uploads_dir=tmp_path / "uploads")


@pytest.fixture
def app(settings):
    return create_app(settings, graph=G, places=PL, weather_service=WeatherService(http_get=lambda *a, **k: _Dry()))


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
