import json
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from app.routing.graph import nearest_node


@dataclass
class Place:
    id: str
    name: str
    kind: str
    lat: float
    lng: float
    node: object = None
    exits: list[str] = field(default_factory=list)
    detail: str = ""
    # Station exits with coordinates: {id, name, lat, lng, via}. Filled by the place resolver.
    exit_points: list[dict] = field(default_factory=list)

    def public(self) -> dict:
        out = {"id": self.id, "name": self.name, "kind": self.kind, "lat": self.lat, "lng": self.lng}
        if self.detail:
            out["detail"] = self.detail
        return out


def _fold(s: str) -> str:
    """Lowercase and strip accents so 'cafe' matches 'Café'."""
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


class Places:
    def __init__(self, places_path: Path, overrides_path: Path, G):
        ov = json.loads(Path(overrides_path).read_text(encoding="utf-8"))
        self.exits = ov["exits"]
        self.station_id = ov["station"]["id"]
        self.exit_names = {e["id"]: e["name"].lower() for e in self.exits}
        # Transport for NSW ids: the station, and the OSM ids of the lifts each exit needs (cycle 3 lift alerts).
        self.station_stop_id = ov["station"].get("tfnswStopId")
        self.lift_osm_ids = {e["id"]: set(e.get("liftOsmIds", [])) for e in self.exits}
        self._places: list[Place] = []
        for row in json.loads(Path(places_path).read_text(encoding="utf-8")):
            p = Place(id=row["id"], name=row["name"], kind=row["kind"], lat=row["lat"], lng=row["lng"], node=row.get("node"))
            if p.node is None:
                p.node = nearest_node(G, p.lat, p.lng)
            if p.id == self.station_id:
                p.exits = [e["id"] for e in self.exits]
                p.exit_points = [{"id": e["id"], "name": e["name"], "lat": G.nodes[e["osmNode"]]["y"],
                                  "lng": G.nodes[e["osmNode"]]["x"], "via": e["via"]} for e in self.exits]
            self._places.append(p)
        self._by_id = {p.id: p for p in self._places}

    def get(self, place_id: str) -> Place | None:
        return self._by_id.get(place_id)

    def search(self, q: str, limit: int = 8) -> list[Place]:
        q = _fold(q.strip())
        def rank(p: Place):
            name = _fold(p.name)
            return (p.kind != "station", not name.startswith(q), not any(w.startswith(q) for w in name.split()))
        hits = [p for p in self._places if q in _fold(p.name)]
        return sorted(hits, key=rank)[:limit]

    def station_exits(self, place_id: str) -> list[dict]:
        p = self.get(place_id)
        if not p or p.kind != "station":
            return []
        return [{"exitId": e["id"], "name": e["name"], "via": e["via"]} for e in self.exits]
