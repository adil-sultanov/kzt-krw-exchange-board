"""Reference KZT→KRW rate: fetched periodically, cached in the database."""

import logging
import math

import httpx
from pydantic import BaseModel

from app.db import Database, utc_now

logger = logging.getLogger(__name__)

# Free, keyless, updated daily. Returns {"result": "success", "rates": {"KRW": ...}, ...}.
RATE_SOURCE_URL = "https://open.er-api.com/v6/latest/KZT"
RATE_SOURCE_NAME = "open.er-api.com"
FETCH_TIMEOUT = 10.0


class ReferenceRate(BaseModel):
    rate: float
    source: str
    fetched_at: str


async def get_reference_rate(db: Database) -> ReferenceRate | None:
    async with db.conn.execute(
        "SELECT rate, source, fetched_at FROM reference_rate WHERE id = 1"
    ) as cursor:
        row = await cursor.fetchone()
    return ReferenceRate.model_validate(dict(row)) if row is not None else None


async def save_reference_rate(db: Database, rate: float, source: str) -> ReferenceRate:
    saved = ReferenceRate(rate=rate, source=source, fetched_at=utc_now())
    async with db.transaction() as conn:
        await conn.execute(
            "INSERT INTO reference_rate (id, rate, source, fetched_at) VALUES (1, ?, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET "
            "rate = excluded.rate, source = excluded.source, fetched_at = excluded.fetched_at",
            (saved.rate, saved.source, saved.fetched_at),
        )
    return saved


async def fetch_krw_per_kzt(client: httpx.AsyncClient) -> float:
    response = await client.get(RATE_SOURCE_URL, timeout=FETCH_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict) or data.get("result") != "success":
        raise ValueError("rate source returned an error")
    rate = float(data["rates"]["KRW"])
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError("rate source returned an invalid rate")
    return rate


async def refresh_reference_rate(
    db: Database, client: httpx.AsyncClient | None = None
) -> ReferenceRate | None:
    """Fetch and store the latest rate. On failure, keep the previous one and return None."""
    try:
        if client is None:
            async with httpx.AsyncClient() as own_client:
                rate = await fetch_krw_per_kzt(own_client)
        else:
            rate = await fetch_krw_per_kzt(client)
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Reference rate refresh failed: %s", type(exc).__name__)
        return None
    return await save_reference_rate(db, rate, RATE_SOURCE_NAME)
