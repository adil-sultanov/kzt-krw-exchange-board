"""Periodic background jobs (APScheduler, in the API process)."""

from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.db import Database
from app.services.rates import refresh_reference_rate
from app.services.requests import expire_due

RATE_REFRESH_MINUTES = 60
EXPIRY_MINUTES = 5


def build_scheduler(db: Database) -> AsyncIOScheduler:
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
    return scheduler
