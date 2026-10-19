"""Record the showcase trips from a running local API into web/public/showcase/ (manual; never run in tests or CI).

Run from api/ with the full stack up (Valhalla, Transport for NSW and Claude keys in api/.env):
  .venv/Scripts/python scripts/record_showcase.py --api http://127.0.0.1:8000 --trips campus,opera-house,art-gallery,bondi
The lift-out trip is recorded separately against an API that uses the Transport for NSW mock (see the plan, Task 8):
  .venv/Scripts/python scripts/record_showcase.py --api http://127.0.0.1:8101 --trips lift-out --no-shared

Relative times ("3 min ago") become fixed ("when recorded (19 Oct 2026, Sydney time)"), and nothing is written if
it contains any value from api/.env."""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

API_DIR = Path(__file__).resolve().parents[1]
TRIPS_FILE = API_DIR.parent / "web" / "lib" / "showcase-trips.json"
OUT_DIR = API_DIR.parent / "web" / "public" / "showcase"
COVERAGE = (149.97, -34.33, 151.63, -32.99)
TIME_KEYS = {"updated", "checkedAgo", "time"}
RELATIVE = re.compile(r"\b\d+\s*(?:min|mins|minutes|hr|hrs|hours|h|days?|weeks?)\s+ago\b|\bjust now\b", re.I)
LEAVE_IN = re.compile(r"\bLeave in \d+\s*min\b", re.I)


def fix_times(obj, recorded_on: str):
    """Relative times become the recording time; ISO times (leaveAt, departAt) are kept for Sydney-time display."""
    when = f"when recorded ({recorded_on}, Sydney time)"   # reads on in "updated …", "Checked …"
    if isinstance(obj, dict):
        return {k: (when if k in TIME_KEYS and isinstance(v, str) else fix_times(v, recorded_on)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [fix_times(v, recorded_on) for v in obj]
    if isinstance(obj, str):
        return LEAVE_IN.sub("Leave at the time shown", RELATIVE.sub("when recorded", obj))
    return obj


def assert_no_secrets(text: str, env_path: Path) -> None:
    """Refuse to write a recording that contains any api/.env value long enough to be a secret."""
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$", line)
        if not m:
            continue
        value = m.group(2).strip().strip('"').strip("'")
        if len(value) >= 8 and value in text:
            raise ValueError(f"Recording contains the value of {m.group(1)} from api/.env; nothing written.")


def write(out: Path, name: str, data, recorded_on: str) -> None:
    text = json.dumps(fix_times(data, recorded_on), ensure_ascii=False, indent=1)
    assert_no_secrets(text, API_DIR / ".env")
    (out / f"{name}.json").write_text(text + "\n", encoding="utf-8")
    print(f"wrote {name}.json ({len(text) // 1024} KB)")


def place_id(http: httpx.Client, trip: dict, end: str) -> str:
    if trip.get(f"{end}Id"):
        return trip[f"{end}Id"]
    q = trip[f"{end}Query"]
    found = http.get("/places", params={"q": q}).raise_for_status().json()
    if not found:
        raise SystemExit(f"No place found for {q!r}; is address search on?")
    print(f"  {q!r} -> {found[0]['name']} ({found[0]['id']})")
    return found[0]["id"]


def record_trip(http: httpx.Client, trip: dict) -> dict:
    from_id, to_id = place_id(http, trip, "from"), place_id(http, trip, "to")
    route = http.post("/route", json={"from": from_id, "to": to_id, "profile": trip["profile"]}, timeout=90).raise_for_status().json()
    if not route.get("ok"):
        raise SystemExit(f"{trip['id']}: no route ({route.get('reason')})")
    venue = http.get(f"/venue/{to_id}/check")
    return {
        "trip": {**trip, "fromId": from_id, "toId": to_id},
        "from": http.get(f"/places/{from_id}").raise_for_status().json(),
        "to": http.get(f"/places/{to_id}").raise_for_status().json(),
        "route": route,
        "venue": venue.json() if venue.status_code == 200 else None,
    }


def map_places(http: httpx.Client) -> list:
    """The whole coverage box, in tiles if the API won't answer for a box that large."""
    w, s, e, n = COVERAGE
    for parts in (1, 4, 8):
        pins, ok = {}, True
        for i in range(parts):
            for j in range(parts):
                box = (w + (e - w) * i / parts, s + (n - s) * j / parts, w + (e - w) * (i + 1) / parts, s + (n - s) * (j + 1) / parts)
                r = http.get("/map/places", params={"bbox": ",".join(f"{v:.4f}" for v in box)}, timeout=60)
                if r.status_code != 200:
                    ok = False
                    break
                pins.update({p["id"]: p for p in r.json()})
            if not ok:
                break
        if ok:
            return list(pins.values())
    raise SystemExit("The API wouldn't return the map places.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument("--trips", default="", help="comma-separated trip ids (default: all)")
    ap.add_argument("--no-shared", action="store_true", help="skip map places, map status and updates")
    args = ap.parse_args(argv)

    trips = json.loads(TRIPS_FILE.read_text(encoding="utf-8"))
    wanted = [t for t in args.trips.split(",") if t]
    unknown = set(wanted) - {t["id"] for t in trips}
    if unknown:
        raise SystemExit(f"Unknown trips: {', '.join(sorted(unknown))}")
    today = datetime.now(ZoneInfo("Australia/Sydney"))
    recorded_on = f"{today.day} {today:%b %Y}"
    args.out.mkdir(parents=True, exist_ok=True)
    manifest_path = args.out / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"trips": []}

    with httpx.Client(base_url=args.api.rstrip("/"), timeout=30) as http:
        http.get("/health").raise_for_status()
        recorded = {}
        for trip in trips:
            if wanted and trip["id"] not in wanted:
                continue
            print(f"recording {trip['id']}")
            data = record_trip(http, trip)
            write(args.out, trip["id"], data, recorded_on)
            recorded[trip["id"]] = data["trip"]
        if not args.no_shared:
            write(args.out, "map-places", map_places(http), recorded_on)
            write(args.out, "map-status", http.get("/agents/map/status").json(), recorded_on)
            write(args.out, "updates", http.get("/updates").json(), recorded_on)

    by_id = {t["id"]: t for t in manifest["trips"]} | recorded
    order = [t["id"] for t in trips]
    write(args.out, "manifest", {"recordedOn": recorded_on, "trips": [by_id[i] for i in order if i in by_id]}, recorded_on)
    return 0


if __name__ == "__main__":
    sys.exit(main())
