from pathlib import Path

import pytest

from app.db import Database


async def test_pragmas(db: Database) -> None:
    async with db.conn.execute("PRAGMA journal_mode") as cursor:
        assert (await cursor.fetchone())[0] == "wal"
    async with db.conn.execute("PRAGMA foreign_keys") as cursor:
        assert (await cursor.fetchone())[0] == 1


async def test_migrations_are_applied_once(db: Database) -> None:
    assert await db.migrate() == []
    async with db.conn.execute("SELECT version FROM schema_migrations") as cursor:
        assert [row[0] for row in await cursor.fetchall()] == [1]


async def test_failed_migration_rolls_back(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    (migrations / "001_ok.sql").write_text("CREATE TABLE a (id INTEGER);")
    (migrations / "002_bad.sql").write_text("CREATE TABLE b (id INTEGER); NOT VALID SQL;")
    database = Database(tmp_path / "m.db")
    await database.connect()
    try:
        with pytest.raises(Exception, match="syntax error"):
            await database.migrate(migrations)
        async with database.conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('a', 'b')"
        ) as cursor:
            assert [row[0] for row in await cursor.fetchall()] == ["a"]
        assert not database.conn.in_transaction
    finally:
        await database.close()


async def test_transaction_rolls_back_on_error(db: Database) -> None:
    with pytest.raises(RuntimeError):
        async with db.transaction() as conn:
            await conn.execute(
                "INSERT INTO users (telegram_id, created_at, updated_at) VALUES (1, 'x', 'x')"
            )
            raise RuntimeError
    async with db.conn.execute("SELECT COUNT(*) FROM users") as cursor:
        assert (await cursor.fetchone())[0] == 0
