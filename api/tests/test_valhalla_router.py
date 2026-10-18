import json
from pathlib import Path

import httpx
import pytest

from app.routing.cost import Context
from app.routing.geo import parse_bbox
from app.routing.places import Place
from app.routing.profile import Avoid, Profile
from app.routing.valhalla import NoPath, OutOfArea, RoutingUnavailable, ValhallaClient, ValhallaRouter
from tests.test_geo import encode_polyline6

BBOX = parse_bbox("149.97,-34.33,151.63,-32.99")
P = Profile(max_slope=5)
FIXTURES = Path(__file__).parent / "fixtures" / "valhalla"

# A straight line north in the CBD, about 330 m.
LINE = [(-33.8732, 151.2066), (-33.8717, 151.2066), (-33.8702, 151.2066)]


def trip(points=LINE, time_s=300, length_km=0.33):
    shape = encode_polyline6(points)
    return {"trip": {"legs": [{"shape": shape, "summary": {"time": time_s, "length": length_km}}],
                     "summary": {"time": time_s, "length": length_km}}}


def edge(begin, end, length_km=0.165, use="footway", up=1, down=1):
    return {"begin_shape_index": begin, "end_shape_index": end, "length": length_km, "use": use,
            "max_upward_grade": up, "max_downward_grade": down, "surface": "paved_smooth", "names": ["George Street"]}


def trace(points=LINE, edges=None):
    return {"shape": encode_polyline6(points), "edges": edges if edges is not None else [edge(0, 1), edge(1, 2)]}


class FakeClient:
    """Scripted Valhalla: returns queued responses (or raises queued exceptions) and records every request body."""

    def __init__(self, routes=None, traces=None, route_fn=None):
        self.routes, self.traces = list(routes or []), list(traces or [])
        self.route_fn = route_fn
        self.route_bodies, self.trace_bodies = [], []

    def route(self, body):
        self.route_bodies.append(body)
        if self.route_fn:
            return self.route_fn(body)
        r = self.routes.pop(0) if len(self.routes) > 1 else self.routes[0]
        if isinstance(r, Exception):
            raise r
        return r

    def trace(self, body):
        self.trace_bodies.append(body)
        t = self.traces.pop(0) if len(self.traces) > 1 else self.traces[0]
        if isinstance(t, Exception):
            raise t
        return t


def place(lat, lng, kind="venue", exits=None, pid="p"):
    p = Place(id=pid, name=pid, kind=kind, lat=lat, lng=lng)
    p.exit_points = exits or []
    return p


START = place(-33.8732, 151.2066, pid="start")
END = place(-33.8702, 151.2066, pid="end")


def router(client, enforce_slope=False):
    return ValhallaRouter(client, BBOX, max_leg_km=10, speed_mps=1.0,
                          exit_names={"north": "north exit", "south": "south exit"}, enforce_slope=enforce_slope)


def accessible_bodies(c):
    return [b for b in c.route_bodies if b["costing_options"]["pedestrian"]["type"] == "wheelchair"]


def test_out_of_area_raises():
    with pytest.raises(OutOfArea):
        router(FakeClient([trip()], [trace()])).plan(START, place(-37.81, 144.96), P, Context())


def test_too_long_leg_is_ok_false():
    far = place(-33.70, 151.10)
    r = router(FakeClient([trip()], [trace()])).plan(START, far, P, Context())
    assert r["ok"] is False and r["reason"] == TOO_FAR
    assert "public transport" in r["reason"]


TOO_FAR = "This is too far to walk or roll. Try public transport."


def test_walk_longer_than_cap_is_too_far_even_when_straight_line_is_short():
    c = FakeClient([trip(length_km=11.5)], [trace()])
    r = router(c).plan(START, END, P, Context())
    assert r["ok"] is False and r["reason"] == TOO_FAR
    assert c.trace_bodies == []  # no point checking stairs on a walk we won't offer


def test_wheelchair_options_and_rain():
    c = FakeClient([trip()], [trace()])
    router(c).plan(START, END, P, Context())
    opts = accessible_bodies(c)[0]["costing_options"]["pedestrian"]
    assert opts["type"] == "wheelchair" and opts["step_penalty"] == 3600 and opts["use_hills"] == 0.1
    c2 = FakeClient([trip()], [trace()])
    router(c2).plan(START, END, P, Context(raining=True))
    assert accessible_bodies(c2)[0]["costing_options"]["pedestrian"]["use_hills"] == 0.0


