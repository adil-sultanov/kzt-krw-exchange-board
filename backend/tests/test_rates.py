from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db import Database
from app.services.rates import get_reference_rate, refresh_reference_rate, save_reference_rate
from tests.helpers import auth_as

USER = {"id": 42, "first_name": "Aida", "username": "aida_kz"}


WISE_OK = {"source": "KZT", "target": "KRW", "value": 2.99, "time": 1791445681148}
CURRENCY_API_OK = {"date": "2026-09-26", "kzt": {"krw": 3.06}}
ER_API_OK = {"result": "success", "rates": {"KRW": 2.81}}


def mock_client(responses: dict[str, tuple[int, Any]]) -> httpx.AsyncClient:
    """Answers by host; hosts not listed fail with 503."""

    def handler(request: httpx.Request) -> httpx.Response:
        status, payload = responses.get(request.url.host, (503, {}))
        return httpx.Response(status, json=payload)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_refresh_stores_rate(db: Database) -> None:
    responses = {
        "wise.com": (200, WISE_OK),
        "open.er-api.com": (200, ER_API_OK),
        "cdn.jsdelivr.net": (200, CURRENCY_API_OK),
    }
    async with mock_client(responses) as client:
        saved = await refresh_reference_rate(db, client)
    assert saved is not None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert stored.rate == 2.99
    assert stored.source == "wise"


async def test_refresh_falls_back_to_next_source(db: Database) -> None:
    responses = {"open.er-api.com": (200, ER_API_OK), "cdn.jsdelivr.net": (200, CURRENCY_API_OK)}
    async with mock_client(responses) as client:
        assert await refresh_reference_rate(db, client) is not None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert (stored.rate, stored.source) == (2.81, "open.er-api.com")

    async with mock_client({"latest.currency-api.pages.dev": (200, CURRENCY_API_OK)}) as client:
        assert await refresh_reference_rate(db, client) is not None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert (stored.rate, stored.source) == (3.06, "currency-api")


@pytest.mark.parametrize(
    ("status", "wise", "currency_api", "er_api"),
    [
        (500, {}, {}, {}),
        (200, {"source": "KZT", "target": "USD", "value": 0.002}, {"kzt": {}}, {"result": "error"}),
        (
            200,
            {"source": "KZT", "target": "KRW", "value": 0},
            {"kzt": {"krw": 0}},
            {"result": "success", "rates": {}},
        ),
        (
            200,
            {"source": "KZT", "target": "KRW", "value": "abc"},
            {"kzt": {"krw": "abc"}},
            {"result": "success", "rates": {"KRW": 0}},
        ),
        (
            200,
            {"source": "KZT", "target": "KRW"},
            {"kzt": None},
            {"result": "success", "rates": {"KRW": "abc"}},
        ),
        (200, ["not", "a", "dict"], ["not", "a", "dict"], ["not", "a", "dict"]),
    ],
)
async def test_failed_refresh_keeps_previous_rate(
    db: Database, status: int, wise: Any, currency_api: Any, er_api: Any
) -> None:
    await save_reference_rate(db, 2.5, "test")
    responses = {
        "wise.com": (status, wise),
        "cdn.jsdelivr.net": (status, currency_api),
        "latest.currency-api.pages.dev": (status, currency_api),
        "open.er-api.com": (status, er_api),
    }
    async with mock_client(responses) as client:
        assert await refresh_reference_rate(db, client) is None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert stored.rate == 2.5


def test_rate_endpoint(client: TestClient) -> None:
    assert client.get("/api/rate").status_code == 401
    response = client.get("/api/rate", headers=auth_as(USER))
    assert response.status_code == 200
    assert response.json() == {"rate": None, "source": None, "fetched_at": None}
