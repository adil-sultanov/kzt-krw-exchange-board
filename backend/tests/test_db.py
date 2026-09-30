from pathlib import Path

import pytest

from app.db import MIGRATIONS_DIR, Database


async def test_pragmas(db: Database) -> None:
    async with db.conn.execute("PRAGMA journal_mode") as cursor:
        assert (await cursor.fetchone())[0] == "wal"
    async with db.conn.execute("PRAGMA foreign_keys") as cursor:
        assert (await cursor.fetchone())[0] == 1


async def test_migrations_are_applied_once(db: Database) -> None:
    assert await db.migrate() == []
    async with db.conn.execute("SELECT version FROM schema_migrations") as cursor:
        assert [row[0] for row in await cursor.fetchall()] == [
            1,
            2,
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12,
            13,
        ]


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


async def test_migration_004_keeps_existing_data(tmp_path: Path) -> None:
    before = tmp_path / "before"
    before.mkdir()
    for path in sorted(MIGRATIONS_DIR.glob("00[123]_*.sql")):
        (before / path.name).write_text(path.read_text())
    database = Database(tmp_path / "test.db")
    await database.connect()
    try:
        await database.migrate(before)
        now = "2026-01-01T00:00:00+00:00"
        await database.conn.execute(
            "INSERT INTO users (telegram_id, receive_kzt, receive_krw, created_at, updated_at) "
            "VALUES (1, 'Kaspi +7 707', NULL, ?, ?)",
            (now, now),
        )
        await database.conn.execute(
            "INSERT INTO requests (user_id, direction, amount, rate_type, rate_value, "
            "created_at, updated_at, expires_at) VALUES (1, 'KZT_KRW', 10, 'fixed', 2.8, ?, ?, ?)",
            (now, now, now),
        )

        assert (await database.migrate())[0] == 4
        async with database.conn.execute(
            "SELECT receive_kzt_bank, receive_kzt_account, receive_krw_account FROM users"
        ) as cursor:
            assert tuple(await cursor.fetchone() or ()) == (None, "Kaspi +7 707", None)
        async with database.conn.execute("SELECT rate_type, rate_value FROM requests") as cursor:
            assert tuple(await cursor.fetchone() or ()) == ("market", 0)
    finally:
        await database.close()


async def test_migration_005_removes_cancelled_deals(tmp_path: Path) -> None:
    before = tmp_path / "before"
    before.mkdir()
    for path in sorted(MIGRATIONS_DIR.glob("00[1234]_*.sql")):
        (before / path.name).write_text(path.read_text())
    database = Database(tmp_path / "test.db")
    await database.connect()
    try:
        await database.migrate(before)
        now = "2026-01-01T00:00:00+00:00"
        for user_id in (1, 2, 3):
            await database.conn.execute(
                "INSERT INTO users (telegram_id, created_at, updated_at) VALUES (?, ?, ?)",
                (user_id, now, now),
            )
        await database.conn.execute(
            "INSERT INTO requests (id, user_id, direction, amount, rate_type, rate_value, "
            "created_at, updated_at, expires_at) "
            "VALUES (1, 1, 'KZT_KRW', 10, 'market', 0, ?, ?, ?)",
            (now, now, now),
        )
        for deal_id, responder_id, status in ((1, 2, "cancelled"), (2, 3, "declined")):
            await database.conn.execute(
                "INSERT INTO deals (id, request_id, author_id, responder_id, status, created_at, "
                "updated_at) VALUES (?, 1, 1, ?, ?, ?, ?)",
                (deal_id, responder_id, status, now, now),
            )
        await database.conn.execute(
            "INSERT INTO reports (reporter_id, request_id, deal_id, reason, created_at) "
            "VALUES (2, 1, 1, 'test', ?)",
            (now,),
        )

        assert (await database.migrate())[0] == 5
        async with database.conn.execute("SELECT id, status FROM deals") as cursor:
            assert [tuple(row) for row in await cursor.fetchall()] == [(2, "declined")]
        async with database.conn.execute("SELECT deal_id FROM reports") as cursor:
            assert [row[0] for row in await cursor.fetchall()] == [None]
    finally:
        await database.close()


async def test_migration_breaking_foreign_keys_rolls_back(tmp_path: Path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    (migrations / "001_ok.sql").write_text(
        "CREATE TABLE a (id INTEGER PRIMARY KEY); "
        "CREATE TABLE b (a_id INTEGER REFERENCES a (id)); INSERT INTO a VALUES (1); "
        "INSERT INTO b VALUES (1);"
    )
    (migrations / "002_bad.sql").write_text("DELETE FROM a;")
    database = Database(tmp_path / "m.db")
    await database.connect()
    try:
        with pytest.raises(RuntimeError, match="Migration 2 breaks foreign keys in: b"):
            await database.migrate(migrations)
        async with database.conn.execute("SELECT COUNT(*) FROM a") as cursor:
            assert (await cursor.fetchone())[0] == 1
        async with database.conn.execute("PRAGMA foreign_keys") as cursor:
            assert (await cursor.fetchone())[0] == 1
    finally:
        await database.close()


async def test_migration_012_rebuilds_deals(tmp_path: Path) -> None:
    before = tmp_path / "before"
    before.mkdir()
    for path in sorted(MIGRATIONS_DIR.glob("0*.sql")):
        if int(path.name[:3]) <= 11:
            (before / path.name).write_text(path.read_text())
    database = Database(tmp_path / "test.db")
    await database.connect()
    try:
        await database.migrate(before)
        now = "2026-01-01T00:00:00+00:00"
        for user_id in (1, 2, 3):
            await database.conn.execute(
                "INSERT INTO users (telegram_id, created_at, updated_at) VALUES (?, ?, ?)",
                (user_id, now, now),
            )
        # 70 left after a 30 counter offer was accepted.
        await database.conn.execute(
            "INSERT INTO requests (id, user_id, direction, amount, rate_type, rate_value, "
            "created_at, updated_at, expires_at) "
            "VALUES (1, 1, 'KZT_KRW', 70, 'market', 0, ?, ?, ?)",
            (now, now, now),
        )
        for deal_id, responder_id, status, amount, partial in (
            (1, 2, "accepted", 30, 1),
            (2, 3, "pending", 20, 1),
        ):
            await database.conn.execute(
                "INSERT INTO deals (id, request_id, author_id, responder_id, status, amount, "
                "partial, created_at, updated_at) VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?)",
                (deal_id, responder_id, status, amount, partial, now, now),
            )
        await database.conn.execute(
            "INSERT INTO reports (reporter_id, request_id, deal_id, reason, created_at) "
            "VALUES (2, 1, 1, 'test', ?)",
            (now,),
        )

        assert (await database.migrate())[0] == 12
        async with database.conn.execute(
            "SELECT id, status, amount, partial, request_amount FROM deals ORDER BY id"
        ) as cursor:
            assert [tuple(row) for row in await cursor.fetchall()] == [
                (1, "accepted", 30, 1, 100),
                (2, "pending", 20, 1, 70),
            ]
        # Reports still point at deals, and a responder can have a second deal on a request.
        async with database.conn.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'reports'"
        ) as cursor:
            assert "REFERENCES deals (id)" in (await cursor.fetchone())[0]
        await database.conn.execute(
            "INSERT INTO deals (request_id, author_id, responder_id, amount, created_at, "
            "updated_at) VALUES (1, 1, 2, 70, ?, ?)",
            (now, now),
        )
        async with database.conn.execute("PRAGMA foreign_keys") as cursor:
            assert (await cursor.fetchone())[0] == 1
    finally:
        await database.close()
