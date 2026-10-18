"""One place lookup for the whole API: known campus places, Photon search results (cached), and coord: ids."""
import logging
import threading
from collections import OrderedDict

from sqlmodel import Session, select

from app.models import MapPlace, PlaceCache, now
from app.places.ids import BadPlaceId, parse_coord_id
from app.places.photon import SearchUnavailable
from app.routing.places import Place, Places

MIN_QUERY = 2
LIMIT = 8
log = logging.getLogger("reachable")
RECENT_MAX = 500  # searched places kept in memory; only the ones someone opens are saved (spec §11)


class PlaceResolver:
    def __init__(self, known: Places, photon, overpass, engine, bbox):
        self.known, self.photon, self.overpass, self.engine, self.bbox = known, photon, overpass, engine, bbox
        self.read_engine = engine
        self.fallback = None   # Transport for NSW place finder, used when Photon is down (set at startup)
        self._recent: OrderedDict[str, Place] = OrderedDict()
        self._saved: set[str] = set()
        self._saving: set[str] = set()
        self._claims = threading.Lock()

    def search(self, q: str, photon: bool = True) -> tuple[list[Place], bool]:
        """Matching places (stations first) and whether search was limited because Photon failed.
        Doesn't write: the caller saves Photon results with remember() after answering."""
        results = list(self.known.search(q))
        limited = False
        if photon and self.photon and len(q.strip()) >= MIN_QUERY:
            try:
                found = self.photon.search(q.strip(), self.bbox, LIMIT)
                for p in found:
                    self._recent[p.id] = p
                    self._recent.move_to_end(p.id)
                while len(self._recent) > RECENT_MAX:
                    self._recent.popitem(last=False)
                results += found
            except SearchUnavailable:
                found = self._fallback_search(q)
                if found is None:
                    limited = True
                else:
                    results += found
        seen, merged = set(), []
        for p in results:
            if p.id not in seen:
                seen.add(p.id)
                merged.append(p)
        merged.sort(key=lambda p: p.kind != "station")  # stable: keeps known-then-Photon order within each group
        return merged[:LIMIT], limited

    def _fallback_search(self, q: str) -> list[Place] | None:
        """Photon is down: ask Transport for NSW instead. None when there's no fallback or it can't answer."""
        if self.fallback is None:
            return None
        try:
            found = self.fallback.find_places(q.strip(), self.bbox, LIMIT)
        except SearchUnavailable:
            return None
        for p in found:
            self._recent[p.id] = p
            self._recent.move_to_end(p.id)
        while len(self._recent) > RECENT_MAX:
            self._recent.popitem(last=False)
        return found

    def get(self, place_id: str) -> Place | None:
        if place_id.startswith("coord:"):
            try:
                return parse_coord_id(place_id)
            except BadPlaceId:
                return None
        if place_id.startswith("osm:"):
            if place_id in self._recent:
                return self._recent[place_id]
            with Session(self.engine) as s:
                row = s.get(PlaceCache, place_id)
            if row is None:
                return None
            p = Place(id=row.id, name=row.name, kind=row.kind, lat=row.lat, lng=row.lng, detail=row.detail)
            p.exit_points = list(row.exits or [])
            return p
        if place_id.startswith("tf:"):   # found through Transport for NSW: kept in memory only
            return self._recent.get(place_id)
        if place_id.startswith("place:"):  # an accessible place the map agent found (OpenStreetMap)
            with Session(self.read_engine) as s:
                row = s.get(MapPlace, place_id)
            return Place(id=row.id, name=row.name, kind="place", lat=row.lat, lng=row.lng) if row else None
        return self.known.get(place_id)

    def ensure_exits(self, place: Place) -> None:
        """Give an OSM station its entrances (once per station, cached). Known stations already have exits."""
        if place.kind != "station" or place.exit_points or not place.id.startswith("osm:") or not self.overpass:
            return
        with Session(self.engine) as s:
            row = s.get(PlaceCache, place.id)
            if row is None or row.exits is not None:
                if row is not None:
                    place.exit_points = list(row.exits or [])
                return
        # Ask Overpass with the database let go: every save waits while a session is open.
        exits = self.overpass.station_exits(place.lat, place.lng)
        if exits is None:
            return
        with Session(self.engine) as s:
            row = s.get(PlaceCache, place.id)
            if row is None:
                return
            row.exits = exits
            s.add(row)
            s.commit()
        place.exit_points = exits

    def unsaved(self, place: Place) -> bool:
        """A searched place someone is now using that isn't in the database (or being saved) yet."""
        return place.id in self._recent and place.id not in self._saved and place.id not in self._saving

    def claim_save(self, place: Place) -> bool:
        """True for the one caller that should save this place; others see it's already on its way.
        Opening a place fires /places/{from}, /places/{to} and /route at once, and each Turso write pauses the API."""
        from app.sandbox import current_box
        if current_box() is not None:   # demo sandbox: keep searched places in memory only, no database write
            return False
        with self._claims:
            if not self.unsaved(place):
                return False
            self._saving.add(place.id)
            return True

    def save_quietly(self, places: list[Place]) -> None:
        """For background tasks: a failed save is logged and dropped (spec §10.6)."""
        try:
            self.remember(places)
        except Exception:  # noqa: BLE001
            log.warning("Couldn't save a place; will try again next time it's opened.", exc_info=True)
        finally:
            with self._claims:
                self._saving.difference_update(p.id for p in places)

    def remember(self, places: list[Place]) -> None:
        """Save searched places (osm: ids) so links to them keep working, in one transaction."""
        places = [p for p in places if p.id.startswith("osm:")]
        if not places:
            return
        with Session(self.engine) as s:
            rows = {r.id: r for r in s.exec(select(PlaceCache).where(PlaceCache.id.in_([p.id for p in places]))).all()}
            for p in places:
                row = rows.get(p.id)
                if row is None:
                    s.add(PlaceCache(id=p.id, name=p.name, kind=p.kind, lat=p.lat, lng=p.lng, detail=p.detail))
                else:
                    row.name, row.kind, row.lat, row.lng, row.detail, row.seen_at = p.name, p.kind, p.lat, p.lng, p.detail, now()
                    s.add(row)
            s.commit()
        self._saved.update(p.id for p in places)
