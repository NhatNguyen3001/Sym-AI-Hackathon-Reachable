"""Transport for NSW Open Data: Trip Planner journeys, stop lookups and lift alerts.

The API key only ever travels in the Authorization header; errors never include it."""
import httpx

COMMON = {"outputFormat": "rapidJSON", "coordOutputFormat": "EPSG:4326", "version": "10.2.1.42"}


class TransitUnavailable(Exception):
    """TfNSW can't be reached, timed out, or answered with an error."""


class TfnswClient:
    def __init__(self, base_url: str, api_key: str, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=8)
        self.headers = {"Authorization": f"apikey {api_key}"}

    def _get(self, path: str, params: dict) -> dict:
        try:
            r = self.http.get(f"{self.base}{path}", params={**COMMON, **params}, headers=self.headers)
        except httpx.HTTPError as e:
            raise TransitUnavailable(type(e).__name__) from e
        if r.status_code >= 300:
            raise TransitUnavailable(f"TfNSW HTTP {r.status_code}")
        try:
            return r.json()
        except ValueError as e:
            raise TransitUnavailable("TfNSW sent invalid JSON") from e

    def trip(self, o_lat: float, o_lng: float, d_lat: float, d_lng: float) -> dict:
        """Wheelchair-accessible journeys leaving now."""
        return self._get("/v1/tp/trip", {
            "depArrMacro": "dep", "type_origin": "coord", "name_origin": f"{o_lng:.6f}:{o_lat:.6f}:EPSG:4326",
            "type_destination": "coord", "name_destination": f"{d_lng:.6f}:{d_lat:.6f}:EPSG:4326",
            "calcNumberOfTrips": 9, "wheelchair": "on", "TfNSWTR": "true"})

    def lift_alerts(self) -> list[dict]:
        raw = self._get("/v1/tp/add_info", {"filterPublicationStatus": "current"})
        return [i for i in (raw.get("infos") or {}).get("current") or []
                if (i.get("properties") or {}).get("announcementType") == "liftsEscalators"]

    def stop_coord(self, stop_id: str) -> tuple[float, float] | None:
        raw = self._get("/v1/tp/stop_finder", {"type_sf": "stop", "name_sf": stop_id, "TfNSWSF": "true"})
        locs = raw.get("locations") or []
        c = locs[0].get("coord") if locs else None
        return (c[0], c[1]) if c else None
