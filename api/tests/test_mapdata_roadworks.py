from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx

from app.mapdata.osm import SYDNEY
from app.mapdata.roadworks import Verdict, Verdicts, judge, notices
from app.transit.tfnsw import TfnswClient

TZ = ZoneInfo("Australia/Sydney")
TODAY = date(2026, 10, 18)


def ms(y, m, d):
    return int(datetime(y, m, d, 12, tzinfo=TZ).timestamp() * 1000)


def feature(id_, lat=-33.78, lng=151.12, start=ms(2026, 10, 1), end=ms(2026, 11, 1), geom="Point", **props):
    return {"id": id_, "geometry": {"type": geom, "coordinates": [lng, lat]},
            "properties": {"displayName": "SCHEDULED ROADWORK", "headline": "Footpath works",
                           "roads": [{"mainStreet": "Herring Road", "suburb": "Macquarie Park"}],
                           "otherAdvice": "<p>Footpath <b>closed</b> on the north side</p>", "start": start, "end": end,
                           "periods": [], "webLinkUrl": "https://example.test/1", **props}}


def test_notices_keep_only_active_sydney_points_and_strip_html():
    feats = [feature(1), feature(2, end=ms(2026, 10, 10)), feature(3, start=ms(2026, 10, 25)),
             feature(4, lat=-35.3, lng=149.1), feature(5, geom="LineString"), feature(6, end=None)]
    out = notices(feats, SYDNEY, TODAY)
    assert [n["id"] for n in out] == ["lt-1", "lt-6"]
    n = out[0]
    assert n["road"] == "Herring Road" and n["suburb"] == "Macquarie Park"
    assert n["advice"] == "Footpath closed on the north side"
    assert (n["lat"], n["lng"]) == (-33.78, 151.12) and n["url"] == "https://example.test/1"
    assert n["title"] == "Footpath works"


def items(k):
    return [{"id": f"lt-{i}", "title": "t", "road": "r", "suburb": "s", "advice": "a", "periods": [], "url": None,
             "lat": 0, "lng": 0} for i in range(k)]


class FakeClaude:
    def __init__(self, answer=None, raise_=False, refusal=False):
        self.calls, self.answer, self.raise_, self.refusal = 0, answer, raise_, refusal
        self.messages = self

    def parse(self, **kw):
        self.calls += 1
        if self.raise_:
            raise RuntimeError("down")
        if self.refusal:
            return SimpleNamespace(stop_reason="refusal", parsed_output=None)
        ids = [line.split('"id": "')[1].split('"')[0] for line in kw["messages"][0]["content"].splitlines()
               if '"id": "' in line]
        verdicts = self.answer(ids) if self.answer else [Verdict(id=i, effect="blocks_path", sentence="Closed.") for i in ids]
        return SimpleNamespace(stop_reason="end_turn", parsed_output=Verdicts(verdicts=verdicts))


def test_no_claude_means_no_verdicts():
    assert judge(items(2), None) is None


def test_a_missing_verdict_counts_as_no():
    c = FakeClaude(answer=lambda ids: [Verdict(id=i, effect="may_affect", sentence="Maybe.") for i in ids[:2]])
    v = judge(items(3), c)
    assert v["lt-0"].effect == "may_affect" and v["lt-1"].effect == "may_affect"
    assert v["lt-2"].effect == "no"


def test_batches_of_25():
    c = FakeClaude()
    v = judge(items(30), c)
    assert c.calls == 2 and len(v) == 30 and v["lt-29"].effect == "blocks_path"


def test_live_hazards_uses_the_key_header_and_path():
    seen = {}

    class Http:
        def get(self, url, params=None, headers=None):
            seen.update(url=url, headers=headers, params=params)
            return httpx.Response(200, json={"features": [feature(1)]}, request=httpx.Request("GET", url))

    out = TfnswClient("https://api.example", "k-123", http=Http()).live_hazards("roadwork")
    assert seen["url"] == "https://api.example/v1/live/hazards/roadwork/open"
    assert seen["headers"]["Authorization"] == "apikey k-123"
    assert not seen["params"] and len(out) == 1


def test_a_claude_outage_is_no_verdict_at_all():
    """If a whole batch fails (rate limit, network), the run must not treat every roadwork as car-only."""
    assert judge(items(2), FakeClaude(raise_=True)) is None
    assert judge(items(2), FakeClaude(refusal=True)) is None


def test_one_failed_batch_of_several_is_also_no_verdict():
    class Flaky(FakeClaude):
        def parse(self, **kw):
            if self.calls == 1:
                self.calls += 1
                raise RuntimeError("rate limited")
            return super().parse(**kw)
    assert judge(items(30), Flaky()) is None
