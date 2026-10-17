"""A local copy of the Turso database (libsql embedded replica), so reads never wait on the network.

Reads come from the local file. Writes go through to Turso (libsql forwards them to the primary). A background
loop pulls other computers' changes every TURSO_SYNC_SECONDS. If Turso can't be reached at start-up but a local
copy exists, the API starts from it read-only (writes fail with a clear error) until Turso is back. Spec §2.

Connections: exactly ONE libsql connection talks to Turso; it does every write and every sync, behind a lock.
Opening a replica connection syncs over the network (and pauses the API: libsql holds the GIL), and several
replica connections syncing one file can corrupt it, so reads use plain read-only connections to the local file
instead (1 ms, see writes at once, safe during a sync: spike 2026-10-18). If Turso drops mid-run, reads carry on
from the local copy and writes fail with a clear error until it's back."""
import asyncio
import logging
import threading
from pathlib import Path

import libsql

log = logging.getLogger("reachable")

NO_COPY = ("Can't reach the Turso database and there's no local copy yet. Check TURSO_DATABASE_URL / "
           "TURSO_AUTH_TOKEN, or clear them to use local SQLite.")


class ReplicaUnavailable(Exception):
    """Turso is unreachable and there is no local copy to start from."""


class ReplicaOffline(Exception):
    """Turso can't be reached right now, so nothing can be saved (reads still work)."""


class _Shared:
    """The one Turso connection, lent to SQLAlchemy: pool resets must not close it."""

    def __init__(self, conn):
        self._conn = conn

    def close(self):
        pass

    def __getattr__(self, name):
        return getattr(self._conn, name)


class Replica:
    def __init__(self, path: Path, url: str, token: str, connect=None):
        self.path, self.url, self.token = Path(path), url, token
        self._connect = connect or libsql.connect
        self._conn = None          # the one connection to Turso (writes and syncs)
        # A plain Lock, not RLock: FastAPI may open a request's session on one thread and close it on another.
        self.lock = threading.Lock()
        self.offline = False

    def _open(self):
        return self._connect(str(self.path), sync_url=self.url, auth_token=self.token, _check_same_thread=False)

    def start(self) -> bool:
        """Sync from Turso. True: fresh copy. False: Turso unreachable, starting from the last local copy."""
        existed = self.path.exists()
        try:
            conn = self._open()
            conn.sync()
            self._conn, self.offline = conn, False
            return True
        except Exception as e:  # noqa: BLE001 - any failure to reach Turso is handled the same way
            if not existed:
                raise ReplicaUnavailable(NO_COPY) from None
            self.offline = True
            log.warning("Can't reach the Turso database (%s). Starting from the last local copy; saving is off "
                        "until it's back.", type(e).__name__)
            return False

    def read_connect(self):
        """A read-only connection to the local copy: no network, safe while a sync runs."""
        return self._connect(f"file:{self.path.as_posix()}?mode=ro", _uri=True, _check_same_thread=False)

    def write_connect(self):
        """The one Turso connection, for the write engine (callers hold `lock` through pool checkout)."""
        if self._conn is None:
            raise ReplicaOffline("The Turso database can't be reached right now.")
        return _Shared(self._conn)

    def sync(self) -> None:
        with self.lock:
            if self._conn is None:   # offline start: try to reach Turso again
                conn = self._open()
                conn.sync()
                self._conn, self.offline = conn, False
                log.warning("The Turso database is reachable again; saving is back on.")
                return
            self._conn.sync()

    def sync_quietly(self) -> None:
        try:
            self.sync()
        except Exception as e:  # noqa: BLE001 - keep serving from the local copy; try again next time
            log.warning("Turso sync failed (%s); will retry.", type(e).__name__)

    async def run(self, interval: float, quiet=lambda: True, check: float = 0.25, max_wait: float = 60) -> None:
        """Sync every `interval` seconds, at a quiet moment: a sync pauses the whole API (libsql holds the GIL
        during network calls, spec section 11), so wait until quiet() is true, or at most max_wait seconds."""
        loop = asyncio.get_running_loop()
        while True:
            await asyncio.sleep(interval)
            waited_since = loop.time()
            while not quiet() and loop.time() - waited_since < max_wait:
                await asyncio.sleep(check)
            await asyncio.to_thread(self.sync_quietly)
