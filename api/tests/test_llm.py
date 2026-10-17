from types import SimpleNamespace
from app.llm.explain import template_explanation
from app.llm.vision import label_photo, PhotoOut

FACTS = {"ok": True, "minutesLonger": 4, "exitName": "north exit", "liftsOut": ["south exit"], "raining": False, "avoided": []}


def test_no_client_uses_fallback():
    assert label_photo(b"x", "image/jpeg", None) == (None, "")


class Boom:
    class messages:
        @staticmethod
        def parse(**kw):
            raise RuntimeError("down")

        @staticmethod
        def create(**kw):
            raise RuntimeError("down")


def test_client_errors_fall_back():
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


TRANSIT_OPT = {"legs": [{"kind": "walk", "source": "reachable", "minutes": 7, "stepFree": True, "to": "Gadigal Station"},
                        {"kind": "station", "station": "Gadigal Station", "path": [{"type": "lift", "label": "Lift down"}]},
                        {"kind": "ride", "label": "Metro M1", "stops": 5, "to": {"name": "Chatswood Station"}},
                        {"kind": "walk", "source": "reachable", "minutes": 3, "stepFree": True, "to": "436 Victoria Av"}],
               "warnings": []}


def test_template_transit():
    from app.llm.explain import template_transit
    assert template_transit(TRANSIT_OPT) == ("Walk 7 min on a step-free path to Gadigal Station, take the lift, ride the "
                                             "Metro M1 5 stops to Chatswood Station, then walk 3 min.")
    warned = template_transit({**TRANSIT_OPT, "warnings": ["Lift 3 at Sydenham is out. Check before you go."]})
    assert warned.endswith(" Lift 3 at Sydenham is out. Check before you go.")
