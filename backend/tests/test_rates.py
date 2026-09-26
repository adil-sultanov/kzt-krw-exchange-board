from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.db import Database
from app.services.rates import get_reference_rate, refresh_reference_rate, save_reference_rate
from tests.helpers import auth_as

USER = {"id": 42, "first_name": "Aida", "username": "aida_kz"}


def mock_client(status: int = 200, payload: Any = None) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_refresh_stores_rate(db: Database) -> None:
    async with mock_client(payload={"result": "success", "rates": {"KRW": 2.81}}) as client:
        saved = await refresh_reference_rate(db, client)
    assert saved is not None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert stored.rate == 2.81
    assert stored.source == "open.er-api.com"


@pytest.mark.parametrize(
    ("status", "payload"),
    [
        (500, {}),
        (200, {"result": "error"}),
        (200, {"result": "success", "rates": {}}),
        (200, {"result": "success", "rates": {"KRW": 0}}),
        (200, {"result": "success", "rates": {"KRW": "abc"}}),
        (200, ["not", "a", "dict"]),
    ],
)
async def test_failed_refresh_keeps_previous_rate(db: Database, status: int, payload: Any) -> None:
    await save_reference_rate(db, 2.5, "test")
    async with mock_client(status, payload) as client:
        assert await refresh_reference_rate(db, client) is None
    stored = await get_reference_rate(db)
    assert stored is not None
    assert stored.rate == 2.5


def test_rate_endpoint(client: TestClient) -> None:
    assert client.get("/api/rate").status_code == 401
    response = client.get("/api/rate", headers=auth_as(USER))
    assert response.status_code == 200
    assert response.json() == {"rate": None, "source": None, "fetched_at": None}
