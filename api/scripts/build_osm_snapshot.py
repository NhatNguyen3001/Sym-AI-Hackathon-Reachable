"""Refresh data/osm_places_snapshot.json: accessible places in Greater Sydney from OpenStreetMap (real Overpass).

Run from api/:  PYTHONPATH=. .venv/Scripts/python scripts/build_osm_snapshot.py
Overpass is often busy; failed tiles are retried with backoff, and the script stops if any tile still fails."""
import sys
from datetime import datetime

from app.config import Settings
from app.mapdata.agent import MapAgent
from app.mapdata.roadworks import TZ
from app.mapdata.snapshot import write_snapshot
from app.places.overpass import OverpassClient


def main() -> int:
    s = Settings()
    agent = MapAgent(None, OverpassClient(s.overpass_url), None, None, None)
    by_tile, failed = agent._places()
    if failed:
        print(f"{failed} of {len(agent.tiles)} tiles failed; snapshot not written. Try again later.")
        return 1
    places = [{**p, "tile": key} for key, rows in by_tile.items() for p in rows]
    write_snapshot(s.osm_snapshot_path, datetime.now(TZ).date().isoformat(), places)
    kinds = {}
    for p in places:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"Wrote {len(places)} places from {len(agent.tiles)} tiles: {kinds}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
