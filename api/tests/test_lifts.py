import asyncio

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.events import Broadcaster
from app.models import Barrier, now
from app.state import build_context, lift_rows
from app.transit.lifts import LiftAlertSync, LiftFeed, LiftPoller
from app.transit.parse import LiftAlert
from app.transit.tfnsw import TransitUnavailable
from tests.test_campus_graph import PL
from tests.tfnsw_fixtures import load

LIFT1 = LiftAlert(id="ems-mq1", text="Macquarie University Station Lift 1 is not available", url="u",
                  station="Macquarie University Station", stop_ids=["211310"], osm_ids={9756349221})
LIFT3 = LiftAlert(id="ems-mq3", text="Lift 3 between the concourse and the platform", url="u",
                  station="Macquarie University Station", stop_ids=["211310"], osm_ids={9756349262})
MQ_UNKNOWN = LiftAlert(id="ems-mq9", text="A lift at Macquarie University", url="u", station="Macquarie University Station",
                       stop_ids=["211310"], osm_ids=set())
SYD = LiftAlert(id="ems-80308", text="Sydenham Station Lift 3 between the concourse and Platform 2/3 is not available",
                url="https://transportnsw.info/alerts/details#/ems-80308", station="Sydenham Station", stop_ids=["204420"],
                osm_ids={10738353787})


def engine():
    e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)  # one in-memory db across threads
    SQLModel.metadata.create_all(e)
    return e


def fresh_feed():
    f = LiftFeed(enabled=True)
    f.last_ok = now()
    return f


def lifts(s):
    return {b.id: b for b in s.exec(select(Barrier).where(Barrier.type == "lift_outage")).all()}


def test_lift1_maps_to_north_exit_and_blocks_it():
    s = Session(engine())
    changes = LiftAlertSync(PL).sync(s, [LIFT1])
    b = lifts(s)["tfnsw-ems-mq1-north"]
    assert b.exit_id == "north" and b.status == "confirmed" and b.update_type == "transport"
    assert b.sources[0]["stopId"] == "211310" and b.sources[0]["alertId"] == "ems-mq1" and "demo" not in b.sources[0]["label"]
    assert changes == [{"exitId": "north", "station": "Macquarie University station, north exit", "status": "Out of service"}]
    assert build_context(s, False).lift_out_exits == {"north"}
    rows = {r["exitId"]: r["status"] for r in lift_rows(s, PL, "mq-station", fresh_feed())}
    assert rows == {"north": "Out of service", "south": "Working"}


def test_platform_lift_takes_out_both_exits():
    s = Session(engine())
    LiftAlertSync(PL).sync(s, [LIFT3])
    assert build_context(s, False).lift_out_exits == {"north", "south"}


def test_unknown_mq_lift_means_not_sure():
    s = Session(engine())
    LiftAlertSync(PL).sync(s, [MQ_UNKNOWN])
    assert build_context(s, False).lift_out_exits == set()
    assert {r["status"] for r in lift_rows(s, PL, "mq-station", fresh_feed())} == {"Not sure"}


def test_other_station_uses_stop_lookup_and_resolves_when_gone():
    s = Session(engine())
    sync = LiftAlertSync(PL, coord_lookup=lambda sid: (-33.914459, 151.166526))
    sync.sync(s, [SYD])
    b = lifts(s)["tfnsw-ems-80308"]
    assert (b.lat, b.lng, b.place, b.exit_id) == (-33.914459, 151.166526, "Sydenham Station", None)
    first = b.first_seen
    assert sync.sync(s, [SYD]) == []                    # seen again: no change, first_seen kept
    assert lifts(s)["tfnsw-ems-80308"].first_seen == first
    changes = sync.sync(s, [])
    b = lifts(s)["tfnsw-ems-80308"]
    assert b.status == "resolved" and b.title == "Lift working again"
    assert changes == [{"exitId": None, "station": "Sydenham Station", "status": "Working"}]
    sync.sync(s, [SYD])                                 # back again: active, new first_seen
    assert lifts(s)["tfnsw-ems-80308"].status == "confirmed"


def test_stop_lookup_failure_still_stores_the_alert():
    def boom(_):
        raise TransitUnavailable("down")
    s = Session(engine())
    LiftAlertSync(PL, coord_lookup=boom).sync(s, [SYD])
    b = lifts(s)["tfnsw-ems-80308"]
    assert (b.lat, b.lng) == (0.0, 0.0)


def test_stale_or_off_feed_says_not_sure():
    s = Session(engine())
    assert {r["status"] for r in lift_rows(s, PL, "mq-station", LiftFeed(enabled=True))} == {"Not sure"}
    off = lift_rows(s, PL, "mq-station", LiftFeed(enabled=False))
    assert {r["status"] for r in off} == {"Not sure"} and off[0]["source"] == "Live lift alerts are off"
    ok = lift_rows(s, PL, "mq-station", fresh_feed())
    assert {r["status"] for r in ok} == {"Working"} and ok[0]["source"] == "Transport for NSW"


class FakeClient:
    def __init__(self, raw=None, fail=False):
        self.raw, self.fail = raw or [], fail

    def lift_alerts(self):
        if self.fail:
            raise TransitUnavailable("down")
        return self.raw

    def stop_coord(self, _):
        return None


def test_poller_syncs_broadcasts_and_logs():
    e = engine()
    raw = [i for i in load("add_info_lifts")["infos"]["current"] if i["id"] == "ems-test-mq1"]
    feed = LiftFeed(enabled=True)
    summary = asyncio.run(LiftPoller(FakeClient(raw), LiftAlertSync(PL), feed, e, Broadcaster(), interval=0).run_once())
    assert "1 lift alert," in summary and "1 at Macquarie University station" in summary and feed.fresh()
    with Session(e) as s:
        assert "tfnsw-ems-test-mq1-north" in lifts(s)


def test_poller_failure_keeps_last_state():
    feed = LiftFeed(enabled=True)
    summary = asyncio.run(LiftPoller(FakeClient(fail=True), LiftAlertSync(PL), feed, engine(), Broadcaster(), 0).run_once())
    assert "Couldn't reach Transport for NSW" in summary and feed.last_ok is None


def test_poller_logs_only_when_something_changed():
    from app.models import AgentRun
    e = engine()
    raw = [i for i in load("add_info_lifts")["infos"]["current"] if i["id"] == "ems-test-mq1"]
    p = LiftPoller(FakeClient(raw), LiftAlertSync(PL), LiftFeed(enabled=True), e, Broadcaster(), 0)
    asyncio.run(p.run_once())
    asyncio.run(p.run_once())   # same alerts again
    with Session(e) as s:
        assert len(s.exec(select(AgentRun).where(AgentRun.agent == "updates")).all()) == 1
