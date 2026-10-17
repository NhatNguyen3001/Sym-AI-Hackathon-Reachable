import io
from types import SimpleNamespace

from PIL import Image

from app.llm.vision import PhotoOut


def jpeg(exif=False):
    b = io.BytesIO()
    img = Image.new("RGB", (40, 30), "orange")
    if exif:
        ex = Image.Exif()
        ex[0x8825] = {2: (33.0, 46.0, 0.0)}  # GPS latitude
        img.save(b, "JPEG", exif=ex)
    else:
        img.save(b, "JPEG")
    return b.getvalue()


def upload(client, data=None, name="p.jpg", ctype="image/jpeg"):
    return client.post("/reports/label", files={"photo": (name, data if data is not None else jpeg(), ctype)})


class FakeVision:
    def __init__(self, label):
        out = SimpleNamespace(stop_reason="end_turn", parsed_output=PhotoOut(label=label, description="Looks like fencing across the path."))
        self.messages = SimpleNamespace(parse=lambda **kw: out)


def test_label_upload_without_claude(client):
    r = upload(client).json()
    assert r["photoUrl"].startswith("/uploads/") and r["aiLabel"] is None and r["aiText"] == ""
    assert client.get(r["photoUrl"]).status_code == 200


def test_upload_strips_location_metadata(client):
    url = upload(client, jpeg(exif=True)).json()["photoUrl"]
    saved = Image.open(io.BytesIO(client.get(url).content))
    assert 0x8825 not in saved.getexif()


def test_label_with_claude(client):
    client.app.state.llm = FakeVision("blocked")
    r = upload(client).json()
    assert r["aiLabel"] == "blocked" and r["aiText"].startswith("Looks like")


def test_label_rejects_non_image(client):
    r = upload(client, b"hello", "a.txt", "text/plain")
    assert r.status_code == 415 and r.json()["error"]["code"] == "not_an_image"


def test_label_rejects_fake_image(client):
    r = upload(client, b"not really a jpeg")
    assert r.status_code == 415


def test_label_rejects_large(client):
    r = upload(client, b"0" * (10 * 1024 * 1024 + 1))
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


def roadworks(client):
    return client.get("/updates", params={"type": "roadworks"}).json()[0]


def test_report_without_ai_label_needs_checking(client, campus_roadwork):
    rw = roadworks(client)
    url = upload(client).json()["photoUrl"]
    r = client.post("/reports", json={"photoUrl": url, "lat": rw["lat"], "lng": rw["lng"], "userLabel": "blocked", "note": ""})
    assert r.status_code == 200 and r.json()["status"] == "pending"
    items = client.get("/updates", params={"type": "report"}).json()
    assert items[0]["status"] == "Needs checking" and items[0]["title"] == "Footpath blocked"


def test_report_matching_roadworks_is_confirmed(client, campus_roadwork):
    client.app.state.llm = FakeVision("blocked")
    rw = roadworks(client)
    up = upload(client).json()
    client.post("/reports", json={"photoUrl": up["photoUrl"], "lat": rw["lat"] + 0.0002, "lng": rw["lng"],
                                  "userLabel": up["aiLabel"], "note": ""})
    item = client.get("/updates", params={"type": "report"}).json()[0]
    assert item["status"] == "Confirmed"
    assert "matched to a roadworks notice" in item["source"]
    assert client.get("/agents/status").json()[1]["status"] == "Idle"


def test_fine_report_resolves_nearby_barrier(client):
    kerb = next(i for i in client.get("/updates").json() if i["title"] == "Kerb ramp may be damaged")
    client.post("/reports", json={"photoUrl": None, "lat": kerb["lat"], "lng": kerb["lng"], "userLabel": "fine", "note": ""})
    after = next(i for i in client.get("/updates").json() if i["id"] == kerb["id"])
    assert after["status"] == "Resolved"


def test_report_has_no_user_fields(client):
    r = client.post("/reports", json={"photoUrl": None, "lat": -33.776, "lng": 151.115, "userLabel": "stairs", "note": "x"}).json()
    assert set(r) == {"id", "photoUrl", "aiLabel", "userLabel", "note", "lat", "lng", "status", "barrierId", "createdAt"}


def test_report_bad_label(client):
    assert client.post("/reports", json={"lat": 0, "lng": 0, "userLabel": "aliens"}).status_code == 422


def test_report_rejects_foreign_photo_url(client):
    r = client.post("/reports", json={"photoUrl": "https://evil.example/x.jpg", "lat": 0, "lng": 0, "userLabel": "stairs"})
    assert r.status_code == 422


def test_two_agreeing_reports_on_route_reroute_it(client):
    client.app.state.llm = FakeVision("blocked")
    body = {"from": "mq-station", "to": "library"}
    before = client.post("/route", json=body).json()
    coords = before["accessible"]["geometry"]["coordinates"]
    lng, lat = coords[len(coords) // 2]
    for _ in range(2):
        up = upload(client).json()
        client.post("/reports", json={"photoUrl": up["photoUrl"], "lat": lat, "lng": lng, "userLabel": "blocked", "note": ""})
    item = client.get("/updates", params={"type": "report"}).json()[0]
    assert item["status"] == "Confirmed" and "nearby reports" in item["source"]
    after = client.post("/route", json=body).json()
    assert after["ok"] is False or after["accessible"]["geometry"]["coordinates"] != coords
    if after["ok"]:
        assert any(b["status"] == "confirmed" for b in after["barriers"])
