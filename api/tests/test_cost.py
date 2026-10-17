import math
from app.routing.cost import Context, edge_cost
from app.routing.profile import Profile, Avoid

P = Profile(max_slope=5)


def e(**kw):
    return {"length": 100.0, "highway": "footway", "grade_abs": 0.0, **kw}


def test_flat_edge_costs_its_length():
    assert edge_cost("a", e(), P, Context()) == 100.0


def test_steps_blocked_when_avoiding_stairs():
    assert edge_cost("a", e(highway="steps"), P, Context()) == math.inf
    assert edge_cost("a", e(kind="steps"), P, Context()) == math.inf


def test_steps_allowed_when_not_avoiding():
    p = Profile(avoid=Avoid(stairs=False))
    assert edge_cost("a", e(highway="steps"), p, Context()) == 100.0


def test_lift_edge_blocked_when_exit_out():
    d = e(kind="lift", exit_id="south")
    assert edge_cost("a", d, P, Context(lift_out_exits={"south"})) == math.inf
    assert edge_cost("a", d, P, Context()) == 100.0


def test_too_steep_blocked():
    assert edge_cost("a", e(grade_abs=0.06), P, Context()) == math.inf


def test_slope_penalty():
    # 4% of max 5% -> 1 + 0.8*2 = 2.6
    assert math.isclose(edge_cost("a", e(grade_abs=0.04), P, Context()), 260.0)


def test_rain_slippery_penalty():
    d = e(grade_abs=0.04, surface="paving_stones")
    dry = edge_cost("a", d, P, Context())
    assert math.isclose(edge_cost("a", d, P, Context(raining=True)), dry * 3)


def test_rain_no_penalty_below_3pct():
    d = e(grade_abs=0.02, surface="paving_stones")
    assert edge_cost("a", d, P, Context(raining=True)) == edge_cost("a", d, P, Context())


def test_raised_kerb_blocked():
    assert edge_cost("a", e(kerb="raised"), P, Context()) == math.inf
    assert edge_cost("a", e(kerb="lowered"), P, Context()) == 100.0


def test_uneven_penalty_only_when_avoiding():
    assert edge_cost("a", e(surface="gravel"), P, Context()) == 100.0
    p = Profile(avoid=Avoid(uneven=True))
    assert edge_cost("a", e(surface="gravel"), p, Context()) == 400.0


def test_barriers():
    assert edge_cost("a", e(), P, Context(barriers={"a": "confirmed"})) == math.inf
    assert edge_cost("a", e(), P, Context(barriers={"a": "needs_checking"})) == 500.0
    assert edge_cost("a", e(), P, Context(barriers={"a": "resolved"})) == 100.0


def test_list_valued_tags_are_handled():
    assert edge_cost("a", e(highway=["steps", "footway"]), P, Context()) == math.inf