def test_stairs_allowed_uses_foot_without_step_penalty():
    c = FakeClient([trip()], [trace()])
    router(c).plan(START, END, Profile(aid="cane", max_slope=5, avoid=Avoid(stairs=False)), Context())
    opts = c.route_bodies[0]["costing_options"]["pedestrian"]
    assert opts["type"] == "foot" and "step_penalty" not in opts


def test_ok_route_shape():
    r = router(FakeClient([trip()], [trace()])).plan(START, END, P, Context())
    assert r["ok"] is True
    acc = r["accessible"]
    assert acc["geometry"]["type"] == "LineString" and acc["geometry"]["coordinates"][0] == [151.2066, -33.8732]
    assert acc["distanceM"] == 330 and acc["minutes"] == 6 and acc["stepFree"] is True and acc["maxSlope"] == 1
    assert r["fastest"]["distanceM"] == 330 and r["minutesLonger"] == 0


def test_picks_fastest_working_exit():
    north = {"id": "north", "name": "North exit", "lat": -33.8730, "lng": 151.2066, "via": "lift"}
    south = {"id": "south", "name": "South exit", "lat": -33.8734, "lng": 151.2066, "via": "lift"}
    station = place(-33.8732, 151.2066, kind="station", exits=[north, south], pid="station")

    def by_start(body):
        lat = body["locations"][0]["lat"]
        return trip(time_s=200) if lat == south["lat"] else trip(time_s=300)

    r = router(FakeClient(traces=[trace()], route_fn=by_start)).plan(station, END, P, Context())
    assert r["exitUsed"] == "south" and r["steps"][0]["label"] == "Lift at south exit"
    r2 = router(FakeClient(traces=[trace()], route_fn=by_start)).plan(station, END, P, Context(lift_out_exits={"south"}))
    assert r2["exitUsed"] == "north"


def test_all_exits_out_ok_false():
    north = {"id": "north", "name": "North exit", "lat": -33.8730, "lng": 151.2066, "via": "lift"}
    station = place(-33.8732, 151.2066, kind="station", exits=[north], pid="Town Hall station")
    r = router(FakeClient([trip()], [trace()])).plan(station, END, P, Context(lift_out_exits={"north"}))
    assert r["ok"] is False and "Every lift at Town Hall station is out of service" in r["reason"]


def test_confirmed_barrier_sent_as_exclusion():
    c = FakeClient([trip()], [trace()])
    router(c).plan(START, END, P, Context(barrier_points=[(-33.8717, 151.2066, "confirmed"), (-33.88, 151.21, "resolved")]))
    polys = accessible_bodies(c)[0]["exclude_polygons"]
    assert len(polys) == 1 and len(polys[0]) == 5 and polys[0][0] == polys[0][-1]


def test_steep_edge_triggers_reroute_with_exclusion():
    steep = trace(edges=[edge(0, 1, up=8), edge(1, 2)])
    c = FakeClient([trip(), trip(time_s=360)], [steep, trace()])
    r = router(c, enforce_slope=True).plan(START, END, P, Context())
    acc = accessible_bodies(c)
    assert r["ok"] is True and len(acc) == 2
    assert len(acc[0].get("exclude_polygons", [])) == 0 and len(acc[1]["exclude_polygons"]) == 1


def test_gives_up_after_four_rounds():
    steep = trace(edges=[edge(0, 1, up=8), edge(1, 2)])
    c = FakeClient([trip()], [steep])
    r = router(c, enforce_slope=True).plan(START, END, P, Context())
    assert r["ok"] is False and "slope limit" in r["reason"]
    assert len(accessible_bodies(c)) == 5  # first try + 4 reroutes


def test_needs_checking_detour_kept_within_1_5x():
    c = FakeClient([trip(time_s=300), trip(time_s=420)], [trace(), trace()])
    r = router(c).plan(START, END, P, Context(barrier_points=[(-33.8717, 151.2066, "needs_checking")]))
    assert r["ok"] and len(accessible_bodies(c)) == 2
    assert all(s["confidence"] != "Not sure" for s in r["steps"])


