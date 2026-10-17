"""Public transport options: TfNSW rides and in-station paths, with our own accessible walks to and from
the stations (spec section 5). The walk router is passed in so campus trips keep using the campus graph."""
import math
from datetime import timedelta

from app.models import now as utcnow
from app.routing.graph import dist_m
from app.routing.places import Place
from app.transit.parse import Journey, Ride, StationPath, Walk, parse_journeys, platform_numbers

SAME_SPOT_M = 30      # closer than this, no walk leg
AT_STATION_M = 300    # a station place this close to the boarding stop is the boarding station
CACHE_S = 60
MODE_LABEL = {"train": "Train", "metro": "Metro", "lightrail": "Light rail", "bus": "Bus", "coach": "Coach", "ferry": "Ferry"}
NO_STAIRS = {"stairs", "escalator"}
PATH_LABEL = {"level": "Level path", "ramp": "Ramp", "escalator": "Escalator", "stairs": "Stairs"}


def ride_label(r) -> str:
    mode, line = (r.mode, r.line) if isinstance(r, Ride) else (r["mode"], r["line"])
    return f"{MODE_LABEL.get(mode, 'Bus')} {line}".strip()


def _mins(seconds: float) -> int:
    return max(1, math.ceil(seconds / 60))


def _point(lat: float, lng: float, name: str) -> Place:
    return Place(id=f"coord:{lat},{lng}", name=name, kind="place", lat=lat, lng=lng)


def _stop(s) -> dict:
    return {"name": s.name, "platform": s.platform, "lat": s.lat, "lng": s.lng}


