"""Sydney-wide accessible routing on a self-hosted Valhalla.

Valhalla has no hard maximum slope, so we enforce it ourselves: route, read every edge's grade with
trace_attributes, exclude edges that are too steep and route again (spec §3).
"""
import math

import httpx

from app.routing.cost import Context
from app.routing.geo import decode_polyline6, in_bbox, point_line_distance_m, square_around
from app.routing.graph import dist_m
from app.routing.route import SUGGESTION
from app.routing.steps import group_items

NO_PATH_CODES = {170, 171, 442, 443, 154, 155, 156, 157}
TOO_LONG = "This trip is too long to walk or roll. Transit routing is coming soon."
SLOPE_REASON = "No step-free route within your slope limit."
NO_ROUTE = "No step-free route right now."
SLOPE_NOTE = "Slopes outside the Macquarie University campus are estimates. Check steep sections before you go."
STAIR_USES = {"steps", "escalator"}
MAX_SLOPE_ROUNDS = 4
NEAR_BARRIER_M = 15
DETOUR_MAX_RATIO = 1.5
TRACE_FILTERS = ["edge.length", "edge.use", "edge.surface", "edge.max_upward_grade", "edge.max_downward_grade",
                 "edge.begin_shape_index", "edge.end_shape_index", "edge.names", "edge.weighted_grade", "shape"]


class RoutingUnavailable(Exception):
    """Valhalla can't be reached (down, timing out, or erroring)."""


class OutOfArea(Exception):
    """A trip end is outside the area we have map data for."""


class NoPath(Exception):
    """Valhalla answered, but there is no path."""


class ValhallaClient:
    def __init__(self, base_url: str, http: httpx.Client | None = None):
        self.base = base_url.rstrip("/")
        self.http = http or httpx.Client(timeout=10)

    def _post(self, path: str, body: dict) -> dict:
        try:
            r = self.http.post(f"{self.base}{path}", json=body)
        except httpx.HTTPError as e:
            raise RoutingUnavailable(str(e)) from e
        if r.status_code == 400:
            try:
                code = r.json().get("error_code")
            except ValueError:
                code = None
            if code in NO_PATH_CODES:
                raise NoPath(str(code))
            raise RoutingUnavailable(f"valhalla rejected request: {r.text[:200]}")
        if r.status_code >= 300:
            raise RoutingUnavailable(f"valhalla HTTP {r.status_code}")
        return r.json()

    def route(self, body: dict) -> dict:
        return self._post("/route", body)

    def trace(self, body: dict) -> dict:
        return self._post("/trace_attributes", body)


def _grade(e: dict) -> float:
    return max(abs(e.get("max_upward_grade") or 0), abs(e.get("max_downward_grade") or 0))


def _kind(e: dict, slopes_known: bool) -> str:
    use = e.get("use") or ""
    if use in STAIR_USES:
        return "steps"
    if use == "elevator":
        return "lift"
    if use == "pedestrian_crossing":
        return "crossing"
    if not slopes_known:
        return "path"
    return "slope" if _grade(e) >= 2 else "flat"


