import asyncio
import json

import pytest
from sqlalchemy import event
from sqlmodel import Session, select

from app.db import init_db, make_engine
from app.mapdata.agent import AlreadyRunning, MapAgent
from app.mapdata.roadworks import Verdict
from app.mapdata.snapshot import load_snapshot
from app.models import AgentRun, Barrier, MapPlace
from app.transit.tfnsw import TransitUnavailable
from tests.test_campus_graph import G

T1 = (151.0, -33.9, 151.3, -33.6)
T2 = (151.3, -33.9, 151.6, -33.6)


def el(id_, lat=-33.7765, lon=151.116, **tags):
    return {"type": "node", "id": id_, "lat": lat, "lon": lon, "tags": tags or {"amenity": "toilets", "wheelchair": "yes"}}


class Overpass:
    def __init__(self, by_tile):
        self.by_tile = by_tile

    def accessible_places(self, bbox, sleep=None):
        return self.by_tile.get(bbox)


def feature(id_, lat=-33.7722, lng=151.1159, title="Footpath works"):
    return {"id": id_, "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": {"headline": title, "roads": [{"mainStreet": "Management Drive", "suburb": "Macquarie Park"}],
                           "otherAdvice": "", "start": None, "end": None, "webLinkUrl": f"https://lt.test/{id_}"}}


class Tfnsw:
    def __init__(self, feats=None, fail=False):
        self.feats, self.fail = feats or {}, fail

    def live_hazards(self, kind):
        if self.fail:
            raise TransitUnavailable("down")
        return self.feats.get(kind, [])


class Claude:
    """Stands in for the Claude client: fake_judge answers by notice id from `effects`."""
    def __init__(self, effects):
        self.effects = effects


@pytest.fixture
def engine(tmp_path):
    eng = make_engine(f"sqlite:///{tmp_path / 'm.db'}")
    init_db(eng)
    return eng


@pytest.fixture(autouse=True)
def fake_judge(monkeypatch):
    def judge(items, client, batch=25):
        if client is None:
            return None
        return {i["id"]: Verdict(id=i["id"], effect=client.effects.get(i["id"], "no"),
                                 sentence=f"Sentence for {i['id']}.") for i in items}
    monkeypatch.setattr("app.mapdata.agent.judge", judge)


def agent(engine, overpass, tfnsw=None, effects=None):
    return MapAgent(engine, overpass, tfnsw, Claude(effects) if effects is not None else None, G, tiles_=[T1, T2])


def run(a):
    return asyncio.run(a.run())


def places(engine):
    with Session(engine) as s:
        return {p.id: p for p in s.exec(select(MapPlace)).all()}


def roadworks(engine):
    with Session(engine) as s:
        return {b.id: b for b in s.exec(select(Barrier).where(Barrier.type == "roadworks")).all()}


def test_a_run_stores_places_and_replaces_a_tiles_old_rows(engine):
    run(agent(engine, Overpass({T1: [el(1), el(2)], T2: [el(3, lon=151.4)]})))
    assert set(places(engine)) == {"place:osm-n1", "place:osm-n2", "place:osm-n3"}
    run(agent(engine, Overpass({T1: [el(2)], T2: [el(3, lon=151.4)]})))
    assert set(places(engine)) == {"place:osm-n2", "place:osm-n3"}


def test_a_failed_tile_keeps_its_old_rows_and_is_reported(engine):
    run(agent(engine, Overpass({T1: [el(1)], T2: [el(3, lon=151.4)]})))
    a = agent(engine, Overpass({T1: [el(2)], T2: None}))
    run(a)
    assert set(places(engine)) == {"place:osm-n2", "place:osm-n3"}
    with Session(engine) as s:
        st = a.status(s)
    assert "osm" in st["failed"] and st["places"] == 2


