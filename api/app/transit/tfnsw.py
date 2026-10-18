"""Transport for NSW Open Data: Trip Planner journeys, stop lookups and lift alerts.

The API key only ever travels in the Authorization header; errors never include it."""
import threading
import time
from concurrent.futures import Future

import httpx

COMMON = {"outputFormat": "rapidJSON", "coordOutputFormat": "EPSG:4326", "version": "10.2.1.42"}
# The Trip Planner usually answers in 2-5 s but sometimes takes over 8; a slow answer is worth waiting for, and
# one timed-out try is often fine on the next.
TIMEOUT = httpx.Timeout(15, connect=5)
TRIES = 2


class TransitUnavailable(Exception):
    """TfNSW can't be reached, timed out, or answered with an error."""


# A room of judges at once (cycle 7). Transport for NSW's default (Bronze) plan allows 5 requests a second and
# 60,000 a day: stay under the rate, and answer the same trip from memory for a minute.
RATE_PER_S = 5
LIMIT_WAIT_S = 10
TRIP_CACHE_S = 60
FIND_CACHE_S = 600


class _Limiter:
    """At most RATE_PER_S calls in any second; a caller waits its turn, up to LIMIT_WAIT_S."""

    def __init__(self):
        self._times: list[float] = []
        self._lock = threading.Lock()

    def take(self, wait: float | None = None) -> None:
        deadline = time.monotonic() + (LIMIT_WAIT_S if wait is None else wait)
        while True:
            with self._lock:
                now = time.monotonic()
                self._times = [t for t in self._times if now - t < 1.0]
                if len(self._times) < RATE_PER_S:
                    self._times.append(now)
                    return
                wait = self._times[0] + 1.0 - now
            if now + wait > deadline:
                raise TransitUnavailable("Transport for NSW is busy (rate limit)")
            time.sleep(wait)


class TfnswClient:
    def __init__(self, base_url: str, api_key: str, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=TIMEOUT)
        self.headers = {"Authorization": f"apikey {api_key}"}
        self._limiter = _Limiter()
        self._trips: dict[tuple, tuple[float, Future]] = {}   # same trip asked again within a minute
        self._trips_lock = threading.Lock()
        self._finds: dict[tuple, tuple[float, list]] = {}       # place searches, remembered 10 minutes

    def _get(self, path: str, params: dict, wait: float | None = None) -> dict:
        self._limiter.take(wait)
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

    def find_places(self, q: str, bbox, limit: int = 8) -> list:
        """Places, suburbs, stops, streets and addresses by name (Transport for NSW stop_finder): the search
        fallback when Photon is down (2026-10-18). Waits at most 2 s for a turn under the rate limit, so trip
        planning comes first. Raises SearchUnavailable when it can't answer."""
        from app.places.photon import SearchUnavailable
        from app.routing.places import Place
        key = (q.strip().lower(), tuple(bbox), limit)
        hit = self._finds.get(key)
        if hit and time.monotonic() - hit[0] < FIND_CACHE_S:
            return list(hit[1])
        try:
            raw = self._get("/v1/tp/stop_finder", {"type_sf": "any", "name_sf": q.strip(), "TfNSWSF": "true"}, wait=2)
        except TransitUnavailable as e:
            raise SearchUnavailable(str(e)) from e
        w, s, e, n = bbox
        out = []
        for loc in raw.get("locations") or []:
            c = loc.get("coord") or []
            if len(c) != 2 or not (s <= c[0] <= n and w <= c[1] <= e):
                continue
            kind = {"stop": "station", "poi": "venue"}.get(loc.get("type"), "place")
            name = loc.get("disassembledName") or loc.get("name") or "Place"
            out.append(Place(id=f"tf:{loc.get('id')}", name=name, kind=kind, lat=c[0], lng=c[1],
                             detail=(loc.get("parent") or {}).get("name") or ""))
            if len(out) >= limit:
                break
        self._finds[key] = (time.monotonic(), out)
        while len(self._finds) > 500:
            self._finds.pop(next(iter(self._finds)))
        return list(out)

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
        """Wheelchair-accessible journeys leaving now. The same trip (to about 10 m) within a minute shares one
        call, including callers that ask while it's still on its way."""
        key = tuple(round(v, 4) for v in (o_lat, o_lng, d_lat, d_lng))
        with self._trips_lock:
            now = time.monotonic()
            for k in [k for k, (t, _) in self._trips.items() if now - t > TRIP_CACHE_S]:
                del self._trips[k]
            hit = self._trips.get(key)
            if hit is None:
                mine: Future = Future()
                self._trips[key] = (now, mine)
        if hit is not None:
            return hit[1].result()
        try:
            mine.set_result(self._trip(o_lat, o_lng, d_lat, d_lng))
        except Exception as e:
            with self._trips_lock:
                self._trips.pop(key, None)  # don't remember a failure
            mine.set_exception(e)
        return mine.result()

    def _trip(self, o_lat: float, o_lng: float, d_lat: float, d_lng: float) -> dict:
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
