"""Live lift alerts from Transport for NSW, stored as lift_outage barriers so routing, /live and SSE use them.

Macquarie University station exits are matched exactly by the OSM id of the broken lift (overrides.json
liftOsmIds). Spec section 4."""
import asyncio
import logging
from datetime import timedelta

from sqlmodel import Session, select

from app.agents import ago, log_run
from app.models import Barrier, aware, now
from app.transit.parse import LiftAlert, parse_alert
from app.transit.tfnsw import TransitUnavailable

LIFT_SOURCE = "Transport for NSW"
OFF_SOURCE = "Live lift alerts are off"
STALE = timedelta(minutes=30)
PREFIX = "tfnsw-"
STATUS_LABEL = {"confirmed": "Out of service", "needs_checking": "Not sure", "resolved": "Working"}
log = logging.getLogger("reachable")


class LiftFeed:
    """Whether live lift data is on, and how fresh it is."""

    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.last_ok = None

    def fresh(self) -> bool:
        return self.enabled and self.last_ok is not None and now() - aware(self.last_ok) <= STALE

    def source(self) -> str:
        return LIFT_SOURCE if self.enabled else OFF_SOURCE

    def updated(self) -> str:
        return ago(self.last_ok) if self.last_ok else "not yet"


class LiftAlertSync:
    def __init__(self, places, coord_lookup=None):
        self.places = places
        self.coord_lookup = coord_lookup or (lambda stop_id: None)
        self._coords: dict[str, tuple[float, float] | None] = {}

    def _coord(self, stop_id: str):
        if stop_id not in self._coords:
            try:
                self._coords[stop_id] = self.coord_lookup(stop_id)
            except TransitUnavailable:
                return None
        return self._coords[stop_id]

    def _wanted(self, alerts: list[LiftAlert]) -> dict[str, tuple[LiftAlert, dict]]:
        pl = self.places
        station = pl.get(pl.station_id)
        out: dict[str, tuple[LiftAlert, dict]] = {}
        for a in alerts:
            exits = [e for e in (station.exit_points if station else []) if pl.lift_osm_ids.get(e["id"], set()) & a.osm_ids]
            if exits:
                for e in exits:
                    out[f"{PREFIX}{a.id}-{e['id']}"] = (a, {"exit_id": e["id"], "status": "confirmed", "lat": e["lat"],
                                                            "lng": e["lng"], "place": f"{station.name}, {e['name'].lower()}"})
            elif station and pl.station_stop_id and pl.station_stop_id in a.stop_ids:
                out[f"{PREFIX}{a.id}"] = (a, {"exit_id": None, "status": "needs_checking", "lat": station.lat,
                                              "lng": station.lng, "place": station.name})
            else:
                c = self._coord(a.stop_ids[0]) if a.stop_ids else None
                out[f"{PREFIX}{a.id}"] = (a, {"exit_id": None, "status": "confirmed", "lat": c[0] if c else 0.0,
                                              "lng": c[1] if c else 0.0, "place": a.station or "A station"})
        return out

    def sync(self, session: Session, alerts: list[LiftAlert]) -> list[dict]:
        """Make the stored TfNSW lift outages match the current alerts. Returns what changed."""
        wanted = self._wanted(alerts)
        existing = {b.id: b for b in session.exec(select(Barrier).where(Barrier.type == "lift_outage")).all()
                    if b.id.startswith(PREFIX)}
        t, changes = now(), []
        for bid, (a, f) in wanted.items():
            b = existing.get(bid)
            if b is None or b.status != f["status"]:
                if b is None or b.status == "resolved":
                    b = b or Barrier(id=bid, type="lift_outage", update_type="transport", title="", place="", lat=0, lng=0)
                    b.first_seen = t
                changes.append({"exitId": f["exit_id"], "station": f["place"], "status": STATUS_LABEL[f["status"]]})
            b.title, b.place, b.lat, b.lng = "Lift out of service", f["place"], f["lat"], f["lng"]
            b.exit_id, b.status = f["exit_id"], f["status"]
            b.confidence = 0.95 if f["status"] == "confirmed" else 0.5
            b.last_confirmed = t
            b.sources = [{"kind": "feed", "label": f"{LIFT_SOURCE} lift alert", "url": a.url, "seen_at": t.isoformat(),
                          "alertId": a.id, "stopId": a.stop_ids[0] if a.stop_ids else None, "text": a.text,
                          "osmIds": sorted(a.osm_ids)}]
            session.add(b)
        for bid, b in existing.items():
            if bid not in wanted and b.status != "resolved":
                b.status, b.title, b.last_confirmed = "resolved", "Lift working again", t
                session.add(b)
                changes.append({"exitId": b.exit_id, "station": b.place, "status": "Working"})
        session.commit()
        return changes


class LiftPoller:
    def __init__(self, client, sync: LiftAlertSync, feed: LiftFeed, engine, broadcaster, interval: int):
        self.client, self.sync, self.feed, self.engine = client, sync, feed, engine
        self.broadcaster, self.interval = broadcaster, interval

    def _sync(self, alerts: list[LiftAlert]) -> list[dict]:
        with Session(self.engine) as s:
            return self.sync.sync(s, alerts)

    async def run_once(self) -> str:
        try:
            raw = await asyncio.to_thread(self.client.lift_alerts)
        except TransitUnavailable as e:
            log.warning("Lift alerts unavailable: %s", e)
            return "Couldn't reach Transport for NSW. Showing the last lift statuses we had."
        alerts = [parse_alert(i) for i in raw]
        changes = await asyncio.to_thread(self._sync, alerts)
        self.feed.last_ok = now()
        for c in changes:
            await self.broadcaster.publish("lift_changed", c)
        here = sum(1 for a in alerts if self.sync.places.station_stop_id in a.stop_ids)
        summary = (f"Checked Transport for NSW: {len(alerts)} lift alert{'' if len(alerts) == 1 else 's'}, "
                   f"{here} at Macquarie University station.")
        with Session(self.engine) as s:
            log_run(s, "updates", summary)
        return summary

    async def run(self):
        while True:
            try:
                await self.run_once()
            except Exception:  # never let one bad poll stop live lift data for good
                log.exception("Lift alert poll failed")
            await asyncio.sleep(self.interval)
