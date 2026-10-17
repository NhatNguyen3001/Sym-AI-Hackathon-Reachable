from datetime import timezone

from app.transit.parse import Ride, Walk, parse_alert, parse_journeys, platform_numbers
from tests.tfnsw_fixtures import load


def test_townhall_chatswood_journey():
    j = parse_journeys(load("trip_townhall_chatswood"))[0]
    walk_in, ride, walk_out = j.legs
    assert isinstance(walk_in, Walk) and isinstance(ride, Ride) and isinstance(walk_out, Walk)
    assert (ride.mode, ride.line, ride.headsign) == ("metro", "M1", "Tallawong")
    assert (ride.origin.name, ride.origin.platform, ride.origin.stop_id) == ("Gadigal Station", "Platform 2", "200066")
    assert ride.dest.name == "Chatswood Station" and ride.depart.tzinfo == timezone.utc and ride.arrive > ride.depart
    assert ride.wheelchair is True and ride.stops >= 1 and ride.coords[0][0] > 150  # [lng, lat]
    p = walk_in.arrive_path
    assert p.station == "Gadigal Station" and "lift" in p.types and p.seconds > 0 and p.street is not None
    assert walk_out.leave_path.station == "Chatswood Station" and walk_out.leave_path.street is not None
    assert j.interchanges == 0


def test_interchange_journey_has_two_rides():
    j = next(j for j in parse_journeys(load("trip_interchange")) if j.interchanges >= 1)
    assert [r.line for r in j.legs if isinstance(r, Ride)] == ["M1", "T4"]


def test_platform_numbers():
    assert platform_numbers("Lift 3 between the concourse and Platform 2/3 is not available") == {"2", "3"}
    assert platform_numbers("Platforms 1 to 4") == {"1", "2", "3", "4"}
    assert platform_numbers("Platform 2") == {"2"}
    assert platform_numbers("Lift 1 between the concourse and Ryedale Rd") == set()


def test_parse_alert_cleans_text_and_reads_osm_ids():
    info = {"id": "ems-1", "url": "https://transportnsw.info/alerts/details#/ems-1",
            "subtitle": "John Street Square Light Rail Lift 2 is not available\n\nㅤ",
            "properties": {"stopIDglobalID": "2000123"},
            "affected": {"stops": [{"id": "2000123", "name": "John Street Square Light Rail"}],
                         "Infrastructures": [{"infrastructureIds": [{"provider": "osm", "id": "10738353787"}]}]}}
    a = parse_alert(info)
    assert a.text == "John Street Square Light Rail Lift 2 is not available"
    assert a.stop_ids == ["2000123"] and a.osm_ids == {10738353787} and a.station == "John Street Square Light Rail"


def test_parse_alert_falls_back_to_global_stop_id():
    a = parse_alert({"id": "x", "properties": {"stopIDglobalID": "204420", "smsText": "Lift out"}})
    assert a.stop_ids == ["204420"] and a.text == "Lift out" and a.osm_ids == set()


def test_recorded_alerts_all_parse():
    alerts = [parse_alert(i) for i in load("add_info_lifts")["infos"]["current"]]
    mq = next(a for a in alerts if a.id == "ems-test-mq1")
    assert mq.stop_ids == ["211310"] and mq.osm_ids == {9756349221}
    assert all(a.text and a.stop_ids for a in alerts)
