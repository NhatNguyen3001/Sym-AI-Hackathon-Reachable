import httpx

from app.mapdata.osm import SYDNEY, classify, tile_key, tiles
from app.places.overpass import OverpassClient


def node(tags, id_=1, lat=-33.77, lon=151.12):
    return {"type": "node", "id": id_, "lat": lat, "lon": lon, "tags": tags}


def test_accessible_toilet():
    p = classify(node({"amenity": "toilets", "wheelchair": "yes"}))
    assert p["kind"] == "toilet" and p["name"] == "Accessible toilet"
    assert p["id"] == "place:osm-n1" and p["osm_id"] == "node/1"
    assert p["tags"] == {"amenity": "toilets", "wheelchair": "yes"}


def test_toilet_inside_a_cafe_counts_as_a_toilet():
    p = classify(node({"amenity": "cafe", "name": "Globe", "toilets:wheelchair": "designated"}))
    assert p["kind"] == "toilet" and p["name"] == "Globe"


def test_parking():
    assert classify(node({"amenity": "parking_space", "parking_space": "disabled"}))["kind"] == "parking"
    assert classify(node({"amenity": "parking", "capacity:disabled": "2"}))["kind"] == "parking"
    assert classify(node({"amenity": "parking", "capacity:disabled": "yes"}))["kind"] == "parking"
    assert classify(node({"amenity": "parking", "capacity:disabled": "0"})) is None


def test_entrance_and_venue():
    assert classify(node({"entrance": "main", "wheelchair": "yes"}))["kind"] == "entrance"
    v = classify(node({"shop": "supermarket", "wheelchair": "yes", "name": "Woolworths"}))
    assert v["kind"] == "venue" and v["name"] == "Woolworths"


def test_not_accessible_or_unrelated_is_left_out():
    assert classify(node({"amenity": "cafe", "wheelchair": "no"})) is None
    assert classify(node({"amenity": "bench"})) is None
    assert classify(node({})) is None


def test_limited_toilet_is_kept_with_its_tag():
    p = classify(node({"amenity": "toilets", "wheelchair": "limited"}))
    assert p["kind"] == "toilet" and p["tags"]["wheelchair"] == "limited"


def test_way_uses_its_centre():
    p = classify({"type": "way", "id": 7, "center": {"lat": -33.8, "lon": 151.1},
                  "tags": {"amenity": "parking", "capacity:disabled": "3"}})
    assert (p["lat"], p["lng"], p["id"]) == (-33.8, 151.1, "place:osm-w7")


def test_tiles_cover_sydney_without_gaps():
    ts = tiles(SYDNEY)
    w, s, e, n = SYDNEY
    assert min(t[0] for t in ts) == w and max(t[2] for t in ts) == e
    assert min(t[1] for t in ts) == s and max(t[3] for t in ts) == n
    for lng in (w + 0.001, (w + e) / 2, e - 0.001):
        for lat in (s + 0.001, (s + n) / 2, n - 0.001):
            assert any(t[0] <= lng <= t[2] and t[1] <= lat <= t[3] for t in ts)
    assert len({tile_key(t) for t in ts}) == len(ts)


class _Http:
    def __init__(self, codes):
        self.codes, self.calls = list(codes), 0

    def post(self, url, data=None, headers=None, **kw):
        self.calls += 1
        code = self.codes.pop(0)
        body = {"elements": [node({"amenity": "toilets", "wheelchair": "yes"})]} if code == 200 else {}
        return httpx.Response(code, json=body, request=httpx.Request("POST", url))


def test_overpass_retries_with_backoff():
    slept = []
    c = OverpassClient("http://x", http=_Http([502, 502, 200]))
    els = c.accessible_places((151.0, -33.9, 151.3, -33.6), sleep=slept.append)
    assert len(els) == 1 and slept == [5, 10]


def test_overpass_gives_up_after_retries():
    c = OverpassClient("http://x", http=_Http([504] * 6))
    assert c.accessible_places((151.0, -33.9, 151.3, -33.6), sleep=lambda s: None) is None


class _Remark:
    """Overpass answers 200 with a remark when a query timed out or ran out of memory: the elements are partial."""
    def __init__(self):
        self.calls = 0

    def post(self, url, data=None, headers=None, **kw):
        self.calls += 1
        body = {"elements": [node({"amenity": "toilets", "wheelchair": "yes"})],
                "remark": "runtime error: Query timed out in \"query\" at line 1 after 91 seconds."}
        return httpx.Response(200, json=body, request=httpx.Request("POST", url))


def test_a_timed_out_answer_is_a_failure_not_a_short_list():
    http = _Remark()
    c = OverpassClient("http://x", http=http)
    assert c.accessible_places((151.0, -33.9, 151.3, -33.6), sleep=lambda s: None) is None
    assert http.calls == 6  # retried
