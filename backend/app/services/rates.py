"""Reference KZT→KRW rate: fetched periodically, cached in the database."""

import logging
import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel

from app.db import Database, utc_now

logger = logging.getLogger(__name__)

FETCH_TIMEOUT = 10.0


def _parse_wise(data: Any) -> float:
    # {"source": "KZT", "target": "KRW", "value": ..., "time": ...}
    if data.get("source") != "KZT" or data.get("target") != "KRW":
        raise ValueError("rate source returned an error")
    return float(data["value"])


def _parse_currency_api(data: Any) -> float:
    # {"date": "...", "kzt": {"krw": ..., ...}}
    return float(data["kzt"]["krw"])


def _parse_er_api(data: Any) -> float:
    # {"result": "success", "rates": {"KRW": ...}, ...}
    if data.get("result") != "success":
        raise ValueError("rate source returned an error")
    return float(data["rates"]["KRW"])


@dataclass(frozen=True)
class RateSource:
    name: str
    url: str
    parse: Callable[[Any], float]


# Free and keyless, tried in order. Wise's live mid-market rate (the undocumented endpoint behind
# its public rate pages) is the closest to the live rate Google shows. open.er-api.com updates
# daily; fawazahmed0/currency-api (two URLs, same data) can lag a day behind.
RATE_SOURCES = (
    RateSource("wise", "https://wise.com/rates/live?source=KZT&target=KRW", _parse_wise),
    RateSource("open.er-api.com", "https://open.er-api.com/v6/latest/KZT", _parse_er_api),
    RateSource(
        "currency-api",
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kzt.json",
        _parse_currency_api,
    ),
    RateSource(
        "currency-api",
        "https://latest.currency-api.pages.dev/v1/currencies/kzt.json",
        _parse_currency_api,
    ),
)


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


async def fetch_krw_per_kzt(client: httpx.AsyncClient, source: RateSource) -> float:
    response = await client.get(source.url, timeout=FETCH_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("rate source returned an error")
    rate = source.parse(data)
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError("rate source returned an invalid rate")
    return rate


async def _fetch_first(client: httpx.AsyncClient) -> tuple[float, str] | None:
    for source in RATE_SOURCES:
        try:
            return await fetch_krw_per_kzt(client, source), source.name
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning(
                "Reference rate fetch from %s failed: %s", source.url, type(exc).__name__
            )
    return None


async def refresh_reference_rate(
    db: Database, client: httpx.AsyncClient | None = None
) -> ReferenceRate | None:
    """Fetch and store the latest rate. If all sources fail, keep the previous one; return None."""
    if client is None:
        async with httpx.AsyncClient() as own_client:
            fetched = await _fetch_first(own_client)
    else:
        fetched = await _fetch_first(client)
    if fetched is None:
        return None
    rate, source = fetched
    return await save_reference_rate(db, rate, source)
