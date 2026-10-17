"""Station entrances from OpenStreetMap via the Overpass API (one query per station, cached by the resolver)."""
import httpx

from app.places.photon import USER_AGENT


class OverpassClient:
    def __init__(self, url: str, http: httpx.Client | None = None):
        self.url = url
        self.http = http or httpx.Client(timeout=8)

    def station_exits(self, lat: float, lng: float, radius_m: int = 300) -> list[dict] | None:
        """Entrances near a station, or None if Overpass couldn't answer (so the caller can retry later)."""
        query = (f'[out:json][timeout:6];node(around:{radius_m},{lat},{lng})'
                 f'[railway~"^(subway_entrance|train_station_entrance)$"];out;')
        try:
            r = self.http.post(self.url, data={"data": query}, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            elements = r.json().get("elements", [])
        except (httpx.HTTPError, ValueError):
            return None
        exits = []
        for i, el in enumerate(elements, start=1):
            name = (el.get("tags") or {}).get("name")
            exits.append({"id": f"osm-{el['id']}", "name": f"{name} entrance" if name else f"Entrance {i}",
                          "lat": el["lat"], "lng": el["lon"], "via": "unknown"})
        return exits