class TransitPlanner:
    def __init__(self, client, campus_stop_id: str | None = None, campus_exits=frozenset(), now=utcnow):
        self.client, self.campus_stop_id, self.campus_exits, self.now = client, campus_stop_id, set(campus_exits), now
        self._cache: dict = {}

    def _journeys(self, start, end) -> list[Journey]:
        key = (round(start.lat, 5), round(start.lng, 5), round(end.lat, 5), round(end.lng, 5))
        t = self.now()
        hit = self._cache.get(key)
        if hit and (t - hit[0]).total_seconds() < CACHE_S:
            return hit[1]
        js = parse_journeys(self.client.trip(start.lat, start.lng, end.lat, end.lng))
        self._cache[key] = (t, js)
        return js

    def plan(self, start, end, profile, ctx, alerts: list[dict], walk) -> list[dict]:
        """Options for every usable journey. alerts: active TfNSW lift alerts {alertId, stopId, text, url}.
        walk(start, end, profile, ctx) -> router result. Raises TransitUnavailable when TfNSW fails."""
        out, seen = [], set()
        for j in self._journeys(start, end):
            rides = [l for l in j.legs if isinstance(l, Ride)]
            sig = tuple((r.line, r.depart) for r in rides)
            if not rides or sig in seen:  # TfNSW sometimes lists the same journey more than once
                continue
            seen.add(sig)
            opt = self._option(len(out), j, rides, start, end, profile, ctx, alerts, walk)
            if opt:
                out.append(opt)
        return out

    # --- legs -------------------------------------------------------------------------------------------------

    @staticmethod
    def _walk(a: Place, b: Place, to_name: str, profile, ctx, walk) -> dict | None:
        r = walk(a, b, profile, ctx)
        if not r.get("ok") or not r.get("accessible"):
            return None
        return {"kind": "walk", **r["accessible"], "steps": r["steps"], "source": "reachable", "to": to_name}

    @staticmethod
    def _path_steps(path: StationPath, to_platform: str = "") -> list[dict]:
        steps: list[dict] = []
        for t, (lf, lt) in zip(path.types, path.levels):
            if t == "level" and steps and steps[-1]["type"] == "level":
                continue
            label = ("Lift down" if lt < lf else "Lift up") if t == "lift" else PATH_LABEL[t]
            steps.append({"type": t, "label": label})
        lifts = [s for s in steps if s["type"] == "lift"]
        if to_platform and lifts:
            lifts[-1]["label"] += f" to {to_platform}"
        return steps

    def _station_leg(self, path: StationPath, profile, to_platform: str = "") -> dict | None:
        if profile.avoid.stairs and NO_STAIRS & set(path.types):
            return None
        return {"kind": "station", "station": path.station, "stopId": path.stop_id, "minutes": _mins(path.seconds),
                "path": self._path_steps(path, to_platform), "liftAlerts": []}

    @staticmethod
    def _ride_leg(r: Ride) -> dict:
        return {"kind": "ride", "mode": r.mode, "label": ride_label(r), "line": r.line, "headsign": r.headsign,
                "from": _stop(r.origin), "to": _stop(r.dest), "departAt": r.depart.isoformat(),
                "arriveAt": r.arrive.isoformat(), "minutes": _mins((r.arrive - r.depart).total_seconds()),
                "stops": r.stops, "wheelchairAccessible": r.wheelchair,
                "geometry": {"type": "LineString", "coordinates": r.coords}}

    def _transfer(self, w: Walk, next_ride: Ride, profile) -> dict | None:
        """A walk between two rides stays TfNSW's (it is inside or right next to the station)."""
        steps = []
        for p in (w.leave_path, w.arrive_path):
            if p is None:
                continue
            if profile.avoid.stairs and NO_STAIRS & set(p.types):
                return None
            steps += [{"icon": "lift" if s["type"] == "lift" else "check", "label": s["label"], "confidence": "Likely",
                       "lengthM": 0} for s in self._path_steps(p)]
        steps = steps or [{"icon": "check", "label": "Transfer path from Transport for NSW", "confidence": "Likely",
                           "lengthM": 0}]
        return {"kind": "walk", "minutes": _mins(w.seconds), "distanceM": 0,
                "geometry": {"type": "LineString", "coordinates": w.coords}, "steps": steps, "stepFree": True,
                "maxSlope": 0, "slopeEstimated": True, "source": "tfnsw", "to": next_ride.origin.name}

    # --- one journey ------------------------------------------------------------------------------------------

    def _option(self, n, j: Journey, rides, start, end, profile, ctx, alerts, walk) -> dict | None:
        first, last = rides[0], rides[-1]
        i0, i1 = j.legs.index(first), j.legs.index(last)
        lead = j.legs[i0 - 1] if i0 > 0 and isinstance(j.legs[i0 - 1], Walk) else None
        tail = j.legs[i1 + 1] if i1 + 1 < len(j.legs) and isinstance(j.legs[i1 + 1], Walk) else None
        path_in = lead.arrive_path if lead else None
        path_out = tail.leave_path if tail else None
        legs: list[dict] = []

        # Our walk to the station (none when the trip starts at the boarding station), then its in-station path.
        walk_in = None
        if not (start.kind == "station" and dist_m(start.lat, start.lng, first.origin.lat, first.origin.lng) <= AT_STATION_M):
            join = path_in.street if path_in and path_in.street else (first.origin.lat, first.origin.lng)
            if dist_m(start.lat, start.lng, *join) > SAME_SPOT_M:
                walk_in = self._walk(start, _point(*join, first.origin.name), first.origin.name, profile, ctx, walk)
                if walk_in is None:
                    return None
                legs.append(walk_in)
        if path_in:
            leg = self._station_leg(path_in, profile, first.origin.platform)
            if leg is None:
                return None
            legs.append(leg)

        # Rides, and TfNSW's transfer paths between them.
        for k in range(i0, i1 + 1):
            leg_in = j.legs[k]
            if isinstance(leg_in, Ride):
                legs.append(self._ride_leg(leg_in))
                continue
            nxt = next(r for r in j.legs[k:] if isinstance(r, Ride))
            leg = self._transfer(leg_in, nxt, profile)
            if leg is None:
                return None
            legs.append(leg)

        # The in-station path out, then our walk to the door (none when the trip ends at the station).
        walk_out = None
        if path_out:
            leg = self._station_leg(path_out, profile)
            if leg is None:
                return None
            legs.append(leg)
        if not (end.kind == "station" and dist_m(end.lat, end.lng, last.dest.lat, last.dest.lng) <= AT_STATION_M):
            join = path_out.street if path_out and path_out.street else (last.dest.lat, last.dest.lng)
            if dist_m(end.lat, end.lng, *join) > SAME_SPOT_M:
                walk_out = self._walk(_point(*join, last.dest.name), end, end.name, profile, ctx, walk)
                if walk_out is None:
                    return None
                legs.append(walk_out)

        # Timing with our walks: can the person make the first service?
        t = self.now()
        lead_s = (walk_in["minutes"] * 60 if walk_in else 0) + (path_in.seconds if path_in else 0)
        tail_s = (path_out.seconds if path_out else 0) + (walk_out["minutes"] * 60 if walk_out else 0)
        leave = first.depart - timedelta(seconds=lead_s)
        if leave < t - timedelta(minutes=1):
            return None
        leave = max(leave, t)
        arrive = last.arrive + timedelta(seconds=tail_s)

        found = self._alerts(rides, alerts, ctx)
        for leg in legs:
            if leg["kind"] == "station":
                leg["liftAlerts"] = [a for stop, a in found.values() if stop == leg["stopId"]]
        lift_alerts = sorted((a for _, a in found.values()), key=lambda a: not a["blocking"])
        warnings = [f"{a['text'].rstrip('.')}. " + ("This trip needs that lift." if a["blocking"] else "Check before you go.")
                    for a in lift_alerts]
        stations, seen = [], set()
        for r in rides:
            for s in (r.origin, r.dest):
                if s.stop_id not in seen:
                    seen.add(s.stop_id)
                    stations.append({"stopId": s.stop_id, "name": s.name})
        walks = [l for l in legs if l["kind"] == "walk"]
        summary = " · ".join(f"Walk {l['minutes']} min" if l["kind"] == "walk" else l["label"]
                             for l in legs if l["kind"] in ("walk", "ride"))
        return {"id": f"transit-{n}", "mode": "transit", "minutes": _mins((arrive - leave).total_seconds()),
                "leaveAt": leave.isoformat(), "arriveAt": arrive.isoformat(), "summary": summary,
                "stepFree": all(l["stepFree"] for l in walks), "interchanges": j.interchanges, "warnings": warnings,
                "liftAlerts": lift_alerts, "legs": legs, "stations": stations,
                "unsure": sum(1 for l in walks for s in l["steps"] if s["confidence"] == "Not sure")}

    def _alerts(self, rides, alerts, ctx) -> dict[str, tuple[str, dict]]:
        """Lift alerts at the stations this journey uses: alert id -> (stop id, alert for the option)."""
        found: dict[str, tuple[str, dict]] = {}
        campus_all_out = bool(self.campus_exits) and self.campus_exits <= ctx.lift_out_exits
        for r in rides:
            for stop in (r.origin, r.dest):
                for a in alerts:
                    if a.get("stopId") != stop.stop_id:
                        continue
                    blocking = bool(platform_numbers(a["text"]) & platform_numbers(stop.platform)) or (
                        stop.stop_id == self.campus_stop_id and campus_all_out)
                    prev = found.get(a["alertId"])
                    found[a["alertId"]] = (stop.stop_id, {"station": stop.name, "text": a["text"], "url": a.get("url"),
                                                          "blocking": blocking or bool(prev and prev[1]["blocking"])})
        return found
