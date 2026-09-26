"""Database backups: a daily job, and `python -m app.backup` for a one-off copy.

Backups contain everything, including receiving details: files are owner-only (0600),
and only file names and counts are logged.
"""

import asyncio
import logging
import os
import re
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.db import Database

logger = logging.getLogger(__name__)

_NAME_FORMAT = "exchange-%Y%m%d-%H%M%S.db"
_NAME = re.compile(r"^exchange-\d{8}-\d{6}\.db$")


async def run_backup(
    db: Database, backup_dir: Path, keep_days: int, now: datetime | None = None
) -> Path:
    """Write a checked backup to `backup_dir`, then delete backups older than `keep_days`."""
    now = now or datetime.now(UTC)
    await asyncio.to_thread(backup_dir.mkdir, parents=True, exist_ok=True)
    final = backup_dir / now.strftime(_NAME_FORMAT)
    # Write under a temporary name, so a crash never leaves a partial file that looks
    # like a real backup.
    temp = final.with_name(final.name + ".tmp")
    try:
        await db.backup_to(temp)
        await asyncio.to_thread(_check_and_protect, temp)
        await asyncio.to_thread(temp.replace, final)
    except BaseException:
        await asyncio.to_thread(temp.unlink, missing_ok=True)
        raise
    deleted = await asyncio.to_thread(_prune, backup_dir, now - timedelta(days=keep_days))
    logger.info("Backup written: %s (%d old backups deleted)", final.name, deleted)
    return final


def _check_and_protect(path: Path) -> None:
    os.chmod(path, 0o600)
    conn = sqlite3.connect(path)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        conn.close()
    if result != "ok":
        raise RuntimeError("backup failed its integrity check")


def _prune(backup_dir: Path, cutoff: datetime) -> int:
    """Delete backups taken before `cutoff`, judged by the time in the file name."""
    deleted = 0
    for path in backup_dir.iterdir():
        if not _NAME.match(path.name):
            continue
        taken = datetime.strptime(path.name, _NAME_FORMAT).replace(tzinfo=UTC)
        if taken >= cutoff:
            continue
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("Couldn't delete old backup %s: %s", path.name, type(exc).__name__)
        else:
            deleted += 1
    return deleted


async def _main() -> None:
    from app.config import get_settings

    settings = get_settings()
    if settings.backup_dir is None:
        raise SystemExit("BACKUP_DIR is not set")
    db = Database(settings.db_path)
    await db.connect()
    try:
        path = await run_backup(db, settings.backup_dir, settings.backup_keep_days)
    finally:
        await db.close()
    print(path)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    asyncio.run(_main())
