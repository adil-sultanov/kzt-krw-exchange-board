"""Periodic background jobs (APScheduler, in the API process)."""

from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.backup import run_backup
from app.config import Settings
from app.db import Database
from app.services.deals import delete_old_deals
from app.services.rates import refresh_reference_rate
from app.services.requests import expire_due

RATE_REFRESH_MINUTES = 60
EXPIRY_MINUTES = 5
CLEANUP_HOURS = 24
BACKUP_HOUR_UTC = 18  # 03:00 KST, when the board is quietest


def build_scheduler(db: Database, settings: Settings) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=UTC)
    scheduler.add_job(
        refresh_reference_rate,
        "interval",
        minutes=RATE_REFRESH_MINUTES,
        args=[db],
        id="refresh_reference_rate",
        next_run_time=datetime.now(UTC),  # also once at startup
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        expire_due,
        "interval",
        minutes=EXPIRY_MINUTES,
        args=[db],
        id="expire_due",
        next_run_time=datetime.now(UTC),
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        delete_old_deals,
        "interval",
        hours=CLEANUP_HOURS,
        args=[db],
        id="delete_old_deals",
        next_run_time=datetime.now(UTC),
        max_instances=1,
        coalesce=True,
    )
    if settings.backup_dir is not None:
        scheduler.add_job(
            run_backup,
            "cron",
            hour=BACKUP_HOUR_UTC,
            args=[db, settings.backup_dir, settings.backup_keep_days],
            id="run_backup",
            misfire_grace_time=60 * 60,
            max_instances=1,
            coalesce=True,
        )
    return scheduler
