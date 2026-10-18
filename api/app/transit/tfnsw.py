"""Transport for NSW Open Data: Trip Planner journeys, stop lookups and lift alerts.

The API key only ever travels in the Authorization header; errors never include it."""
import httpx

COMMON = {"outputFormat": "rapidJSON", "coordOutputFormat": "EPSG:4326", "version": "10.2.1.42"}
# The Trip Planner usually answers in 2-5 s but sometimes takes over 8; a slow answer is worth waiting for, and
# one timed-out try is often fine on the next.
TIMEOUT = httpx.Timeout(15, connect=5)
TRIES = 2


class TransitUnavailable(Exception):
    """TfNSW can't be reached, timed out, or answered with an error."""


class TfnswClient:
    def __init__(self, base_url: str, api_key: str, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=TIMEOUT)
        self.headers = {"Authorization": f"apikey {api_key}"}

    def _get(self, path: str, params: dict) -> dict:
        for attempt in range(TRIES):
            try:
                r = self.http.get(f"{self.base}{path}", params={**COMMON, **params}, headers=self.headers)
                break
            except httpx.TimeoutException as e:
                if attempt == TRIES - 1:
                    raise TransitUnavailable(type(e).__name__) from e
            except httpx.HTTPError as e:
                raise TransitUnavailable(type(e).__name__) from e
        if r.status_code >= 300:
            raise TransitUnavailable(f"TfNSW HTTP {r.status_code}")
        try:
            return r.json()
        except ValueError as e:
            raise TransitUnavailable("TfNSW sent invalid JSON") from e

    def live_hazards(self, kind: str) -> list[dict]:
        """Open Live Traffic NSW notices of one kind (roadwork, incident, majorevent) as GeoJSON features."""
        url = f"{self.base}/v1/live/hazards/{kind}/open"
        try:
            r = self.http.get(url, params=None, headers=self.headers)
        except httpx.HTTPError as e:
            raise TransitUnavailable(type(e).__name__) from e
        if r.status_code >= 300:
            raise TransitUnavailable(f"Live Traffic HTTP {r.status_code}")
        try:
            return r.json().get("features") or []
        except ValueError as e:
            raise TransitUnavailable("Live Traffic sent invalid JSON") from e

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
