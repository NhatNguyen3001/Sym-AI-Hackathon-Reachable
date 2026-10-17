import asyncio


class Broadcaster:
    """In-process fan-out of server events to SSE subscribers. Slow subscribers drop events rather than block."""

    def __init__(self):
        self._subs: set[asyncio.Queue] = set()

    async def publish(self, event: str, data: dict):
        for q in list(self._subs):
            if not q.full():
                q.put_nowait({"event": event, "data": data})

    async def subscribe(self):
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subs.add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs.discard(q)
