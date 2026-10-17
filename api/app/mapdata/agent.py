"""The map agent: on demand, gathers accessible places (OpenStreetMap) and the roadworks that affect people walking
(Live Traffic NSW, judged by Claude), then saves everything in one write (spec section 4)."""
import asyncio
import logging
from datetime import datetime

from sqlmodel import Session, delete, func, select

from app.mapdata.osm import SYDNEY, classify, tile_key, tiles
from app.mapdata.roadworks import KINDS, TZ, judge, notices
from app.models import AgentRun, Barrier, MapPlace, aware, now
from app.routing.graph import nearest_edge
from app.transit.tfnsw import TransitUnavailable

log = logging.getLogger("reachable")
AGENT = "map"
PREFIX = "lt-"
SOURCE = "Live Traffic NSW, checked by Claude"
EDGE_M = 30  # a roadwork only blocks a campus path it is right next to
STATUS = {"blocks_path": "confirmed", "may_affect": "needs_checking"}


class AlreadyRunning(Exception):
    """The map agent is already running."""


class MapAgent:
    def __init__(self, engine, overpass, tfnsw, llm, graph, quiet=lambda: True, tiles_=None, max_wait: float = 60):
        self.engine, self.overpass, self.tfnsw, self.llm, self.graph = engine, overpass, tfnsw, llm, graph
        self.quiet, self.max_wait = quiet, max_wait
        self.tiles = tiles_ if tiles_ is not None else tiles(SYDNEY)
        self.running = False
        self.checked = 0

    # --- gathering (no database) ------------------------------------------------------------------------------

    def _places(self) -> tuple[dict[str, list[dict]], int]:
        """New places per tile that answered, and how many tiles failed."""
        got, failed = {}, 0
        if self.overpass is None:
            return got, len(self.tiles)
        for t in self.tiles:
            els = self.overpass.accessible_places(t)
            if els is None:
                failed += 1
                continue
            seen = {}
            for el in els:
                p = classify(el)
                if p and p["id"] not in seen:
                    seen[p["id"]] = p
            got[tile_key(t)] = list(seen.values())
        return got, failed

    def _roadworks(self) -> tuple[list[dict] | None, dict | None, list[str]]:
        """(notices, verdicts, failed parts). None notices: Live Traffic unreachable. None verdicts: no Claude."""
        if self.tfnsw is None:
            return None, None, ["roadworks"]
        try:
            feats = [f for kind in KINDS for f in self.tfnsw.live_hazards(kind)]
        except TransitUnavailable as e:
            log.warning("Live Traffic NSW unavailable: %s", e)
            return None, None, ["roadworks"]
        items = notices(feats, SYDNEY, datetime.now(TZ).date())
        verdicts = judge(items, self.llm)
        return items, verdicts, ([] if verdicts is not None else ["claude"])

    def _gather(self) -> dict:
        places, failed_tiles = self._places()
        items, verdicts, failed = self._roadworks()
        if failed_tiles:
            failed = ["osm", *failed]
        return {"places": places, "failed_tiles": failed_tiles, "items": items, "verdicts": verdicts, "failed": failed}

    # --- saving (one transaction) -------------------------------------------------------------------------------

    def _edge(self, lat: float, lng: float) -> str | None:
        if self.graph is None:
            return None
        edge, metres = nearest_edge(self.graph, lat, lng)
        return edge if metres <= EDGE_M else None

    def _save(self, g: dict) -> str:
        t = now()
        with Session(self.engine) as s:
            for key, rows in g["places"].items():
                s.exec(delete(MapPlace).where(MapPlace.tile == key))
                for p in rows:
                    s.add(MapPlace(**p, tile=key, seen_at=t))
            kept = 0
            if g["items"] is not None and g["verdicts"] is not None:
                existing = {b.id: b for b in s.exec(select(Barrier).where(Barrier.type == "roadworks")).all()
                            if b.id.startswith(PREFIX)}
                wanted = set()
                for it in g["items"]:
                    v = g["verdicts"][it["id"]]
                    if v.effect not in STATUS:
                        continue
                    wanted.add(it["id"])
                    b = existing.get(it["id"]) or Barrier(id=it["id"], type="roadworks", title="", place="", lat=0,
                                                          lng=0, first_seen=t)
                    if b.status == "resolved":
                        b.first_seen = t
                    b.title = it["title"] or "Roadworks"
                    b.place = ", ".join(x for x in (it["road"], it["suburb"]) if x) or "Sydney"
                    b.lat, b.lng, b.edge_id = it["lat"], it["lng"], self._edge(it["lat"], it["lng"])
                    b.status, b.update_type, b.last_confirmed = STATUS[v.effect], "roadworks", t
                    b.confidence = 0.8 if v.effect == "blocks_path" else 0.5
                    b.sources = [{"kind": "feed", "label": SOURCE, "url": it["url"], "seen_at": t.isoformat(),
                                  "text": v.sentence}]
                    s.add(b)
                for bid, b in existing.items():
                    if bid not in wanted and b.status != "resolved":
                        b.status, b.last_confirmed = "resolved", t
                        s.add(b)
                kept = len(wanted)
            count = sum(len(rows) for rows in g["places"].values())
            self.checked = len(g["items"] or []) if g["verdicts"] is not None else 0
            summary = f"Updated {count} places and {kept} roadworks (Claude checked {self.checked} notices)."
            s.add(AgentRun(agent=AGENT, started_at=t, finished_at=t, summary=summary,
                           status="failed:" + ",".join(g["failed"]) if g["failed"] else "done"))
            s.commit()
        return summary

    async def run(self) -> str:
        if self.running:
            raise AlreadyRunning()
        self.running = True
        try:
            g = await asyncio.to_thread(self._gather)
            # Every Turso write pauses the API (spec cycle 4, section 11): save at a quiet moment.
            loop = asyncio.get_running_loop()
            since = loop.time()
            while not self.quiet() and loop.time() - since < self.max_wait:
                await asyncio.sleep(0.25)
            summary = await asyncio.to_thread(self._save, g)
            log.info("Map agent: %s", summary)
            return summary
        finally:
            self.running = False

    # --- status -------------------------------------------------------------------------------------------------

    def status(self, session: Session) -> dict:
        last = session.exec(select(AgentRun).where(AgentRun.agent == AGENT)
                            .order_by(AgentRun.started_at.desc())).first()
        places = session.exec(select(func.count()).select_from(MapPlace)).one()
        roadworks = session.exec(select(func.count()).select_from(Barrier).where(
            Barrier.type == "roadworks", Barrier.status != "resolved", Barrier.id.startswith(PREFIX))).one()
        snapshot = None
        if last is None and places:
            oldest = session.exec(select(func.min(MapPlace.seen_at))).one()
            snapshot = {"takenOn": aware(oldest).astimezone(TZ).date().isoformat()}
        failed = last.status.removeprefix("failed:").split(",") if last and last.status.startswith("failed:") else []
        return {"lastRun": aware(last.started_at).isoformat() if last else None, "running": self.running,
                "places": places, "roadworks": roadworks, "checked": self.checked, "failed": failed,
                "snapshot": snapshot}
