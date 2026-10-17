
import httpx
import pytest
from sqlmodel import Session

from app.db import init_db, make_engine
from app.places.overpass import OverpassClient
from app.places.photon import PhotonClient, SearchUnavailable
from app.places.resolver import PlaceResolver
from app.routing.geo import parse_bbox
from tests.test_campus_graph import PL

BBOX = parse_bbox("149.97,-34.33,151.63,-32.99")


def feature(osm_type, osm_id, lng, lat, **props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {"osm_type": osm_type, "osm_id": osm_id, **props}}


TOWN_HALL = feature("N", 1763901273, 151.2068498, -33.873567, osm_key="railway", osm_value="station",
                    name="Town Hall", district="Sydney", city="Sydney")
CAFE = feature("N", 55, 151.2060, -33.8730, osm_key="amenity", osm_value="cafe", name="Town Hall Cafe", city="Sydney")
ADDRESS = feature("W", 77, 151.0027, -33.8129, osm_key="building", osm_value="yes", housenumber="12",
                  street="George Street", district="Parramatta")
NOTHING = feature("N", 88, 151.1, -33.8, osm_key="highway", osm_value="bus_stop")


def photon_with(features=None, status=200, raise_exc=None, seen=None):
    def handler(req):
        if seen is not None:
            seen.append(req)
        if raise_exc:
            raise raise_exc
        return httpx.Response(status, json={"features": features or []})
    return PhotonClient("https://photon.example", http=httpx.Client(transport=httpx.MockTransport(handler)))


def overpass_with(elements=None, fail=False, calls=None):
    def handler(req):
        if calls is not None:
            calls.append(req)
        if fail:
            return httpx.Response(504, text="busy")
        return httpx.Response(200, json={"elements": elements or []})
    return OverpassClient("https://overpass.example/api/interpreter", http=httpx.Client(transport=httpx.MockTransport(handler)))


@pytest.fixture
def engine(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path / 'p.db'}")
    init_db(eng)
    return eng


def resolver(engine, photon=None, overpass=None):
    return PlaceResolver(PL, photon, overpass, engine, BBOX)


def test_photon_mapping_station_first(engine):
    seen = []
    places, limited = resolver(engine, photon_with([CAFE, TOWN_HALL], seen=seen)).search("town hall")
    assert not limited
    assert [p.id for p in places] == ["osm:N1763901273", "osm:N55"]
    assert places[0].kind == "station" and places[0].detail == "Sydney" and places[1].kind == "venue"
    q = seen[0].url.params
    assert q["q"] == "town hall" and q["bbox"] == "149.97,-34.33,151.63,-32.99" and q["lang"] == "en"
    assert seen[0].headers["user-agent"].startswith("Reachable/")


def test_unnamed_feature_uses_address(engine):
    places, _ = resolver(engine, photon_with([ADDRESS, NOTHING])).search("12 george")
    assert [(p.id, p.name, p.kind) for p in places] == [("osm:W77", "12 George Street", "place")]


def test_results_cached_and_resolvable(engine):
    resolver(engine, photon_with([TOWN_HALL])).search("town hall")
    fresh = resolver(engine, photon=None)
    p = fresh.get("osm:N1763901273")
    assert p and p.name == "Town Hall" and p.kind == "station" and (p.lat, p.lng) == (-33.873567, 151.2068498)


def test_known_places_merged_and_deduped(engine):
    places, _ = resolver(engine, photon_with([CAFE])).search("macquarie")
    assert places[0].id == "mq-station"
    assert len({p.id for p in places}) == len(places)


def test_photon_down_returns_known_and_limited(engine):
    places, limited = resolver(engine, photon_with(raise_exc=httpx.ConnectError("down"))).search("library")
    assert limited and [p.id for p in places] == ["library-cafe", "library"]
    _, limited2 = resolver(engine, photon_with(status=500)).search("library")
    assert limited2


