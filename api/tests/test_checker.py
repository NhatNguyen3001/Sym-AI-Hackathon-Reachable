from app.checker import decide
from app.models import Report, Barrier


def rep(ai, user):
    return Report(ai_label=ai, user_label=user, lat=0, lng=0, photo_url="/uploads/x.jpg")


B = Barrier(type="blocked", title="t", place="p", lat=0, lng=0, status="confirmed")


def test_fine_with_barrier_resolves():
    assert decide(rep("fine", "fine"), [B], 0, False) == ("confirmed", "resolve")


def test_fine_without_barrier_rejected():
    assert decide(rep("fine", "fine"), [], 0, False) == ("rejected", None)


def test_agree_and_nearby_barrier_confirms():
    assert decide(rep("blocked", "blocked"), [B], 0, False) == ("confirmed", "confirm")


def test_agree_and_roadworks_confirms():
    assert decide(rep("blocked", "blocked"), [], 0, True) == ("confirmed", "confirm")


def test_agree_and_other_report_confirms():
    assert decide(rep("stairs", "stairs"), [], 1, False) == ("confirmed", "confirm")


def test_agree_but_alone_needs_checking():
    assert decide(rep("stairs", "stairs"), [], 0, False) == ("needs_checking", "needs_checking")


def test_disagree_needs_checking():
    assert decide(rep("stairs", "blocked"), [B], 0, True) == ("needs_checking", "needs_checking")


def test_no_ai_label_needs_checking():
    assert decide(rep(None, "blocked"), [], 0, True) == ("needs_checking", "needs_checking")
