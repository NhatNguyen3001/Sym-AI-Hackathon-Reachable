def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"ok": True, "db": "sqlite"}


def test_server_runs_without_an_access_log():
    """The access log would record request addresses, including 'your location' coordinates and search text,
    which the privacy page says we don't keep."""
    from pathlib import Path
    cmd = next(l for l in (Path(__file__).parent.parent / "Dockerfile").read_text().splitlines() if l.startswith("CMD"))
    assert "--no-access-log" in cmd
