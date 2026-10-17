"""A dated copy of the OpenStreetMap places, used only when the map has never been updated (spec section 4c-bis)."""
import json
from datetime import datetime, time
from pathlib import Path

from sqlmodel import Session, func, select

from app.mapdata.roadworks import TZ
from app.models import MapPlace

LICENCE = "© OpenStreetMap contributors, ODbL"


def load_snapshot(engine, path: str) -> int:
    """Rows loaded: 0 when there is no file, or the table already has places (a real run replaces the snapshot)."""
    if not path or not Path(path).is_file():
        return 0
    with Session(engine) as s:
        if s.exec(select(func.count()).select_from(MapPlace)).one():
            return 0
        snap = json.loads(Path(path).read_text(encoding="utf-8"))
        taken = datetime.combine(datetime.fromisoformat(snap["takenOn"]).date(), time(12), TZ)
        for p in snap["places"]:
            s.add(MapPlace(**p, seen_at=taken))
        s.commit()
        return len(snap["places"])


def write_snapshot(path: str, taken_on: str, places: list[dict]) -> None:
    Path(path).write_text(json.dumps({"takenOn": taken_on, "licence": LICENCE, "places": places},
                                     ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
