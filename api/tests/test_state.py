from sqlmodel import Session
from app.db import make_engine, init_db
from app.models import Barrier
from app.state import build_context


def test_barrier_blocks_both_directions(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path / 's.db'}")
    init_db(eng)
    with Session(eng) as s:
        s.add(Barrier(type="blocked", title="t", place="p", lat=0, lng=0, edge_id="10-20-0", status="confirmed"))
        s.commit()
        ctx = build_context(s, raining=False)
    assert ctx.barriers == {"10-20-0": "confirmed", "20-10-0": "confirmed"}


def test_confirmed_wins_over_needs_checking_on_same_edge(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path / 's.db'}")
    init_db(eng)
    with Session(eng) as s:
        s.add(Barrier(type="blocked", title="t", place="p", lat=0, lng=0, edge_id="10-20-0", status="confirmed"))
        s.add(Barrier(type="narrow", title="t", place="p", lat=0, lng=0, edge_id="20-10-0", status="needs_checking"))
        s.commit()
        ctx = build_context(s, raining=False)
    assert ctx.barriers["10-20-0"] == "confirmed" and ctx.barriers["20-10-0"] == "confirmed"
