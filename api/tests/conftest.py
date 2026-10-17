import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path / 't.db'}", anthropic_api_key="", uploads_dir=tmp_path / "uploads")


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c
