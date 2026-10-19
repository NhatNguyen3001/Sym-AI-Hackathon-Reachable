"""The showcase recorder's pure parts: fixed times and the secrets guard (no network)."""
import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location("record_showcase", Path(__file__).parents[1] / "scripts" / "record_showcase.py")
rec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rec)

WHEN = "when recorded (19 Oct 2026, Sydney time)"


def test_fix_times_rewrites_relative_times():
    data = {
        "route": {
            "liftStatus": [{"exit": "North exit lift", "status": "Working", "updated": "3 min ago"}],
            "options": [{"leaveAt": "2026-10-19T09:14:00+11:00", "liftStatus": [{"updated": "just now"}]}],
            "explanation": "Use the north exit. Lift alert checked 4 min ago.",
        },
        "venue": {"checkedAgo": "2 min ago", "checks": [{"source": "OpenStreetMap, 3 days ago"}]},
        "updates": [{"time": "1 hr ago", "title": "Lift out of service"}],
    }
    out = rec.fix_times(data, "19 Oct 2026")
    assert out["route"]["liftStatus"][0]["updated"] == WHEN
    assert out["route"]["options"][0]["liftStatus"][0]["updated"] == WHEN
    assert out["venue"]["checkedAgo"] == WHEN
    assert out["updates"][0]["time"] == WHEN
    assert out["route"]["options"][0]["leaveAt"] == "2026-10-19T09:14:00+11:00"
    assert "ago" not in repr(out)
    assert out["updates"][0]["title"] == "Lift out of service"


def test_assert_no_secrets_names_key_not_value(tmp_path):
    env = tmp_path / ".env"
    env.write_text("TFNSW_API_KEY=abcdefgh123\nROUTER=campus\n", encoding="utf-8")
    with pytest.raises(ValueError) as e:
        rec.assert_no_secrets('{"x": "abcdefgh123"}', env)
    assert "TFNSW_API_KEY" in str(e.value)
    assert "abcdefgh123" not in str(e.value)


def test_short_values_ignored(tmp_path):
    env = tmp_path / ".env"
    env.write_text('ADMIN_KEY=x\nROUTER="campus"\n', encoding="utf-8")
    rec.assert_no_secrets('{"router": "campus", "x": "x"}', env)   # no error: too short to be a secret


def test_missing_env_file_is_fine(tmp_path):
    rec.assert_no_secrets("{}", tmp_path / "missing.env")


def test_staged_trip_credits_its_outage_to_the_example():
    route = {"liftStatus": [{"exit": "North exit lift", "status": "Out of service", "source": "Transport for NSW"},
                            {"exit": "South exit lift", "status": "Working", "source": "Transport for NSW"}],
             "options": [{"liftStatus": [{"exit": "North exit lift", "status": "Out of service", "source": "Transport for NSW"}]}]}
    out = rec.mark_staged(route, "Example: lift out of service")
    assert out["liftStatus"][0]["source"] == "Example set up for this showcase"
    assert out["liftStatus"][1]["source"] == "Transport for NSW"
    assert out["options"][0]["liftStatus"][0]["source"] == "Example set up for this showcase"
    assert rec.mark_staged(route, None) == route