def test_needs_checking_detour_refused_above_1_5x_marks_not_sure():
    c = FakeClient([trip(time_s=300), trip(time_s=600)], [trace(), trace()])
    r = router(c).plan(START, END, P, Context(barrier_points=[(-33.8717, 151.2066, "needs_checking")]))
    assert r["ok"] and r["accessible"]["minutes"] == 6
    assert any(s["confidence"] == "Not sure" for s in r["steps"])


def test_no_path_is_ok_false():
    r = router(FakeClient([NoPath("442")], [trace()])).plan(START, END, P, Context())
    assert r["ok"] is False and "suggestion" in r


def test_unavailable_propagates():
    with pytest.raises(RoutingUnavailable):
        router(FakeClient([RoutingUnavailable("down")], [trace()])).plan(START, END, P, Context())


def test_steps_and_confidence_mapping():
    pts = [(-33.8732, 151.2066), (-33.8727, 151.2066), (-33.8722, 151.2066), (-33.8712, 151.2066), (-33.8702, 151.2066)]
    edges = [edge(0, 1, 0.055, "footway", 0, 0), edge(1, 2, 0.008, "pedestrian_crossing", 0, 0),
             edge(2, 3, 0.11, "sidewalk", 3, 1), edge(3, 4, 0.11, "footway", 4, 2)]
    r = router(FakeClient([trip(pts)], [trace(pts, edges)]), enforce_slope=True).plan(START, END, P, Context())
    steps = [(s["label"], s["confidence"]) for s in r["steps"]]
    assert steps == [("Flat footpath, 55 m", "Confirmed"), ("Kerb ramp at crossing", "Likely"),
                     ("Gentle slope, up to 4%, 220 m", "Measured")]
    assert r["accessible"]["maxSlope"] == 4 and r["accessible"]["slopeEstimated"] is False


def test_advisory_steps_do_not_claim_slopes():
    pts = [(-33.8732, 151.2066), (-33.8727, 151.2066), (-33.8722, 151.2066), (-33.8712, 151.2066), (-33.8702, 151.2066)]
    edges = [edge(0, 1, 0.055, "footway", 0, 0), edge(1, 2, 0.008, "pedestrian_crossing", 0, 0),
             edge(2, 3, 0.11, "sidewalk", 9, 1), edge(3, 4, 0.11, "footway", 30, 2)]
    r = router(FakeClient([trip(pts)], [trace(pts, edges)])).plan(START, END, P, Context())
    assert [(s["label"], s["confidence"]) for s in r["steps"]] == [
        ("Footpath, 55 m", "Likely"), ("Kerb ramp at crossing", "Likely"), ("Footpath, 220 m", "Likely")]
    assert r["accessible"]["slopeEstimated"] is True
    assert r["slopeNote"] == "We only measure hills on campus. Elsewhere it's our best guess, so check steep bits."


def test_advisory_mode_does_not_reroute_on_steep():
    steep = trace(edges=[edge(0, 1, up=30), edge(1, 2)])
    c = FakeClient([trip()], [steep])
    r = router(c).plan(START, END, P, Context())
    assert r["ok"] is True and len(accessible_bodies(c)) == 1


def test_escalator_triggers_reroute_for_avoid_stairs():
    esc = trace(edges=[edge(0, 1, use="escalator"), edge(1, 2)])
    c = FakeClient([trip(), trip(time_s=400)], [esc, trace()])
    r = router(c).plan(START, END, P, Context())
    acc = accessible_bodies(c)
    assert r["ok"] is True and len(acc) == 2 and len(acc[1]["exclude_polygons"]) == 1


def test_unavoidable_steps_is_ok_false():
    stairs = trace(edges=[edge(0, 1, use="steps"), edge(1, 2)])
    r = router(FakeClient([trip()], [stairs])).plan(START, END, P, Context())
    assert r["ok"] is False and r["reason"] == "No step-free route right now."


def test_steps_edge_marks_not_step_free():
    edges = [edge(0, 1), edge(1, 2, use="steps")]
    r = router(FakeClient([trip()], [trace(edges=edges)])).plan(START, END, Profile(aid="cane", max_slope=5, avoid=Avoid(stairs=False)), Context())
    assert r["accessible"]["stepFree"] is False and any(s["label"].startswith("Steps") for s in r["steps"])


# --- HTTP client -------------------------------------------------------------------------------------------------

