import hashlib
import hmac
import json
import sqlite3
import time
from typing import Any
from urllib.parse import urlencode

from fastapi.testclient import TestClient

from app.config import Settings
from app.models import User

BOT_TOKEN = "123456:TEST-token-for-tests"


def make_init_data(
    user: dict[str, Any] | None,
    *,
    bot_token: str = BOT_TOKEN,
    auth_date: int | None = None,
    extra: dict[str, str] | None = None,
) -> str:
    """Build initData signed the way Telegram does (written independently of app.auth)."""
    fields = {
        "auth_date": str(int(time.time()) if auth_date is None else auth_date),
        "query_id": "AAHtest",
    }
    if user is not None:
        fields["user"] = json.dumps(user, separators=(",", ":"), ensure_ascii=False)
    fields.update(extra or {})
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def auth(init_data: str) -> dict[str, str]:
    return {"Authorization": f"tma {init_data}"}


def auth_as(user: dict[str, Any]) -> dict[str, str]:
    return auth(make_init_data(user))


# --- Users and requests ---

AIDA = {"id": 1, "first_name": "Aida", "username": "aida"}
BEK = {"id": 2, "first_name": "Bek", "username": "bek"}
DANA = {"id": 3, "first_name": "Dana", "username": "dana"}
NO_USERNAME = {"id": 4, "first_name": "Nurlan"}

VALID = {
    "direction": "KZT_KRW",
    "amount": 100_000,
    "duration_days": 3,
}


def profile_of(user: dict[str, Any]) -> dict[str, Any]:
    """A filled-in profile (as sent to PATCH /api/me), which posting and taking need."""
    return {
        "profile_first_name": user["first_name"],
        "profile_last_name": "Testova",
        "university": "UNIST",
        "enrollment_year": 2022,
    }


def fill_profile(client: TestClient, user: dict[str, Any]) -> None:
    response = client.patch("/api/me", json=profile_of(user), headers=auth_as(user))
    assert response.status_code == 200, response.json()


def with_profile(user: User) -> User:
    """A user record as if they had filled in their profile (for calling services directly)."""
    return user.model_copy(update=profile_of({"first_name": user.first_name or "Test"}))


def sql(settings: Settings, query: str, params: tuple[Any, ...] = ()) -> None:
    with sqlite3.connect(settings.db_path) as conn:
        conn.execute(query, params)


def post(client: TestClient, user: dict[str, Any], **overrides: Any) -> Any:
    fill_profile(client, user)
    return client.post("/api/requests", json={**VALID, **overrides}, headers=auth_as(user))


def create(client: TestClient, user: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    response = post(client, user, **overrides)
    assert response.status_code == 201, response.json()
    return response.json()["request"]


def take(client: TestClient, user: dict[str, Any], request_id: int) -> Any:
    fill_profile(client, user)
    return client.post(f"/api/requests/{request_id}/take", headers=auth_as(user))
