from sqlmodel import Session, select
from app.db import make_engine, init_db
from app.models import Barrier, Venue, AgentRun
from app.seed import seed
from tests.test_campus_graph import G, PL


def test_seed_is_idempotent(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path / 's.db'}")
    init_db(eng)
    with Session(eng) as s:
        seed(s, G, PL)
        seed(s, G, PL)
        lifts = s.exec(select(Barrier).where(Barrier.type == "lift_outage")).all()
        assert lifts == []  # lift status is live from Transport for NSW, never seeded
        barriers = s.exec(select(Barrier)).all()
        assert len(barriers) == 3
        assert all("(demo data)" in src["label"] for b in barriers for src in b.sources if src["kind"] != "user")
        assert all(b.edge_id for b in barriers if b.type != "lift_outage")
        assert s.get(Venue, "library") is not None and s.get(Venue, "library-cafe") is not None
        assert len(s.exec(select(AgentRun)).all()) == 4


def test_old_demo_lift_outage_is_retired(tmp_path):
    from app.seed import retire_demo_lifts
    eng = make_engine(f"sqlite:///{tmp_path / 'old.db'}")
    init_db(eng)
    with Session(eng) as s:
        s.add(Barrier(type="lift_outage", title="Lift out of service", place="Macquarie University station, south exit",
                      lat=0, lng=0, exit_id="south", status="confirmed"))
        s.add(Barrier(id="tfnsw-ems-1", type="lift_outage", title="Lift out of service", place="x", lat=0, lng=0,
                      status="confirmed"))
        s.commit()
        retire_demo_lifts(s)
        left = s.exec(select(Barrier).where(Barrier.type == "lift_outage")).all()
        assert [b.id for b in left] == ["tfnsw-ems-1"]
