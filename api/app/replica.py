"""A local copy of the Turso database (libsql embedded replica), so reads never wait on the network.

Reads come from the local file. Writes go through to Turso (libsql forwards them to the primary). A background
loop pulls other computers' changes every TURSO_SYNC_SECONDS. If Turso can't be reached at start-up but a local
copy exists, the API starts from it read-only (writes fail with a clear error) until Turso is back. Spec §2.

Threads: every pooled SQLAlchemy connection is its own libsql connection to the same file, and syncing uses a
separate connection. A spike (2026-10-17) showed a second connection to one replica file works and that reads
from several threads during a sync raise no errors; test_concurrent_reads_during_sync pins that."""
import asyncio
import logging
from pathlib import Path

import libsql

log = logging.getLogger("reachable")

NO_COPY = ("Can't reach the Turso database and there's no local copy yet. Check TURSO_DATABASE_URL / "
           "TURSO_AUTH_TOKEN, or clear them to use local SQLite.")


class ReplicaUnavailable(Exception):
    """Turso is unreachable and there is no local copy to start from."""


class Replica:
    def __init__(self, path: Path, url: str, token: str, connect=None):
        self.path, self.url, self.token = Path(path), url, token
        self._connect = connect or libsql.connect
        self._sync_conn = None
        self.offline = False
        self.on_online = None  # called when Turso is reachable again after an offline start

    def _open(self):
        return self._connect(str(self.path), sync_url=self.url, auth_token=self.token, _check_same_thread=False)

    def start(self) -> bool:
        """Sync from Turso. True: fresh copy. False: Turso unreachable, starting from the last local copy."""
        existed = self.path.exists()
        try:
            self._sync_conn = self._open()
            self._sync_conn.sync()
            self.offline = False
            return True
        except Exception as e:  # noqa: BLE001 - any failure to reach Turso is handled the same way
            self._sync_conn = None
            if not existed:
                raise ReplicaUnavailable(NO_COPY) from None
            self.offline = True
            log.warning("Can't reach the Turso database (%s). Starting from the last local copy; saving is off "
                        "until it's back.", type(e).__name__)
            return False

    def connect(self):
        """A connection for the SQLAlchemy pool: synced replica, or read-only while offline."""
        if self.offline:
            return self._connect(f"file:{self.path.as_posix()}?mode=ro", _uri=True, _check_same_thread=False)
        return self._open()

    def sync(self) -> None:
        if self._sync_conn is None:
            self._sync_conn = self._open()
        self._sync_conn.sync()
        if self.offline:
            self.offline = False
            log.warning("The Turso database is reachable again; saving is back on.")
            if self.on_online:
                self.on_online()

    async def run(self, interval: float, quiet=lambda: True, check: float = 0.25, max_wait: float = 60) -> None:
        """Sync every `interval` seconds, at a quiet moment: a sync pauses the whole API (libsql holds the GIL
        during network calls, spec §11), so wait until quiet() is true, or at most max_wait seconds."""
        loop = asyncio.get_running_loop()
        while True:
            await asyncio.sleep(interval)
            waited_since = loop.time()
            while not quiet() and loop.time() - waited_since < max_wait:
                await asyncio.sleep(check)
            try:
                await asyncio.to_thread(self.sync)
            except Exception as e:  # noqa: BLE001 - keep syncing; one failed sync must not stop the loop
                self._sync_conn = None
                log.warning("Turso sync failed (%s); will retry.", type(e).__name__)
