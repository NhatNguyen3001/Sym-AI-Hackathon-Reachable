"""Orders trip options (spec section 5). Scores only order the list; the minutes shown are always real.

Options are grouped into ways (same lines, stops, platforms and step-free status, spec §10.2): at most
MAX_WAYS ways, best first, each with at most DEPARTURES_PER_WAY departures in leaving order."""
WALK_BONUS = 5    # a walk within 5 minutes of a transit trip wins: fewer unknowns
CHANGE = 5        # changes are hard with a wheelchair
LIFT_ALERT = 15   # a lift alert somewhere on the trip, not on our platform
UNSURE = 5        # a walk step we are not sure about
MAX_WAYS = 3
DEPARTURES_PER_WAY = 3


def _score(o: dict) -> float:
    if o["mode"] == "walk":
        return o["minutes"] - WALK_BONUS
    return (o["minutes"] + CHANGE * o["interchanges"] + LIFT_ALERT * sum(not a["blocking"] for a in o["liftAlerts"])
            + UNSURE * o.get("unsure", 0))


def rank(options: list[dict]) -> list[dict]:
    clear = [o for o in options if not any(a["blocking"] for a in o["liftAlerts"])]
    ways: dict[str, list[dict]] = {}
    for o in sorted(clear or options, key=_score):  # stable: the walk is listed first, so it wins ties
        ways.setdefault(o.get("wayId", o["id"]), []).append(o)
    out = []
    for group in list(ways.values())[:MAX_WAYS]:
        out += sorted(group, key=lambda o: o.get("leaveAt") or "")[:DEPARTURES_PER_WAY]
    return [{k: v for k, v in o.items() if k != "unsure"} for o in out]
