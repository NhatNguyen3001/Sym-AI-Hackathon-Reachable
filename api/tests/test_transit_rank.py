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
