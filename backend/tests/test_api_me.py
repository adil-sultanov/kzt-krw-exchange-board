import time
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import ADMIN_ID
from tests.helpers import make_init_data

USER = {"id": 42, "first_name": "Aida", "username": "aida_kz"}


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def auth(init_data: str) -> dict[str, str]:
    return {"Authorization": f"tma {init_data}"}


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer abc"}])
def test_me_requires_auth(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/api/me", headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "auth_required"}


def test_me_rejects_wrong_signature(client: TestClient) -> None:
    response = client.get("/api/me", headers=auth(make_init_data(USER, bot_token="1:other")))
    assert response.status_code == 401
    assert response.json() == {"detail": "init_data_invalid"}


def test_me_rejects_expired(client: TestClient) -> None:
    stale = make_init_data(USER, auth_date=int(time.time()) - 2 * 86400)
    response = client.get("/api/me", headers=auth(stale))
    assert response.status_code == 401
    assert response.json() == {"detail": "init_data_expired"}


def test_me_returns_caller_and_refreshes_username(client: TestClient) -> None:
    response = client.get("/api/me", headers=auth(make_init_data(USER)))
    assert response.status_code == 200
    assert response.json() == {
        "telegram_id": 42,
        "username": "aida_kz",
        "first_name": "Aida",
        "completed_deals": 0,
        "is_banned": False,
        "is_admin": False,
    }

    renamed = {**USER, "username": "aida_new"}
    response = client.get("/api/me", headers=auth(make_init_data(renamed)))
    assert response.json()["username"] == "aida_new"


def test_me_admin_from_config(client: TestClient) -> None:
    admin = {"id": ADMIN_ID, "first_name": "Admin"}
    response = client.get("/api/me", headers=auth(make_init_data(admin)))
    assert response.json()["is_admin"] is True