class ValhallaRouter:
    def __init__(self, client, bbox, max_leg_km: float, speed_mps: float, exit_names: dict[str, str] | None = None,
                 enforce_slope: bool = False):
        self.client, self.bbox, self.max_leg_km, self.speed = client, bbox, max_leg_km, speed_mps
        self.exit_names = exit_names or {}
        # Valhalla elevation is too coarse to trust at footpath scale (spec section 8), so by default slopes only
        # steer the route (use_hills) and are reported as estimates. Turn this on once elevation is reliable.
        self.enforce_slope = enforce_slope

    # --- request building -------------------------------------------------------------------------------------

    def _body(self, a: dict, b: dict, profile, ctx: Context, extra_excludes: list) -> dict:
        opts: dict = {"type": "wheelchair" if profile.avoid.stairs else "foot",
                      "use_hills": 0.0 if (ctx.raining and profile.avoid.slippery_when_wet) else 0.1,
                      "max_distance": int(self.max_leg_km * 1000)}
        if profile.avoid.stairs:
            opts["step_penalty"] = 3600
        excludes = [square_around(lat, lng) for lat, lng, status in ctx.barrier_points if status == "confirmed"]
        body = {"locations": [{"lat": a["lat"], "lon": a["lng"]}, {"lat": b["lat"], "lon": b["lng"]}],
                "costing": "pedestrian", "costing_options": {"pedestrian": opts}, "units": "kilometers"}
        if excludes or extra_excludes:
            body["exclude_polygons"] = excludes + extra_excludes
        return body

    @staticmethod
    def _fastest_body(a: dict, b: dict) -> dict:
        return {"locations": [{"lat": a["lat"], "lon": a["lng"]}, {"lat": b["lat"], "lon": b["lng"]}],
                "costing": "pedestrian", "costing_options": {"pedestrian": {"type": "foot"}}, "units": "kilometers"}

    def _trace(self, trip: dict) -> dict:
        """Per-edge details for a route. edge_walk is exact but sometimes fails to match; map_snap then works.
        If both fail we still have the route, just without edge details (shape only, no edges)."""
        shape = trip["trip"]["legs"][0]["shape"]
        for match in ("edge_walk", "map_snap"):
            try:
                return self.client.trace({"encoded_polyline": shape, "shape_match": match, "costing": "pedestrian",
                                          "filters": {"attributes": TRACE_FILTERS, "action": "include"}})
            except NoPath:
                continue
        return {"shape": shape, "edges": [], "unmatched": True, "length_m": trip["trip"]["summary"]["length"] * 1000}

    # --- helpers ----------------------------------------------------------------------------------------------

    @staticmethod
    def _time(trip: dict) -> float:
        return trip["trip"]["summary"]["time"]

    @staticmethod
    def _coords(trip: dict) -> list[tuple[float, float]]:
        return decode_polyline6(trip["trip"]["legs"][0]["shape"])

    def _candidates(self, place, ctx: Context) -> tuple[list[dict], bool]:
        """Start/end points for a place: its usable exits, or the place itself. Second value: all exits out."""
        exits = getattr(place, "exit_points", None) or []
        if not exits:
            return [{"lat": place.lat, "lng": place.lng, "exit": None}], False
        usable = [e for e in exits if not (e.get("via") == "lift" and e["id"] in ctx.lift_out_exits)]
        return [{"lat": e["lat"], "lng": e["lng"], "exit": e} for e in usable], not usable

    def _forbidden_excludes(self, tr: dict, profile) -> tuple[list, bool]:
        """Exclusion squares for edges this profile must not use, and whether any of them were too steep."""
        coords = decode_polyline6(tr.get("shape", "")) if tr.get("shape") else []
        out, steep_found = [], False
        for e in tr.get("edges", []):
            steep = self.enforce_slope and _grade(e) > profile.max_slope
            stairs = profile.avoid.stairs and e.get("use") in STAIR_USES
            steep_found = steep_found or steep
            if (steep or stairs) and coords:
                i, j = e["begin_shape_index"], e["end_shape_index"]
                mid = (i + j) // 2
                a, b = coords[mid], coords[min(mid + 1, len(coords) - 1)]
                out.append(square_around((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
        return out, steep_found

    def _no_route(self, reason: str, fastest=None) -> dict:
        return {"ok": False, "reason": reason, "suggestion": SUGGESTION, "fastest": fastest}

    def _summary(self, trip: dict, edges: list[dict]) -> dict:
        coords = self._coords(trip)
        dist = trip["trip"]["summary"]["length"] * 1000
        return {"geometry": {"type": "LineString", "coordinates": [[lng, lat] for lat, lng in coords]},
                "distanceM": round(dist), "minutes": max(1, math.ceil(dist / self.speed / 60)),
                "maxSlope": round(max((_grade(e) for e in edges), default=0)),
                "stepFree": not any(e.get("use") in STAIR_USES for e in edges),
                "slopeEstimated": not self.enforce_slope}

    def _steps(self, tr: dict, near_points: list[tuple[float, float]], start_exit, end_exit) -> list[dict]:
        coords = decode_polyline6(tr["shape"]) if tr.get("shape") else []
        items = []
        for e in tr.get("edges", []):
            kind = _kind(e, self.enforce_slope)
            seg = coords[e["begin_shape_index"]:e["end_shape_index"] + 1] if coords else []
            unsure = bool(seg) and any(point_line_distance_m(lat, lng, seg) <= NEAR_BARRIER_M for lat, lng in near_points)
            items.append({"kind": kind, "slope": round(_grade(e)), "length": (e.get("length") or 0) * 1000,
                          "unsure": unsure, "measured": kind == "slope", "likely": kind in ("crossing", "path"), "exit": None})
        if tr.get("unmatched"):  # no edge details: say so rather than guess
            items = [{"kind": "path", "slope": 0, "length": tr["length_m"], "unsure": True, "measured": False,
                      "likely": False, "exit": None}]
        steps = group_items(items)
        lift = {"icon": "lift", "confidence": "Confirmed", "lengthM": 0}
        if start_exit and start_exit.get("via") == "lift":
            steps.insert(0, {**lift, "label": f"Lift at {self.exit_names.get(start_exit['id'], start_exit['name'].lower())}"})
        if end_exit and end_exit.get("via") == "lift":
            steps.append({**lift, "label": f"Lift at {self.exit_names.get(end_exit['id'], end_exit['name'].lower())}"})
        return steps

    # --- the algorithm ------------------------------------------------------------------------------------------

    def plan(self, start, end, profile, ctx: Context) -> dict:
        for p in (start, end):
            if not in_bbox(p.lat, p.lng, self.bbox):
                raise OutOfArea(p.id)
        if dist_m(start.lat, start.lng, end.lat, end.lng) > self.max_leg_km * 1000:
            return self._no_route(TOO_LONG)

        starts, start_all_out = self._candidates(start, ctx)
        ends, end_all_out = self._candidates(end, ctx)
        for p, all_out in ((start, start_all_out), (end, end_all_out)):
            if all_out:
                return self._no_route(f"Every lift at {p.name} is out of service.")

        # 1. Best accessible route over every start/end candidate pair.
        best = None
        for a in starts[:3]:
            for b in ends[:3]:
                try:
                    t = self.client.route(self._body(a, b, profile, ctx, []))
                except NoPath:
                    continue
                if best is None or self._time(t) < self._time(best[0]):
                    best = (t, a, b)
        if best is None:
            return self._no_route(NO_ROUTE)
        trip, a, b = best

        # 2. Edges this profile must not use (steps, escalators; too steep when slopes are enforced): exclude, reroute.
        excludes: list = []
        tr = self._trace(trip)
        rounds, any_steep = 0, False
        while True:
            bad, steep = self._forbidden_excludes(tr, profile)
            any_steep = any_steep or steep
            if not bad:
                break
            if rounds == MAX_SLOPE_ROUNDS:
                return self._no_route(SLOPE_REASON if any_steep else NO_ROUTE)
            rounds += 1
            excludes += bad
            try:
                trip = self.client.route(self._body(a, b, profile, ctx, excludes))
            except NoPath:
                return self._no_route(SLOPE_REASON if any_steep else NO_ROUTE)
            tr = self._trace(trip)

        # 3. Barriers that still need checking: detour if it costs at most 1.5x, otherwise warn.
        coords = self._coords(trip)
        near = [(lat, lng) for lat, lng, status in ctx.barrier_points
                if status == "needs_checking" and point_line_distance_m(lat, lng, coords) <= NEAR_BARRIER_M]
        if near:
            try:
                detour = self.client.route(self._body(a, b, profile, ctx, excludes + [square_around(*p) for p in near]))
                if self._time(detour) <= DETOUR_MAX_RATIO * self._time(trip):
                    detour_tr = self._trace(detour)
                    if not self._forbidden_excludes(detour_tr, profile)[0]:
                        trip, tr, near = detour, detour_tr, []
            except NoPath:
                pass

        # 4. Fastest route for comparison: plain walking, no accessibility rules.
        try:
            fast_trip = self.client.route(self._fastest_body({"lat": start.lat, "lng": start.lng}, {"lat": end.lat, "lng": end.lng}))
            fastest = self._summary(fast_trip, [])
        except NoPath:
            fastest = None

        edges = tr.get("edges", [])
        accessible = self._summary(trip, edges)
        fastest = fastest or accessible
        exit_used = (a["exit"] or b["exit"] or {}).get("id")
        out = {"ok": True, "accessible": accessible, "fastest": fastest,
               "minutesLonger": max(0, accessible["minutes"] - fastest["minutes"]),
               "steps": self._steps(tr, near, a["exit"], b["exit"]), "exitUsed": exit_used}
        if not self.enforce_slope:
            out["slopeNote"] = SLOPE_NOTE
        return out
