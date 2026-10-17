import copy
from datetime import timedelta

import pytest

from app.routing.cost import Context
from app.routing.places import Place
from app.routing.profile import DEFAULT_PROFILE
from app.transit.parse import parse_journeys
from app.transit.plan import TransitPlanner
from app.transit.tfnsw import TransitUnavailable
from tests.tfnsw_fixtures import load

START = Place(id="coord:-33.8755,151.2065", name="Bathurst St", kind="place", lat=-33.8755, lng=151.2065)  # ~270 m from the entrance
END = Place(id="coord:-33.7969,151.1810", name="436 Victoria Av", kind="place", lat=-33.7969, lng=151.1810)
RAW = load("trip_townhall_chatswood")
ONE = {**RAW, "journeys": RAW["journeys"][:1]}
FIRST_DEP = parse_journeys(RAW)[0].legs[1].depart


class Client:
    def __init__(self, raw=ONE, fail=False):
        self.raw, self.fail, self.calls = raw, fail, 0

    def trip(self, *a):
        self.calls += 1
        if self.fail:
            raise TransitUnavailable("down")
        return self.raw


def walk_ok(minutes=4, unsure=False):
    def walk(a, b, profile, ctx):
        steps = [{"icon": "check", "label": "Step-free path", "confidence": "Not sure" if unsure else "Likely", "lengthM": 300}]
        acc = {"geometry": {"type": "LineString", "coordinates": [[a.lng, a.lat], [b.lng, b.lat]]}, "distanceM": 300,
               "minutes": minutes, "maxSlope": 2, "stepFree": True, "slopeEstimated": True}
        return {"ok": True, "accessible": acc, "steps": steps}
    return walk


def planner(client=None, at=FIRST_DEP - timedelta(minutes=30)):
    return TransitPlanner(client or Client(), now=lambda: at)


def plan(p=None, alerts=(), walk=None, start=START):
    return (p or planner()).plan(start, END, DEFAULT_PROFILE, Context(), list(alerts), walk or walk_ok())


def test_journey_becomes_walk_station_ride_station_walk():
    o = plan()[0]
    assert [l["kind"] for l in o["legs"]] == ["walk", "station", "ride", "station", "walk"]
    walk_in, st_in, ride = o["legs"][:3]
    assert walk_in["source"] == "reachable" and walk_in["to"] == "Gadigal Station"
    assert st_in["station"] == "Gadigal Station" and any(p["type"] == "lift" for p in st_in["path"])
    assert ride["label"] == "Metro M1" and ride["from"]["platform"] == "Platform 2" and ride["wheelchairAccessible"] is True
    assert o["summary"] == "Walk 4 min · Metro M1 · Walk 4 min" and o["mode"] == "transit" and o["id"] == "transit-0"
    assert o["leaveAt"] < o["arriveAt"] and o["minutes"] >= ride["minutes"]
    assert {s["stopId"] for s in o["stations"]} >= {"200066"}


def test_identical_journeys_are_listed_once():
    doubled = {**ONE, "journeys": ONE["journeys"] + copy.deepcopy(ONE["journeys"])}
    assert len(plan(planner(Client(doubled)))) == 1
    assert len(plan(planner(Client(RAW)))) == 3  # different departures are different options


def test_no_step_free_walk_drops_the_journey():
    assert plan(walk=lambda *a: {"ok": False}) == []


def test_journey_you_cannot_make_is_dropped():
    late = planner(at=FIRST_DEP - timedelta(minutes=2))  # a 4-minute walk plus the station path can't make it
    assert plan(late) == []


def test_stairs_in_the_station_path_drop_the_journey_for_avoid_stairs():
    raw = copy.deepcopy(ONE)
    for info in raw["journeys"][0]["legs"][0]["footPathInfo"]:
        info["footPathElem"][0]["type"] = "STAIRS"
    assert plan(planner(Client(raw))) == []


def test_lift_alert_on_the_platform_blocks_otherwise_warns():
    blocking = [{"alertId": "a", "stopId": "200066", "text": "Gadigal Station Lift 2 to Platform 2 is not available", "url": None}]
    o = plan(alerts=blocking)[0]
    assert o["liftAlerts"][0]["blocking"] is True and o["warnings"][0].endswith("This trip needs that lift.")
    other = [{"alertId": "b", "stopId": "200066", "text": "Gadigal Station Lift 4 to Platform 1 is not available", "url": None}]
    o = plan(alerts=other)[0]
    assert o["liftAlerts"][0]["blocking"] is False and o["warnings"][0].endswith("Check before you go.")
    assert any(l["kind"] == "station" and l["liftAlerts"] for l in o["legs"])
    assert "_stop" not in o["liftAlerts"][0]


