import asyncio
import os
import sqlite3
import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.backup import run_backup
from app.config import Settings
from app.db import Database
from app.jobs import build_scheduler
from app.services.notifications import NullNotifier

NOW = datetime(2026, 9, 27, 18, 0, 0, tzinfo=UTC)


async def _add_user(db: Database, telegram_id: int) -> None:
    async with db.transaction() as conn:
        await conn.execute(
            "INSERT INTO users (telegram_id, created_at, updated_at) VALUES (?, ?, ?)",
            (telegram_id, NOW.isoformat(), NOW.isoformat()),
        )


def _user_ids(path: Path) -> list[int]:
    conn = sqlite3.connect(path)
    try:
        return [row[0] for row in conn.execute("SELECT telegram_id FROM users ORDER BY 1")]
    finally:
        conn.close()


async def test_backup_is_a_checked_self_contained_copy(db: Database, tmp_path: Path) -> None:
    await _add_user(db, 1)
    await _add_user(db, 2)
    backups = tmp_path / "backups"

    path = await run_backup(db, backups, keep_days=14, now=NOW)

    assert path == backups / "exchange-20260927-180000.db"
    assert _user_ids(path) == [1, 2]
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600
    conn = sqlite3.connect(path)
    try:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "delete"
    finally:
        conn.close()
    # No temporary, WAL or shared-memory files left next to it.
    assert [p.name for p in backups.iterdir()] == [path.name]


async def test_backup_skips_an_unfinished_transaction(db: Database, tmp_path: Path) -> None:
    await _add_user(db, 1)
    async with db.transaction() as conn:
        await conn.execute(
            "INSERT INTO users (telegram_id, created_at, updated_at) VALUES (2, ?, ?)",
            (NOW.isoformat(), NOW.isoformat()),
        )
        # The backup waits for the write lock, so it runs only after this commits.
        task = asyncio.create_task(run_backup(db, tmp_path / "b", keep_days=14, now=NOW))
        await asyncio.sleep(0.05)
        assert not task.done()
    path = await task
    assert _user_ids(path) == [1, 2]


async def test_old_backups_are_deleted(db: Database, tmp_path: Path) -> None:
    backups = tmp_path / "backups"
    backups.mkdir()
    old = backups / (NOW - timedelta(days=15)).strftime("exchange-%Y%m%d-%H%M%S.db")
    recent = backups / (NOW - timedelta(days=13)).strftime("exchange-%Y%m%d-%H%M%S.db")
    unrelated = backups / "notes.txt"
    for path in (old, recent, unrelated):
        path.write_bytes(b"")

    new = await run_backup(db, backups, keep_days=14, now=NOW)

    assert sorted(p.name for p in backups.iterdir()) == sorted(
        [recent.name, new.name, unrelated.name]
    )


async def test_failed_backup_leaves_no_file(
    db: Database, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def corrupt(path: Path) -> None:
        raise RuntimeError("backup failed its integrity check")

    monkeypatch.setattr("app.backup._check_and_protect", corrupt)
    with pytest.raises(RuntimeError):
        await run_backup(db, tmp_path / "backups", keep_days=14, now=NOW)
    assert list((tmp_path / "backups").iterdir()) == []


def _job_ids(settings: Settings, db: Database) -> set[str]:
    return {job.id for job in build_scheduler(db, settings, NullNotifier()).get_jobs()}


async def test_backup_job_only_when_configured(
    settings: Settings, db: Database, tmp_path: Path
) -> None:
    assert "run_backup" not in _job_ids(settings, db)
    with_backups = settings.model_copy(update={"backup_dir": tmp_path / "backups"})
    assert "run_backup" in _job_ids(with_backups, db)


def test_empty_backup_dir_means_off() -> None:
    settings = Settings(_env_file=None, bot_token="t", webapp_url="https://x.test", backup_dir="")
    assert settings.backup_dir is None
