"""SQLAlchemy dialect for Turso through the official `libsql` package (a sqlite3-compatible DB-API).

pysqlite's on_connect registers a REGEXP function with create_function, which libsql connections don't have;
we don't use REGEXP, so skip it. Everything else is plain SQLite."""
import libsql
from sqlalchemy.dialects import registry
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite


class LibsqlDialect(SQLiteDialect_pysqlite):
    driver = "libsql"
    supports_statement_cache = True
    # libsql runs executemany one row at a time, and on Turso every write is a network round trip with the GIL held.
    # Send many rows as a few multi-row INSERT ... VALUES statements instead (5,500 map places: 6 statements).
    use_insertmanyvalues_wo_returning = True

    @classmethod
    def import_dbapi(cls):
        return libsql

    def on_connect(self):
        return None


registry.register("sqlite.libsql", "app.libsql_dialect", "LibsqlDialect")
