import httpx
import pytest

from app.transit.tfnsw import TfnswClient, TransitUnavailable
from tests.tfnsw_fixtures import load


def client(handler):
    return TfnswClient("https://tfnsw.test", "secret-key", http=httpx.Client(transport=httpx.MockTransport(handler)))


def test_trip_sends_key_in_header_and_wheelchair_on():
    seen = {}

    def h(req):
        seen["auth"], seen["params"] = req.headers["authorization"], dict(req.url.params)
        return httpx.Response(200, json=load("trip_townhall_chatswood"))

    raw = client(h).trip(-33.8731, 151.2070, -33.7969, 151.1810)
    assert raw["journeys"]
    assert seen["auth"] == "apikey secret-key"
    assert seen["params"]["wheelchair"] == "on" and seen["params"]["name_origin"] == "151.207000:-33.873100:EPSG:4326"
    assert "secret-key" not in str(seen["params"])


def test_lift_alerts_keeps_only_lift_announcements():
    raw = {"infos": {"current": [{"id": "a", "properties": {"announcementType": "liftsEscalators"}},
                                 {"id": "b", "properties": {"announcementType": "serviceChange"}}]}}
    alerts = client(lambda req: httpx.Response(200, json=raw)).lift_alerts()
    assert [a["id"] for a in alerts] == ["a"]


def _timeout(req):
    raise httpx.ConnectTimeout("slow")


@pytest.mark.parametrize("handler", [
    lambda req: httpx.Response(500, text="boom"),
    lambda req: httpx.Response(200, text="not json"),
    _timeout,
])
def test_failures_raise_transit_unavailable_without_the_key(handler):
    with pytest.raises(TransitUnavailable) as e:
        client(handler).trip(0, 0, 1, 1)
    assert "secret-key" not in str(e.value)


def test_stop_coord():
    raw = {"locations": [{"id": "204420", "coord": [-33.914459, 151.166526]}]}
    assert client(lambda req: httpx.Response(200, json=raw)).stop_coord("204420") == (-33.914459, 151.166526)
    assert client(lambda req: httpx.Response(200, json={"locations": []})).stop_coord("x") is None
