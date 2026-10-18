"""Live check against the real Turso database. Read-only: never writes. Skipped without credentials."""
import pytest
from sqlalchemy import text

from app.config import Settings
from app.db import make_engine

S = Settings()
pytestmark = [pytest.mark.turso, pytest.mark.skipif(not S.turso_database_url, reason="TURSO_DATABASE_URL not set")]


def test_turso_answers_and_lists_tables():
    eng = make_engine(S.database_url, S.turso_database_url, S.turso_auth_token)
    with eng.connect() as c:
        assert c.execute(text("select 1")).scalar() == 1
        tables = {r[0] for r in c.execute(text("select name from sqlite_master where type='table'"))}
    print("Turso tables:", sorted(tables))
    assert tables <= {"agentrun", "barrier", "mapplace", "placecache", "report", "venue"}
