"""Photon geocoder (OSM-based search-as-you-type). Public endpoint for development; self-host for production."""
import time

import httpx

from app.routing.places import Place

USER_AGENT = "Reachable/0.2 (hackathon demo)"
STATION_KEYS = {"railway", "public_transport"}
STATION_VALUES = {"station", "stop", "halt", "platform", "stop_position", "tram_stop"}


SEARCH_CACHE_S = 600
SEARCH_CACHE_MAX = 500


class SearchUnavailable(Exception):
    pass


def to_place(f: dict) -> Place | None:
    pr = f.get("properties", {})
    name = pr.get("name")
    kind = "venue" if name else "place"
    if not name and pr.get("street"):
        name = f"{pr['housenumber']} {pr['street']}" if pr.get("housenumber") else pr["street"]
    if not name:
        return None
    if pr.get("osm_key") in STATION_KEYS and pr.get("osm_value") in STATION_VALUES:
        kind = "station"
    lng, lat = f["geometry"]["coordinates"][:2]
    detail = pr.get("district") or pr.get("city") or pr.get("locality") or ""
    return Place(id=f"osm:{pr.get('osm_type', 'N')}{pr.get('osm_id')}", name=name, kind=kind, lat=lat, lng=lng, detail=detail)


class PhotonClient:
    def __init__(self, base_url: str, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=3)
        self._cache: dict[tuple, tuple[float, list[Place]]] = {}

    def search(self, q: str, bbox, limit: int = 8) -> list[Place]:
        """Photon is a fair-use service: the same search within 10 minutes is answered from memory (cycle 7)."""
        key = (q.strip().lower(), tuple(bbox), limit)
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < SEARCH_CACHE_S:
            return list(hit[1])
        found = self._search(q, bbox, limit)
        self._cache[key] = (time.monotonic(), found)
        while len(self._cache) > SEARCH_CACHE_MAX:
            self._cache.pop(next(iter(self._cache)))
        return list(found)

    def _search(self, q: str, bbox, limit: int = 8) -> list[Place]:
        params = {"q": q, "limit": limit, "lang": "en", "bbox": ",".join(f"{v:g}" for v in bbox)}
        try:
            r = self.http.get(f"{self.base}/api", params=params, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            features = r.json().get("features", [])
        except (httpx.HTTPError, ValueError) as e:
            raise SearchUnavailable(str(e)) from e
        return [p for p in (to_place(f) for f in features) if p]
