from app.routing.cost import Context
from app.routing.profile import Profile, Avoid
from app.routing.route import find_routes
from tests.fixtures import fixture_graph, STATION, LIBRARY

G = fixture_graph()
P = Profile(max_slope=5)


def run(ctx=None, profile=P):
    return find_routes(G, STATION, LIBRARY, profile, ctx or Context(), speed_mps=1.0)


def test_accessible_avoids_steps_and_steep():
    r = run()
    assert r["ok"] and r["accessible"]["stepFree"]
    assert r["accessible"]["maxSlope"] <= 5
    assert r["exitUsed"] == "north"           # cost 20+100+180 = 300 beats S-B-L = 320


def test_fastest_is_length_only():
    r = run()
    assert r["fastest"]["distanceM"] == 60     # P-N-L: 20 + 40 (steep shortcut)
    assert r["minutesLonger"] >= 1


def test_lift_outage_switches_exit():
    r = run(Context(lift_out_exits={"north"}))
    assert r["ok"] and r["exitUsed"] == "south"
    assert r["accessible"]["distanceM"] == 320


def test_all_exits_out_returns_no_route():
    r = run(Context(lift_out_exits={"north", "south"}))
    assert r["ok"] is False
    assert "nearby station" in r["suggestion"]


def test_confirmed_barrier_blocks_needs_checking_penalises():
    blocked = run(Context(barriers={"A-L-0": "confirmed"}))
    assert blocked["exitUsed"] == "south"
    warned = run(Context(barriers={"A-L-0": "needs_checking"}))
    assert warned["exitUsed"] == "south"       # 180*5 = 900 > 320


def test_needs_checking_on_route_marks_step_not_sure():
    r = run(Context(lift_out_exits={"north"}, barriers={"B-L-0": "needs_checking"}))
    assert r["ok"] and any(s["confidence"] == "Not sure" for s in r["steps"])


def test_steps_allowed_profile_uses_steps():
    r = run(profile=Profile(max_slope=5, avoid=Avoid(stairs=False)))
    assert r["exitUsed"] == "south" and r["accessible"]["stepFree"] is False   # P-S-L 80


def test_geometry_is_lnglat_linestring():
    g = run()["accessible"]["geometry"]
    assert g["type"] == "LineString" and g["coordinates"][0] == [0, 0]


def test_step_grouping_labels():
    labels = [s["label"] for s in run()["steps"]]
    assert labels[0] == "Lift at north exit"
    assert "Flat footpath, 100 m" in labels
    assert "Gentle slope, up to 2%, 100 m" in labels
