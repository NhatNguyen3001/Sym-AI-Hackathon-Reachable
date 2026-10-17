from app.config import Settings
from app.routing.cost import Context
from app.routing.graph import load_graph
from app.routing.places import Places
from app.routing.profile import DEFAULT_PROFILE
from app.routing.route import find_routes

S = Settings()
G = load_graph(S.graph_path)
PL = Places(S.places_path, S.overrides_path, G)


def route(out):
    return find_routes(G, PL.get("mq-station"), PL.get("library"), DEFAULT_PROFILE, Context(lift_out_exits=out), 1.0, PL.exit_names)


def test_demo_trip_step_free_via_north_when_south_out():
    r = route({"south"})
    assert r["ok"] and r["accessible"]["stepFree"] and r["exitUsed"] == "north"
    assert 300 < r["accessible"]["distanceM"] < 1200
    assert r["steps"][0]["label"] == "Lift at north exit"


def test_demo_trip_uses_south_when_north_out():
    assert route({"north"})["exitUsed"] == "south"


def test_demo_trip_no_route_when_both_out():
    r = route({"north", "south"})
    assert r["ok"] is False and "Macquarie University station" in r["reason"]


def test_places_search_stations_first():
    res = PL.search("ma")
    assert res[0].kind == "station"
    assert [p.id for p in PL.search("cafe")] == ["library-cafe", "globe-cafe", "mortarboard-cafe"]
    assert PL.search("") [0].id == "mq-station"


def test_places_resolve_nodes_and_exits():
    assert PL.get("library").node in G
    assert PL.get("mq-station").exits == ["north", "south"]
    assert PL.get("nope") is None
    assert [e["exitId"] for e in PL.station_exits("mq-station")] == ["north", "south"]
