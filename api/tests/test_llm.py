from types import SimpleNamespace
from app.llm.profile import rule_parse, parse_profile, ProfileOut
from app.llm.explain import template_explanation, explain_route
from app.llm.vision import label_photo, PhotoOut

FACTS = {"ok": True, "minutesLonger": 4, "exitName": "north exit", "liftsOut": ["south exit"], "raining": False, "avoided": []}


def test_rule_parse_manual_wheelchair_slope_toilet():
    p = rule_parse("I use a manual wheelchair. Nothing steeper than 5%, and I need an accessible toilet.")
    assert p.aid == "manual_wheelchair" and p.max_slope == 5 and p.destination.toilet and p.avoid.stairs


def test_rule_parse_other_aids():
    assert rule_parse("power wheelchair").aid == "power_wheelchair"
    assert rule_parse("pushing a pram").aid == "pram"
    assert rule_parse("I use a walking frame").aid == "walker"
    cane = rule_parse("I walk with a cane, stairs are ok")
    assert cane.aid == "cane" and cane.avoid.stairs is False


def test_rule_parse_clamps_slope_and_defaults_by_aid():
    assert rule_parse("wheelchair, max 30%").max_slope == 12
    assert rule_parse("power wheelchair").max_slope == 8


def test_no_client_uses_fallback():
    assert parse_profile("walker", None).aid == "walker"
    assert label_photo(b"x", "image/jpeg", None) == (None, "")
    assert explain_route(FACTS, None) == template_explanation(FACTS)


class Boom:
    class messages:
        @staticmethod
        def parse(**kw):
            raise RuntimeError("down")

        @staticmethod
        def create(**kw):
            raise RuntimeError("down")


def test_client_errors_fall_back():
    assert parse_profile("walker", Boom()).aid == "walker"
    assert "north exit" in explain_route(FACTS, Boom())
    assert label_photo(b"x", "image/jpeg", Boom()) == (None, "")


class Fake:
    """Stands in for anthropic.Anthropic; records the request and returns a canned response."""
    def __init__(self, response):
        self.calls = []
        fake = self

        class M:
            @staticmethod
            def parse(**kw):
                fake.calls.append(kw)
                return response

            @staticmethod
            def create(**kw):
                fake.calls.append(kw)
                return response
        self.messages = M


def test_claude_profile_is_used_and_clamped():
    out = ProfileOut(aid="power_wheelchair", max_slope=20, avoid_stairs=True, avoid_kerbs_no_ramp=True,
                     avoid_slippery_when_wet=False, avoid_uneven=False, need_entrance=True, need_toilet=False, need_parking=True)
    c = Fake(SimpleNamespace(stop_reason="end_turn", parsed_output=out))
    p = parse_profile("my electric chair", c)
    assert p.aid == "power_wheelchair" and p.max_slope == 12 and p.destination.parking
    assert c.calls[0]["model"] == "claude-haiku-5-5"


def test_refusal_falls_back():
    c = Fake(SimpleNamespace(stop_reason="refusal", parsed_output=None, content=[]))
    assert parse_profile("walker", c).aid == "walker"
    assert explain_route(FACTS, c) == template_explanation(FACTS)


def test_claude_photo_label():
    c = Fake(SimpleNamespace(stop_reason="end_turn", parsed_output=PhotoOut(label="blocked", description="Looks like fencing.")))
    assert label_photo(b"abc", "image/jpeg", c) == ("blocked", "Looks like fencing.")
    img = c.calls[0]["messages"][0]["content"][0]
    assert img["type"] == "image" and img["source"]["data"] == "YWJj"


def test_template_mentions_outage_and_minutes():
    t = template_explanation({**FACTS, "raining": True, "avoided": ["stairs"]})
    assert t.startswith("Use the lift at the north exit, as the south exit lift is out of service.")
    assert "4 min longer than the fastest route" in t and "slippery" in t


def test_template_same_as_fastest_and_no_route():
    assert "also the fastest route" in template_explanation({**FACTS, "minutesLonger": 0, "liftsOut": []})
    assert "couldn't find a step-free route" in template_explanation({"ok": False})
