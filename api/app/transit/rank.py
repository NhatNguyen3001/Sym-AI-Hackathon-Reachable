"""Orders trip options (spec section 5). Scores only order the list; the minutes shown are always real."""
WALK_BONUS = 5    # a walk within 5 minutes of a transit trip wins: fewer unknowns
CHANGE = 5        # changes are hard with a wheelchair
LIFT_ALERT = 15   # a lift alert somewhere on the trip, not on our platform
UNSURE = 5        # a walk step we are not sure about
MAX_OPTIONS = 3


def _score(o: dict) -> float:
    if o["mode"] == "walk":
        return o["minutes"] - WALK_BONUS
    return (o["minutes"] + CHANGE * o["interchanges"] + LIFT_ALERT * sum(not a["blocking"] for a in o["liftAlerts"])
            + UNSURE * o.get("unsure", 0))


def rank(options: list[dict]) -> list[dict]:
    clear = [o for o in options if not any(a["blocking"] for a in o["liftAlerts"])]
    ranked = sorted(clear or options, key=_score)  # stable: the walk is listed first, so it wins ties
    return [{k: v for k, v in o.items() if k != "unsure"} for o in ranked[:MAX_OPTIONS]]