def client_with(handler):
    return ValhallaClient("http://valhalla:8002", http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_client_no_path_error():
    c = client_with(lambda req: httpx.Response(400, json={"error_code": 442, "error": "No path could be found"}))
    with pytest.raises(NoPath):
        c.route({})


def test_client_server_error_is_unavailable():
    with pytest.raises(RoutingUnavailable):
        client_with(lambda req: httpx.Response(503, text="busy")).route({})


def test_timeout_is_unavailable():
    def boom(req):
        raise httpx.ReadTimeout("slow", request=req)
    with pytest.raises(RoutingUnavailable):
        client_with(boom).trace({})


def test_client_posts_json():
    seen = {}

    def handler(req):
        seen["url"], seen["body"] = str(req.url), json.loads(req.content)
        return httpx.Response(200, json={"ok": 1})
    assert client_with(handler).route({"a": 1}) == {"ok": 1}
    assert seen == {"url": "http://valhalla:8002/route", "body": {"a": 1}}


@pytest.mark.skipif(not (FIXTURES / "town_hall_accessible.json").exists(), reason="fixtures not recorded yet")
def test_recorded_town_hall_fixture_maps_to_route_shape():
    rec = {n: json.loads((FIXTURES / f"town_hall_{n}.json").read_text()) for n in ("accessible", "trace", "fastest")}

    def route_fn(body):
        return rec["accessible"] if body["costing_options"]["pedestrian"]["type"] == "wheelchair" else rec["fastest"]
    town_hall = place(-33.8732, 151.2066, pid="Town Hall")
    library = place(-33.8661, 151.2129, pid="State Library")
    r = router(FakeClient(traces=[rec["trace"]], route_fn=route_fn)).plan(town_hall, library, Profile(max_slope=8), Context())
    assert r["ok"] is True
    assert len(r["accessible"]["geometry"]["coordinates"]) >= 2 and r["accessible"]["distanceM"] > 300
    assert isinstance(r["accessible"]["stepFree"], bool) and r["steps"]


def test_trace_falls_back_to_map_snap():
    c = FakeClient([trip()], [NoPath("443"), trace()])
    r = router(c).plan(START, END, P, Context())
    assert r["ok"] is True
    assert [b["shape_match"] for b in c.trace_bodies[:2]] == ["edge_walk", "map_snap"]


def test_trace_failure_still_returns_route_with_unsure_step():
    c = FakeClient([trip()], [NoPath("443")])
    r = router(c).plan(START, END, P, Context())
    assert r["ok"] is True and r["accessible"]["distanceM"] == 330
    assert r["steps"] == [{"icon": "alert", "label": "Footpath, 330 m", "confidence": "Not sure", "lengthM": 330,
                           "kind": "path", "slope": None, "measured": False}]


def _inside(pt_lnglat, ring):
    """Ray-casting point-in-polygon for a [lng, lat] ring."""
    x, y = pt_lnglat
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def test_forbidden_edge_exclusion_covers_whole_edge_and_parallel_ways():
    # A 40 m flight of steps along a line of three shape points, then a footway.
    pts = [(-33.8732, 151.2066), (-33.87302, 151.2066), (-33.87284, 151.2066), (-33.8702, 151.2066)]
    edges = [edge(0, 2, 0.04, "steps"), edge(2, 3, 0.29)]
    c = FakeClient([trip(pts), trip(pts, time_s=420)], [trace(pts, edges), trace(pts, [edge(0, 3, 0.33)])])
    router(c).plan(START, END, P, Context())
    ring = accessible_bodies(c)[1]["exclude_polygons"][0]
    for lat, lng in pts[:3]:  # both ends and the middle of the steps
        assert _inside([lng, lat], ring)
    beside = (-33.87302, 151.2066 + 6 / (111_320 * 0.8302))  # 6 m east of the middle of the steps
    assert _inside([beside[1], beside[0]], ring)
    assert not _inside([151.2066, -33.8702], ring)  # the footway's far end stays usable


def test_only_barriers_near_the_trip_are_sent():
    c = FakeClient([trip()], [trace()])
    far = (-33.7765, 151.1160, "confirmed")  # Macquarie Park, 12 km from this CBD trip
    near = (-33.8717, 151.2066, "confirmed")
    router(c).plan(START, END, P, Context(barrier_points=[far, near]))
    assert len(accessible_bodies(c)[0]["exclude_polygons"]) == 1
