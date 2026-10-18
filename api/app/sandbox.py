"""Demo sandbox (cycle 7, DEMO_SANDBOX=true): each phone is its own session, so ~80 judges can test at once without
changing each other's map. Their reports, the barriers made from them and the rain toggle live here, in memory, per
session; nothing is written to the database and it all goes when the server stops. Shared real data (lifts,
roadworks, places, weather) still comes from the database for everyone."""
import threading
from contextvars import ContextVar
from dataclasses import dataclass, field

# The session of the request being handled (set by middleware from the X-Session header or ?session=).
current_session: ContextVar[str | None] = ContextVar("current_session", default=None)
MAX_SESSIONS = 2000


@dataclass
class Box:
    reports: dict = field(default_factory=dict)    # report id -> Report (never added to a database session)
    barriers: dict = field(default_factory=dict)   # barrier id -> Barrier: new ones, or a session's copy of a shared one
    rain: bool | None = None                       # this session's demo rain toggle


class Sandbox:
    def __init__(self):
        self._boxes: dict[str, Box] = {}
        self._lock = threading.Lock()

    def box(self, session: str) -> Box:
        with self._lock:
            b = self._boxes.get(session)
            if b is None:
                if len(self._boxes) >= MAX_SESSIONS:  # a bound on memory: forget the oldest session
                    self._boxes.pop(next(iter(self._boxes)))
                b = self._boxes[session] = Box()
            return b


_active: Sandbox | None = None


def enable(sandbox: Sandbox | None) -> None:
    global _active
    _active = sandbox


def current_box() -> Box | None:
    """The sandbox of the request being handled, or None (sandbox off, or no session given)."""
    session = current_session.get()
    return _active.box(session) if _active is not None and session else None


def merge_barriers(shared: list) -> list:
    """Shared barriers with this session's own: its new ones, and its copies of shared ones (e.g. marked fixed)."""
    box = current_box()
    if box is None:
        return shared
    merged = {b.id: b for b in shared}
    merged.update(box.barriers)
    return list(merged.values())
