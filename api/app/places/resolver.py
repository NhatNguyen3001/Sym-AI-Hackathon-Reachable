"""One place lookup for the whole API: known campus places, Photon search results (cached), and coord: ids."""
from sqlmodel import Session

from app.models import PlaceCache, now
from app.places.ids import BadPlaceId, parse_coord_id
from app.places.photon import SearchUnavailable
from app.routing.places import Place, Places

MIN_QUERY = 2
LIMIT = 8


class PlaceResolver:
    def __init__(self, known: Places, photon, overpass, engine, bbox):
        self.known, self.photon, self.overpass, self.engine, self.bbox = known, photon, overpass, engine, bbox

    def search(self, q: str) -> tuple[list[Place], bool]:
        """Matching places (stations first) and whether search was limited because Photon failed."""
        results = list(self.known.search(q))
        limited = False
        if self.photon and len(q.strip()) >= MIN_QUERY:
            try:
                found = self.photon.search(q.strip(), self.bbox, LIMIT)
                self._remember(found)
                results += found
            except SearchUnavailable:
                limited = True
        seen, merged = set(), []
        for p in results:
            if p.id not in seen:
                seen.add(p.id)
                merged.append(p)
        merged.sort(key=lambda p: p.kind != "station")  # stable: keeps known-then-Photon order within each group
        return merged[:LIMIT], limited

    def get(self, place_id: str) -> Place | None:
        if place_id.startswith("coord:"):
            try:
                return parse_coord_id(place_id)
            except BadPlaceId:
                return None
        if place_id.startswith("osm:"):
            with Session(self.engine) as s:
                row = s.get(PlaceCache, place_id)
            if row is None:
                return None
            p = Place(id=row.id, name=row.name, kind=row.kind, lat=row.lat, lng=row.lng, detail=row.detail)
            p.exit_points = list(row.exits or [])
            return p
        return self.known.get(place_id)

    def ensure_exits(self, place: Place) -> None:
        """Give an OSM station its entrances (once per station, cached). Known stations already have exits."""
        if place.kind != "station" or place.exit_points or not place.id.startswith("osm:") or not self.overpass:
            return
        with Session(self.engine) as s:
            row = s.get(PlaceCache, place.id)
            if row is None or row.exits is not None:
                return
            exits = self.overpass.station_exits(place.lat, place.lng)
            if exits is None:
                return
            row.exits = exits
            s.add(row)
            s.commit()
        place.exit_points = exits

    def _remember(self, places: list[Place]) -> None:
        with Session(self.engine) as s:
            for p in places:
                row = s.get(PlaceCache, p.id)
                if row is None:
                    s.add(PlaceCache(id=p.id, name=p.name, kind=p.kind, lat=p.lat, lng=p.lng, detail=p.detail))
                else:
                    row.name, row.kind, row.lat, row.lng, row.detail, row.seen_at = p.name, p.kind, p.lat, p.lng, p.detail, now()
                    s.add(row)
            s.commit()