def test_unsure_walk_steps_are_counted():
    assert plan(walk=walk_ok(unsure=True))[0]["unsure"] == 2


def test_trip_results_are_cached_for_a_minute():
    c = Client()
    p = planner(c)
    plan(p)
    plan(p)
    assert c.calls == 1


def test_tfnsw_failure_propagates():
    with pytest.raises(TransitUnavailable):
        plan(planner(Client(fail=True)))


def test_starting_at_the_boarding_station_skips_the_first_walk():
    gadigal = Place(id="osm:node/1", name="Gadigal Station", kind="station", lat=-33.873814, lng=151.208121)
    o = plan(start=gadigal)[0]
    assert o["legs"][0]["kind"] == "station"


def test_interchange_rides_and_both_stations():
    raw = load("trip_interchange")
    mq = Place(id="mq-station", name="Macquarie University station", kind="station", lat=-33.77735, lng=151.11825)
    first_dep = parse_journeys(raw)[0].legs[1].depart
    p = TransitPlanner(Client(raw), now=lambda: first_dep - timedelta(minutes=30))
    end = Place(id="coord:-33.8915,151.2478", name="Bondi Junction", kind="place", lat=-33.8915, lng=151.2478)
    o = p.plan(mq, end, DEFAULT_PROFILE, Context(), [], walk_ok())[0]
    assert [l["label"] for l in o["legs"] if l["kind"] == "ride"] == ["Metro M1", "Train T4"]
    assert o["interchanges"] == 1 and o["legs"][0]["kind"] != "walk"   # starts at the station: no walk out and back


def test_same_way_shares_way_id():
    opts = plan(planner(Client(RAW)))
    assert len(opts) == 3 and len({o["wayId"] for o in opts}) == 1 and opts[0]["wayId"].startswith("way-")


def test_different_platform_or_step_free_is_a_different_way():
    raw = copy.deepcopy(RAW)
    raw["journeys"][1]["legs"][1]["origin"]["properties"]["platformName"] = "Platform 1"
    opts = plan(planner(Client(raw)))
    assert opts[0]["wayId"] != opts[1]["wayId"] and opts[0]["wayId"] == opts[2]["wayId"]
    unsure = plan(planner(Client(RAW)), walk=walk_ok())
    stepped = TransitPlanner(Client(RAW), now=lambda: FIRST_DEP - timedelta(minutes=30))

    def walk_steps(a, b, profile, ctx):
        r = walk_ok()(a, b, profile, ctx)
        r["accessible"] = {**r["accessible"], "stepFree": False}
        return r
    assert stepped.plan(START, END, DEFAULT_PROFILE, Context(), [], walk_steps)[0]["wayId"] != unsure[0]["wayId"]


def test_departures_keep_their_own_alerts():
    later = parse_journeys(RAW)[1].legs[1]
    alert = [{"alertId": "a", "stopId": "200066", "text": "Gadigal Station Lift 4 to Platform 1 is not available", "url": None}]
    opts = plan(planner(Client(RAW)), alerts=alert)
    assert all(o["liftAlerts"] for o in opts)          # same stop for every departure: all carry it
    assert later.origin.stop_id == "200066"


def test_bus_stops_have_no_lift_stations():
    from tests.test_route_transit import campus_trip
    lib = Place(id="library", name="Waranara Library", kind="venue", lat=-33.775688, lng=151.113509)
    mort = Place(id="mortarboard-cafe", name="Mortarboard Cafe", kind="venue", lat=-33.772053, lng=151.11663)
    o = TransitPlanner(Client(campus_trip())).plan(lib, mort, DEFAULT_PROFILE, Context(), [], walk_ok())[0]
    assert o["stations"] == []


def test_trip_asks_for_nine_journeys():
    import httpx
    from app.transit.tfnsw import TfnswClient
    seen = {}
    def h(req):
        seen.update(req.url.params)
        return httpx.Response(200, json={"journeys": []})
    TfnswClient("https://t.test", "k", http=httpx.Client(transport=httpx.MockTransport(h))).trip(0, 0, 1, 1)
    assert seen["calcNumberOfTrips"] == "9"
