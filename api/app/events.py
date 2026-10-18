import asyncio


class Broadcaster:
    """In-process fan-out of server events to SSE subscribers. Slow subscribers drop events rather than block."""

    def __init__(self):
        self._subs: dict[asyncio.Queue, str | None] = {}  # queue -> the phone's demo session (or None)

    async def publish(self, event: str, data: dict, session: str | None = None):
        """`session`: a demo sandbox event, only for that phone's streams; None: for everyone."""
        for q, sub in list(self._subs.items()):
            if not q.full() and (session is None or session == sub):
                q.put_nowait({"event": event, "data": data})

    async def subscribe(self, session: str | None = None):
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subs[q] = session
        try:
            while True:
                yield await q.get()
        finally:
            self._subs.pop(q, None)