def test_short_query_skips_photon(engine):
    seen = []
    places, limited = resolver(engine, photon_with([CAFE], seen=seen)).search("l")
    assert seen == [] and not limited and all(p.id in {"library", "library-cafe", "globe-cafe", "mq-station",
                                                       "lincoln-building", "ainsworth-building", "mortarboard-cafe"} for p in places)


def test_photon_disabled_is_not_limited(engine):
    places, limited = resolver(engine, None).search("library")
    assert not limited and [p.id for p in places] == ["library-cafe", "library"]


def test_coord_id(engine):
    r = resolver(engine)
    assert r.get("coord:-33.87,151.21").name == "Pinned location"
    here = r.get("coord:here:-33.87,151.21")
    assert here.name == "Your location" and (here.lat, here.lng) == (-33.87, 151.21)


def test_bad_coord_id(engine):
    r = resolver(engine)
    assert r.get("coord:abc") is None and r.get("coord:-95,151") is None


def test_unknown_osm_id(engine):
    assert resolver(engine).get("osm:N999") is None


def test_station_exits_from_overpass_cached(engine):
    calls = []
    elements = [{"type": "node", "id": 5, "lat": -33.8731, "lon": 151.2061, "tags": {"railway": "train_station_entrance", "name": "George St"}},
                {"type": "node", "id": 6, "lat": -33.8740, "lon": 151.2070, "tags": {"railway": "train_station_entrance"}}]
    r = resolver(engine, photon_with([TOWN_HALL]), overpass_with(elements, calls=calls))
    r.search("town hall")
    st = r.get("osm:N1763901273")
    r.ensure_exits(st)
    assert [e["name"] for e in st.exit_points] == ["George St entrance", "Entrance 2"]
    assert all(e["via"] == "unknown" for e in st.exit_points)
    again = resolver(engine, None, overpass_with(elements, calls=calls)).get("osm:N1763901273")
    resolver(engine, None, overpass_with(elements, calls=calls)).ensure_exits(again)
    assert len(calls) == 1 and len(again.exit_points) == 2


def test_overpass_failure_means_no_exits_and_retries_later(engine):
    calls = []
    r = resolver(engine, photon_with([TOWN_HALL]), overpass_with(fail=True, calls=calls))
    r.search("town hall")
    st = r.get("osm:N1763901273")
    r.ensure_exits(st)
    assert st.exit_points == []
    r.ensure_exits(r.get("osm:N1763901273"))
    assert len(calls) == 2  # failure is not cached


def test_known_station_keeps_its_exits(engine):
    r = resolver(engine, None, overpass_with(fail=True))
    st = r.get("mq-station")
    r.ensure_exits(st)
    assert [e["id"] for e in st.exit_points] == ["north", "south"]


# --- endpoint ---------------------------------------------------------------------------------------------------

def test_places_endpoint_limited_header(client):
    client.app.state.resolver.photon = photon_with(raise_exc=httpx.ConnectError("down"))
    r = client.get("/places", params={"q": "library"})
    assert r.headers.get("x-search-limited") == "1" and r.json()[0]["id"] == "library-cafe"


def test_places_endpoint_detail(client):
    client.app.state.resolver.photon = photon_with([TOWN_HALL])
    r = client.get("/places", params={"q": "town hall"}).json()
    assert r[0] == {"id": "osm:N1763901273", "name": "Town Hall", "kind": "station", "lat": -33.873567,
                    "lng": 151.2068498, "detail": "Sydney"}
    assert "x-search-limited" not in client.get("/places", params={"q": "town hall"}).headers


def test_unknown_osm_id_404(client):
    r = client.post("/route", json={"from": "osm:N999", "to": "library"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "place_not_found"


def test_venue_check_for_cached_place(client):
    client.app.state.resolver.photon = photon_with([CAFE])
    client.get("/places", params={"q": "town hall"})
    v = client.get("/venue/osm:N55/check").json()
    assert v["name"] == "Town Hall Cafe" and v["checkedBy"] == "Not checked yet"


def test_photon_client_raises_on_error():
    with pytest.raises(SearchUnavailable):
        photon_with(status=502).search("x", BBOX)
