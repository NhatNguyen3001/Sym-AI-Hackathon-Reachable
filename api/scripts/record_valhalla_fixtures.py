"""Record real Valhalla responses for the unit tests (run with the local container up).

Usage (from api/): .venv/Scripts/python scripts/record_valhalla_fixtures.py
Writes tests/fixtures/valhalla/<trip>_{accessible,fastest,trace}.json
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routing.valhalla import TRACE_FILTERS, ValhallaClient  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "valhalla"
TRIPS = {
    "town_hall": ((-33.8732, 151.2066), (-33.8661, 151.2129)),        # Town Hall station -> State Library of NSW
    "parramatta": ((-33.8173, 151.0045), (-33.8174, 151.0026)),       # Parramatta station -> Westfield Parramatta
    "macquarie": ((-33.777161, 151.118078), (-33.775688, 151.113509)),  # MQ station north exit -> Waranara Library
}


def body(a, b, wheelchair: bool) -> dict:
    opts = {"type": "wheelchair", "step_penalty": 3600, "use_hills": 0.1} if wheelchair else {"type": "foot"}
    return {"locations": [{"lat": a[0], "lon": a[1]}, {"lat": b[0], "lon": b[1]}], "costing": "pedestrian",
            "costing_options": {"pedestrian": opts}, "units": "kilometers"}


def main(url: str = "http://localhost:8002"):
    client = ValhallaClient(url)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (a, b) in TRIPS.items():
        acc = client.route(body(a, b, True))
        fast = client.route(body(a, b, False))
        tr = client.trace({"encoded_polyline": acc["trip"]["legs"][0]["shape"], "shape_match": "edge_walk",
                           "costing": "pedestrian", "filters": {"attributes": TRACE_FILTERS, "action": "include"}})
        for kind, data in (("accessible", acc), ("fastest", fast), ("trace", tr)):
            (OUT / f"{name}_{kind}.json").write_text(json.dumps(data, indent=1))
        grades = [max(abs(e.get("max_upward_grade") or 0), abs(e.get("max_downward_grade") or 0)) for e in tr["edges"]]
        uses = sorted({e.get("use") for e in tr["edges"]})
        print(f"{name}: {acc['trip']['summary']['length'] * 1000:.0f} m accessible, "
              f"{fast['trip']['summary']['length'] * 1000:.0f} m fastest, {len(tr['edges'])} edges, "
              f"max grade {max(grades, default=0)}%, uses {uses}")


if __name__ == "__main__":
    main(*sys.argv[1:])
