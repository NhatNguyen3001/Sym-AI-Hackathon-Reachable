"""A room of judges (cycle 7): N simulated phones use Reachable at once for a while, each with its own session, and
we report how long things took and what failed.

  api\\.venv\\Scripts\\python deploy\\loadtest.py --base https://<id>.cloudfront.net --users 80 --minutes 5

Each phone: opens the map (updates, weather, amenities, map status, the Sydney places), keeps live updates open,
then loops: searches a place, plans a trip (mostly the demo trip, some others), reads the Live updates, waits a bit.
"""
import argparse
import asyncio
import random
import statistics
import time
import uuid
from collections import defaultdict

import httpx

SYDNEY = "150.5,-34.2,151.4,-33.4"
SEARCHES = ["library", "macquarie centre", "cafe", "station", "town hall", "chatswood", "globe", "mortarboard"]
TRIPS = [("mq-station", "library")] * 6 + [("mq-station", "library-cafe"), ("library", "mortarboard-cafe"),
                                           ("coord:-33.8732,151.2066", "coord:-33.8657,151.2129")]


class Stats:
    def __init__(self):
        self.times = defaultdict(list)
        self.errors = defaultdict(int)

    def add(self, name: str, seconds: float, ok: bool):
        self.times[name].append(seconds)
        if not ok:
            self.errors[name] += 1

    def report(self):
        print(f"{'request':<14}{'count':>7}{'p50 ms':>9}{'p95 ms':>9}{'max ms':>9}{'errors':>8}")
        for name in sorted(self.times):
            t = sorted(self.times[name])
            p95 = t[int(len(t) * 0.95) - 1] if len(t) > 1 else t[0]
            print(f"{name:<14}{len(t):>7}{statistics.median(t) * 1000:>9.0f}{p95 * 1000:>9.0f}{t[-1] * 1000:>9.0f}"
                  f"{self.errors[name]:>8}")
        total = sum(len(t) for t in self.times.values())
        bad = sum(self.errors.values())
        print(f"\n{total} requests, {bad} errors ({bad / max(1, total):.1%})")


async def timed(stats: Stats, name: str, coro, ok=lambda r: r.status_code < 500):
    t0 = time.monotonic()
    try:
        r = await coro
        stats.add(name, time.monotonic() - t0, ok(r))
        return r
    except Exception:
        stats.add(name, time.monotonic() - t0, False)
        return None


async def events(c: httpx.AsyncClient, session: str, stop: float, stats: Stats):
    """Keep the live updates stream open, as an open page does (reconnect if it drops)."""
    while time.monotonic() < stop:
        t0 = time.monotonic()
        try:
            async with c.stream("GET", f"/events?session={session}", timeout=httpx.Timeout(10, read=60)) as r:
                stats.add("events-open", time.monotonic() - t0, r.status_code == 200)
                async for _ in r.aiter_lines():
                    if time.monotonic() >= stop:
                        return
        except Exception:
            stats.add("events-open", time.monotonic() - t0, False)
            await asyncio.sleep(1)


async def phone(base: str, stop: float, stats: Stats):
    session = uuid.uuid4().hex
    async with httpx.AsyncClient(base_url=base, headers={"X-Session": session}, timeout=30) as c:
        live = asyncio.create_task(events(c, session, stop, stats))
        await asyncio.sleep(random.uniform(0, 5))  # people don't all tap at the same millisecond
        for name, path in [("updates", "/updates"), ("weather", "/weather"), ("amenities", "/amenities"),
                           ("map-status", "/agents/map/status"), ("map-places", f"/map/places?bbox={SYDNEY}")]:
            await timed(stats, name, c.get(path, headers={"Accept-Encoding": "gzip"}))
        while time.monotonic() < stop:
            q = random.choice(SEARCHES)
            await timed(stats, "search-known", c.get("/places", params={"q": q, "photon": 0}))
            await timed(stats, "search", c.get("/places", params={"q": q}))
            frm, to = random.choice(TRIPS)
            await timed(stats, "route", c.post("/route", json={"from": frm, "to": to}),
                        ok=lambda r: r.status_code == 200 and r.json().get("ok") is not None)
            await timed(stats, "live-page", c.get("/updates"))
            await asyncio.sleep(random.uniform(5, 15))  # reading the route
        live.cancel()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--users", type=int, default=80)
    ap.add_argument("--minutes", type=float, default=5)
    a = ap.parse_args()
    stats = Stats()
    stop = time.monotonic() + a.minutes * 60
    print(f"{a.users} phones for {a.minutes} min against {a.base}")
    await asyncio.gather(*[phone(a.base.rstrip("/"), stop, stats) for _ in range(a.users)])
    stats.report()


if __name__ == "__main__":
    asyncio.run(main())