def test_claude_verdicts_become_barriers(engine):
    feats = {"roadwork": [feature(1), feature(2, lat=-33.80, lng=151.0), feature(3)]}
    run(agent(engine, Overpass({}), Tfnsw(feats), {"lt-1": "blocks_path", "lt-2": "may_affect"}))
    rw = roadworks(engine)
    assert set(rw) == {"lt-1", "lt-2"}
    b = rw["lt-1"]
    assert (b.status, b.update_type, b.title, b.place) == ("confirmed", "roadworks", "Footpath works",
                                                          "Management Drive, Macquarie Park")
    assert b.sources[0]["label"] == "Live Traffic NSW, checked by Claude"
    assert b.sources[0]["text"] == "Sentence for lt-1." and b.sources[0]["url"] == "https://lt.test/1"
    assert b.edge_id  # next to a campus footpath
    assert rw["lt-2"].status == "needs_checking" and rw["lt-2"].edge_id is None  # 12 km away: no campus edge


def test_a_roadwork_gone_from_the_feed_is_resolved(engine):
    run(agent(engine, Overpass({}), Tfnsw({"roadwork": [feature(1)]}), {"lt-1": "blocks_path"}))
    run(agent(engine, Overpass({}), Tfnsw({"roadwork": []}), {}))
    assert roadworks(engine)["lt-1"].status == "resolved"


def test_without_claude_no_roadworks_are_guessed_and_old_ones_stay(engine):
    run(agent(engine, Overpass({}), Tfnsw({"roadwork": [feature(1)]}), {"lt-1": "blocks_path"}))
    a = agent(engine, Overpass({}), Tfnsw({"roadwork": [feature(1), feature(2)]}), None)
    run(a)
    rw = roadworks(engine)
    assert set(rw) == {"lt-1"} and rw["lt-1"].status == "confirmed"
    with Session(engine) as s:
        assert "claude" in a.status(s)["failed"]


def test_live_traffic_down_keeps_old_roadworks(engine):
    run(agent(engine, Overpass({}), Tfnsw({"roadwork": [feature(1)]}), {"lt-1": "blocks_path"}))
    a = agent(engine, Overpass({}), Tfnsw(fail=True), {})
    run(a)
    assert roadworks(engine)["lt-1"].status == "confirmed"
    with Session(engine) as s:
        assert "roadworks" in a.status(s)["failed"]


def test_everything_is_written_in_one_commit_and_logged(engine):
    commits = []
    event.listen(engine, "commit", lambda conn: commits.append(1))
    run(agent(engine, Overpass({T1: [el(1)], T2: []}), Tfnsw({"roadwork": [feature(1)]}), {"lt-1": "blocks_path"}))
    assert len(commits) == 1
    with Session(engine) as s:
        r = s.exec(select(AgentRun).where(AgentRun.agent == "map")).one()
    assert r.summary == "Updated 1 places and 1 roadworks (Claude checked 1 notices)."


def test_one_run_at_a_time(engine):
    a = agent(engine, Overpass({}))
    a.running = True
    with pytest.raises(AlreadyRunning):
        run(a)


def test_status_after_a_run(engine):
    a = agent(engine, Overpass({T1: [el(1)], T2: []}), Tfnsw({"roadwork": [feature(1)]}), {"lt-1": "blocks_path"})
    run(a)
    with Session(engine) as s:
        st = a.status(s)
    assert st["running"] is False and st["places"] == 1 and st["roadworks"] == 1 and st["checked"] == 1
    assert st["failed"] == [] and st["snapshot"] is None and st["lastRun"]


def test_snapshot_loads_only_into_an_empty_table(engine, tmp_path):
    p = tmp_path / "snap.json"
    p.write_text(json.dumps({"takenOn": "2026-10-18", "licence": "© OpenStreetMap contributors, ODbL", "places": [
        {"id": "place:osm-n9", "osm_id": "node/9", "name": "Accessible toilet", "kind": "toilet", "lat": -33.77,
         "lng": 151.11, "tags": {"amenity": "toilets", "wheelchair": "yes"}, "tile": "t"}]}), encoding="utf-8")
    assert load_snapshot(engine, str(p)) == 1
    assert load_snapshot(engine, str(p)) == 0
    assert load_snapshot(engine, str(tmp_path / "missing.json")) == 0
    assert load_snapshot(engine, "") == 0
    with Session(engine) as s:
        st = MapAgent(engine, None, None, None, G).status(s)
    assert st["snapshot"] == {"takenOn": "2026-10-18"} and st["lastRun"] is None and st["places"] == 1
