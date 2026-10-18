"""Browser-test hooks (off by default): fixed map places, and a map agent that never calls OpenStreetMap,
Live Traffic NSW or Claude. Settings SEED_MAP_PLACES and MAP_AGENT_FAKE turn them on."""
from sqlmodel import Session, func, select

from app.mapdata.agent import MapAgent
from app.mapdata.roadworks import Verdict
from app.models import Barrier, MapPlace

CENTRE = (-33.7765, 151.1160)  # Macquarie University
SHOPS = (-33.7768, 151.1205)   # Macquarie Centre
ROADWORK_ID = "lt-e2e-1"
ROADWORK_TEXT = "The footpath on the east side of Herring Road is closed; use the west side."


def fixture_places() -> list[dict]:
    """About 40 places around Macquarie Park, close enough together to cluster when zoomed out."""
    kinds = [("toilet", {"amenity": "toilets", "wheelchair": "yes"}, "Accessible toilet"),
             ("parking", {"amenity": "parking_space", "parking_space": "disabled"}, "Accessible parking"),
             ("venue", {"shop": "clothes", "wheelchair": "yes"}, "Accessible place")]
    out = [{"id": "place:osm-n900001", "osm_id": "node/900001", "name": "Macquarie Centre toilets", "kind": "toilet",
            "lat": SHOPS[0], "lng": SHOPS[1], "tags": {"amenity": "toilets", "wheelchair": "yes"}, "tile": "e2e"}]
    for i in range(39):
        kind, tags, name = kinds[i % 3]
        out.append({"id": f"place:osm-n91{i:04d}", "osm_id": f"node/91{i:04d}", "name": name, "kind": kind,
                    "lat": round(-33.770 - (i % 7) * 0.0015, 6), "lng": round(151.120 + (i // 7) * 0.0015, 6),
                    "tags": tags, "tile": "e2e"})
    return out


def seed_map_places(engine) -> None:
    with Session(engine) as s:
        if s.exec(select(func.count()).select_from(MapPlace)).one():
            return
        for p in fixture_places():
            s.add(MapPlace(**p))
        s.add(Barrier(id=ROADWORK_ID, type="roadworks", title="Footpath works", place="Herring Road, Macquarie Park",
                      lat=-33.7790, lng=151.1225, status="confirmed", confidence=0.8, update_type="roadworks",
                      sources=[{"kind": "feed", "label": "Live Traffic NSW, checked by Claude", "url": None,
                                "text": ROADWORK_TEXT}]))
        s.commit()


class FakeMapAgent(MapAgent):
    """Gathers fixed data instead of calling the real services."""

    def _gather(self) -> dict:
        places = {"e2e": [{k: v for k, v in p.items() if k != "tile"} for p in fixture_places()]}
        item = {"id": ROADWORK_ID, "title": "Footpath works", "road": "Herring Road", "suburb": "Macquarie Park",
                "advice": "", "periods": [], "url": None, "lat": -33.7790, "lng": 151.1225}
        verdicts = {ROADWORK_ID: Verdict(id=ROADWORK_ID, effect="blocks_path", sentence=ROADWORK_TEXT)}
        return {"places": places, "failed_tiles": 0, "items": [item], "verdicts": verdicts, "failed": []}
