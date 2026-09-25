"""SQLite connection and migration runner."""

import asyncio
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

import aiosqlite

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
_MIGRATION_NAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Database:
    """One shared aiosqlite connection for the whole process.

    All writes go through `transaction()`, which holds a lock so statements from
    concurrent tasks can't interleave inside one transaction.
    """

    def __init__(self, path: Path) -> None:
        self.path = path
        self._conn: aiosqlite.Connection | None = None
        self._write_lock = asyncio.Lock()

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("Database is not connected")
        return self._conn

    async def connect(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # isolation_level=None: no implicit transactions; we BEGIN/COMMIT explicitly.
        conn = await aiosqlite.connect(self.path, isolation_level=None)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL;")
        await conn.execute("PRAGMA foreign_keys=ON;")
        await conn.execute("PRAGMA busy_timeout=5000;")
        self._conn = conn

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[aiosqlite.Connection]:
        async with self._write_lock:
            await self.conn.execute("BEGIN IMMEDIATE")
            try:
                yield self.conn
            except BaseException:
                await self.conn.execute("ROLLBACK")
                raise
            await self.conn.execute("COMMIT")

    async def migrate(self, migrations_dir: Path = MIGRATIONS_DIR) -> list[int]:
        """Apply pending `NNN_name.sql` files in order. Returns the versions applied.

        Each file runs in its own transaction, so migration files must not contain
        BEGIN/COMMIT themselves.
        """
        await self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
        )
        async with self.conn.execute("SELECT version FROM schema_migrations") as cursor:
            applied = {row[0] for row in await cursor.fetchall()}

        migrations = await asyncio.to_thread(_load_migrations, migrations_dir)
        newly_applied: list[int] = []
        for version, name, sql in migrations:
            if version in applied:
                continue
            # executescript commits any open transaction first, so BEGIN/COMMIT go in the
            # script itself. The file name is safe to inline: it matched _MIGRATION_NAME.
            script = (
                f"BEGIN IMMEDIATE;\n{sql}\n;\n"
                "INSERT INTO schema_migrations (version, name, applied_at) "
                f"VALUES ({version}, '{name}', '{utc_now()}');\n"
                "COMMIT;"
            )
            async with self._write_lock:
                try:
                    await self.conn.executescript(script)
                except BaseException:
                    if self.conn.in_transaction:
                        await self.conn.execute("ROLLBACK")
                    raise
            newly_applied.append(version)
        return newly_applied


def _load_migrations(migrations_dir: Path) -> list[tuple[int, str, str]]:
    """Read `NNN_name.sql` files, sorted by version, as (version, name, sql)."""
    migrations: dict[int, tuple[int, str, str]] = {}
    for path in migrations_dir.glob("*.sql"):
        match = _MIGRATION_NAME.match(path.name)
        if match is None:
            raise RuntimeError(f"Bad migration file name: {path.name}")
        version = int(match.group(1))
        if version in migrations:
            raise RuntimeError(f"Duplicate migration version: {version:03d}")
        migrations[version] = (version, path.name, path.read_text(encoding="utf-8"))
    return [migrations[version] for version in sorted(migrations)]
