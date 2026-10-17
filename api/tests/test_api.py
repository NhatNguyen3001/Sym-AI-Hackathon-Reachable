from tests.conftest import NORTH_OUT, SOUTH_OUT


def body(**kw):
    return {"from": "mq-station", "to": "library", "profile": {"aid": "manual_wheelchair", "maxSlope": 5}, **kw}


def test_places_search(client):
    r = client.get("/places", params={"q": "mac"}).json()
    assert r[0] == {"id": "mq-station", "name": "Macquarie University station", "kind": "station", "lat": -33.77735, "lng": 151.11825}


def test_route_demo_trip(client, lifts_live):
    r = client.post("/route", json=body()).json()
    assert r["ok"] and r["exitUsed"] == "north"
    assert {l["exitId"]: l["status"] for l in r["liftStatus"]} == {"north": "Working", "south": "Out of service"}
    assert r["explanation"].startswith("Use the lift at the north exit, as the south exit lift is out of service.")
    assert r["status"] in ("Confirmed today", "Some details not sure")
    assert r["accessible"]["geometry"]["type"] == "LineString"
    assert r["weather"]["raining"] is False
    assert "edges" not in r


def test_route_without_profile_uses_default(client):
    assert client.post("/route", json={"from": "mq-station", "to": "library"}).json()["ok"] is True


def test_route_unknown_place(client):
    r = client.post("/route", json=body(to="nowhere"))
    assert r.status_code == 404 and r.json()["error"]["code"] == "place_not_found"


def test_route_bad_profile_is_422(client):
    r = client.post("/route", json=body(profile={"maxSlope": 40}))
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_live_lift_outages_change_route(client, lifts_live):
    lifts_live([SOUTH_OUT, NORTH_OUT])
    r = client.post("/route", json=body()).json()
    assert r["ok"] is False and "nearby station" in r["suggestion"]
    assert r["reason"] == "Every lift at Macquarie University station is out of service."
    lifts_live([NORTH_OUT])
    assert client.post("/route", json=body()).json()["exitUsed"] == "south"
    assert client.post("/demo/lifts/north").status_code == 404  # the demo lift toggle is gone


def test_rain_toggle(client):
    assert client.post("/demo/rain").json()["raining"] is True
    assert client.get("/weather").json()["raining"] is True
    assert client.post("/route", json=body()).json()["weather"]["raining"] is True
    types = [i["type"] for i in client.get("/updates").json()]
    assert "weather" in types


def test_updates_feed_and_filter(client, lifts_live):
    items = client.get("/updates").json()
    assert len(items) >= 5
    first = items[0]
    assert set(first) >= {"id", "type", "title", "place", "time", "source", "status", "tone"}
    t = client.get("/updates", params={"type": "transport"}).json()
    assert t and all(i["type"] == "transport" for i in t)
    assert t[0]["title"] == "Lift out of service" and t[0]["status"] == "Confirmed" and t[0]["tone"] == "warn"
    assert client.get("/updates", params={"type": "all"}).json() == items
    rw = client.get("/updates", params={"type": "roadworks"}).json()[0]
    assert rw["lat"] is not None and rw["lng"] is not None


def test_agents_status(client):
    cards = client.get("/agents/status").json()
    assert [a["name"] for a in cards] == ["Updates agent", "Report checker", "Venue agent", "Route agent"]
    assert cards[0]["status"] == "Running"


def test_venue_check(client):
    v = client.get("/venue/library-cafe/check").json()
    assert [(c["field"], c["status"]) for c in v["checks"]] == [
        ("Level entrance", "Confirmed"), ("Step-free inside", "Likely"), ("Accessible toilet", "Not found")]
    assert v["checks"][2]["source"] == "Not mentioned in any source"
    assert v["sourceCount"] == 4 and v["checkedAgo"] == "2 min ago"


def test_amenities_offer_a_place_to_route_to(client):
    pins = client.get("/amenities").json()
    found = {(p["placeId"], p["kind"]) for p in pins}
    assert ("library", "entrance") in found
    assert ("library", "toilet") in found
    assert ("library", "parking") in found
    assert ("library-cafe", "toilet") not in found
    assert all(p["name"] and p["lat"] and p["lng"] for p in pins)


def test_venue_check_unchecked_place_and_unknown(client):
    v = client.get("/venue/mortarboard-cafe/check").json()
    assert v["checkedBy"] == "Not checked yet" and all(c["status"] == "Not checked" for c in v["checks"])
    assert client.get("/venue/nope/check").status_code == 404


def test_station_lifts(client):
    rows = client.get("/stations/mq-station/lifts").json()
    assert {r["exitId"]: r["exit"] for r in rows} == {"north": "North exit lift", "south": "South exit lift"}
    assert {r["status"] for r in rows} == {"Not sure"} and rows[0]["source"] == "Live lift alerts are off"
    assert client.get("/stations/library/lifts").status_code == 404


def test_profile_parse(client):
    p = client.post("/profile/parse", json={"text": "power wheelchair, need parking"}).json()
    assert p["aid"] == "power_wheelchair" and p["destination"]["parking"] is True and p["maxSlope"] == 8


def test_updates_run_logs(client):
    r = client.post("/agents/updates/run").json()
    assert r["ok"] is True and r["summary"] == "Live lift alerts are off. Checked the weather."
