"""Roadworks and events from Live Traffic NSW; Claude decides which ones affect people walking (spec section 4b)."""
import html
import json
import logging
import re
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel

MODEL = "claude-sonnet-5-5"
KINDS = ("roadwork", "incident", "majorevent")
TZ = ZoneInfo("Australia/Sydney")
log = logging.getLogger("reachable")

SYSTEM = ("You check road notices for people who walk or use a wheelchair in Sydney. For each notice decide its effect "
          "on someone on foot or in a wheelchair: blocks_path = a footpath, walkway or pedestrian crossing is closed, "
          "or people on foot must detour; may_affect = works on or next to the footpath, a crossing moved, or crowds "
          "and event closures on walkways; no = it only affects cars (lanes, motorway resurfacing, speed limits). "
          "sentence: one plain sentence for people, no jargon, saying what to expect (empty for no). "
          "Answer every id you are given, using only the facts in the notice.")


class Verdict(BaseModel):
    id: str
    effect: Literal["blocks_path", "may_affect", "no"]
    sentence: str = ""


class Verdicts(BaseModel):
    verdicts: list[Verdict]


def _text(s: str | None) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def notices(features: list[dict], bbox, today: date) -> list[dict]:
    """Point notices inside bbox that are in effect at some point today (Sydney time)."""
    w, s, e, n = bbox
    day_start = datetime.combine(today, time(0), TZ).timestamp() * 1000
    day_end = (datetime.combine(today, time(0), TZ) + timedelta(days=1)).timestamp() * 1000
    out = []
    for f in features:
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lng, lat = g["coordinates"][:2]
        if not (w <= lng <= e and s <= lat <= n):
            continue
        p = f.get("properties") or {}
        start, end = p.get("start"), p.get("end")
        if (start is not None and start >= day_end) or (end is not None and end < day_start):
            continue
        road = (p.get("roads") or [{}])[0]
        out.append({"id": f"lt-{f.get('id')}", "title": _text(p.get("headline")) or _text(p.get("displayName")),
                    "road": road.get("mainStreet") or "", "suburb": road.get("suburb") or "",
                    "advice": _text(p.get("otherAdvice")), "periods": p.get("periods") or [],
                    "url": p.get("webLinkUrl") or p.get("weblinkUrl"), "lat": lat, "lng": lng})
    return out


def _ask(batch: list[dict], client) -> dict[str, Verdict] | None:
    """Claude's verdicts for one batch; None when the whole batch failed."""
    lines = "\n".join(json.dumps({k: it[k] for k in ("id", "title", "road", "suburb", "advice", "periods")})
                      for it in batch)
    try:
        r = client.messages.parse(model=MODEL, max_tokens=4096, system=SYSTEM, output_format=Verdicts,
                                  messages=[{"role": "user", "content": f"Notices, one per line:\n{lines}"}])
        if r.stop_reason == "refusal" or r.parsed_output is None:
            log.warning("Claude didn't judge %d road notices.", len(batch))
            return None
        return {v.id: v for v in r.parsed_output.verdicts}
    except Exception as e:  # noqa: BLE001 - reported as "Claude unavailable"; the run keeps the old roadworks
        log.warning("Claude couldn't judge road notices (%s).", type(e).__name__)
        return None


def judge(items: list[dict], client, batch: int = 25) -> dict[str, Verdict] | None:
    """Claude's verdict for every notice. None without Claude, or when any batch failed: an outage must not look
    like "nothing affects walkers" (the run then keeps the roadworks it has)."""
    if client is None:
        return None
    out: dict[str, Verdict] = {}
    for i in range(0, len(items), batch):
        chunk = items[i:i + batch]
        got = _ask(chunk, client)
        if got is None:
            return None
        for it in chunk:
            v = got.get(it["id"])
            if v is None:
                log.warning("Claude gave no verdict for road notice %s; treating it as not affecting walkers.", it["id"])
            out[it["id"]] = v or Verdict(id=it["id"], effect="no")
    return out
