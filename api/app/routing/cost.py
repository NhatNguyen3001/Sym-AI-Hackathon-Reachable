import math
from dataclasses import dataclass, field
from app.routing.profile import Profile

SLIPPERY = {"tiles", "metal", "paving_stones", "grass", "wood"}
UNEVEN = {"gravel", "grass", "dirt", "ground", "unpaved", "fine_gravel"}
RAISED_KERBS = {"raised", "yes", "regular", "rolled"}


@dataclass
class Context:
    raining: bool = False
    barriers: dict[str, str] = field(default_factory=dict)
    lift_out_exits: set[str] = field(default_factory=set)


def tag_set(value) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        return {str(v) for v in value}
    return {str(value)}


def is_steps(data: dict) -> bool:
    return data.get("kind") == "steps" or "steps" in tag_set(data.get("highway"))


def edge_cost(edge_key: str, data: dict, profile: Profile, ctx: Context) -> float:
    cost = float(data.get("length", 0.0))
    if is_steps(data) and profile.avoid.stairs:
        return math.inf
    if data.get("kind") == "lift" and data.get("exit_id") in ctx.lift_out_exits:
        return math.inf
    slope = float(data.get("grade_abs", 0.0) or 0.0) * 100
    if slope > profile.max_slope:
        return math.inf
    cost *= 1 + (slope / profile.max_slope) * 2
    surfaces = tag_set(data.get("surface"))
    if ctx.raining and profile.avoid.slippery_when_wet and surfaces & SLIPPERY and slope > 3:
        cost *= 3
    if profile.avoid.kerbs_no_ramp and tag_set(data.get("kerb")) & RAISED_KERBS:
        return math.inf
    if profile.avoid.uneven and surfaces & UNEVEN:
        cost *= 4
    status = ctx.barriers.get(edge_key)
    if status == "confirmed":
        return math.inf
    if status == "needs_checking":
        cost *= 5
    return cost
