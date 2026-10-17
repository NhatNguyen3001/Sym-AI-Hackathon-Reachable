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
        assert len(lifts) == 1 and lifts[0].exit_id == "south" and lifts[0].status == "confirmed"
        barriers = s.exec(select(Barrier)).all()
        assert all("(demo data)" in src["label"] for b in barriers for src in b.sources if src["kind"] != "user")
        assert all(b.edge_id for b in barriers if b.type != "lift_outage")
        assert s.get(Venue, "library") is not None and s.get(Venue, "library-cafe") is not None
        assert len(s.exec(select(AgentRun)).all()) == 4
