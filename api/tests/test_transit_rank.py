from app.transit.rank import rank


def opt(id, mode, minutes, changes=0, alerts=(), unsure=0):
    return {"id": id, "mode": mode, "minutes": minutes, "interchanges": changes, "unsure": unsure,
            "liftAlerts": [{"blocking": b} for b in alerts]}


def test_walk_within_five_minutes_wins():
    assert [o["id"] for o in rank([opt("walk", "walk", 25), opt("t0", "transit", 20)])] == ["walk", "t0"]
    assert [o["id"] for o in rank([opt("walk", "walk", 26), opt("t0", "transit", 20)])] == ["t0", "walk"]


def test_changes_and_alerts_push_options_down():
    r = rank([opt("t0", "transit", 20, changes=2), opt("t1", "transit", 24), opt("t2", "transit", 18, alerts=[False])])
    assert [o["id"] for o in r] == ["t1", "t0", "t2"]


def test_unsure_walk_steps_push_options_down():
    assert [o["id"] for o in rank([opt("t0", "transit", 20, unsure=2), opt("t1", "transit", 25)])] == ["t1", "t0"]


def test_blocking_only_kept_when_nothing_else():
    assert [o["id"] for o in rank([opt("t0", "transit", 10, alerts=[True]), opt("t1", "transit", 30)])] == ["t1"]
    assert [o["id"] for o in rank([opt("t0", "transit", 10, alerts=[True])])] == ["t0"]


def test_at_most_three_and_internal_fields_removed():
    r = rank([opt(f"t{i}", "transit", 10 + i) for i in range(5)])
    assert len(r) == 3 and all("unsure" not in o for o in r)


def way(id, way_id, minutes, leave):
    return {**opt(id, "transit", minutes), "wayId": way_id, "leaveAt": leave}


def test_rank_caps_three_ways_three_departures():
    options = [way(f"{w}{d}", w, 20 + i, f"2026-10-17T10:{d}0:00+00:00")
               for i, w in enumerate("abcd") for d in (4, 1, 3, 2)]
    r = rank(options)
    assert [o["wayId"] for o in r] == ["a"] * 3 + ["b"] * 3 + ["c"] * 3
    assert [o["leaveAt"][14:16] for o in r[:3]] == ["10", "20", "30"]   # each way's departures by leave time


def test_walk_is_its_own_way():
    r = rank([{**opt("walk", "walk", 15), "wayId": "walk"}, way("t0", "x", 20, "2026-10-17T10:00:00+00:00")])
    assert [o["id"] for o in r] == ["walk", "t0"]
