from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from tests.helpers import AIDA, BEK, DANA, NO_USERNAME, VALID, auth_as, create, post, sql

PAST = "2000-01-01T00:00:00+00:00"


def board(client: TestClient, user: dict[str, Any], **params: Any) -> list[dict[str, Any]]:
    response = client.get("/api/requests", params=params, headers=auth_as(user))
    assert response.status_code == 200, response.json()
    return response.json()


def board_ids(client: TestClient, user: dict[str, Any], **params: Any) -> list[int]:
    return [item["id"] for item in board(client, user, **params)]


# --- Creating ---


def test_create_request(client: TestClient) -> None:
    response = post(client, AIDA)
    assert response.status_code == 201
    body = response.json()
    request = body["request"]
    assert request["direction"] == "KZT_KRW"
    assert request["amount"] == 100_000
    assert request["rate_value"] == 1.5
    assert request["effective_rate"] is None  # no reference rate yet
    assert "payment_methods" not in request
    assert "note" not in request
    assert "rate_type" not in request
    assert request["status"] == "open"
    assert request["is_own"] is True
    assert request["author_completed_deals"] == 0
    assert request["expires_at"] > request["created_at"]
    assert body["matches"] == []
    # The author's identity is never exposed.
    assert "user_id" not in request
    assert "aida" not in response.text


def test_create_requires_auth(client: TestClient) -> None:
    assert client.post("/api/requests", json=VALID).status_code == 401


def test_create_requires_username(client: TestClient) -> None:
    response = post(client, NO_USERNAME)
    assert response.status_code == 403
    assert response.json() == {"detail": "username_required"}


def test_banned_user_cannot_post(client: TestClient, settings: Settings) -> None:
    create(client, AIDA)
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (AIDA["id"],))
    response = post(client, AIDA)
    assert response.status_code == 403
    assert response.json() == {"detail": "user_banned"}


@pytest.mark.parametrize(
    "overrides",
    [
        {"direction": "USD_KRW"},
        {"amount": 0},
        {"amount": 1.5},
        {"amount": "100"},
        {"amount": 10**12},
        {"rate_value": 20.01},
        {"rate_value": -25},
        {"rate_value": "NaN"},
        {"rate_type": "fixed"},
        {"payment_methods": ["kaspi"]},
        {"duration_days": 2},
        {"duration_days": 7},
        {"note": "hi"},
        {"user_id": 99},
    ],
)
def test_create_rejects_invalid_input(client: TestClient, overrides: dict[str, Any]) -> None:
    response = post(client, AIDA, **overrides)
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_input"}


def test_create_normalizes_input(client: TestClient) -> None:
    request = create(client, AIDA, rate_value=-2.345)
    assert request["rate_value"] == -2.35


def test_create_defaults_to_market_rate(client: TestClient, settings: Settings) -> None:
    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.7, 'test', '2026-01-01T00:00:00+00:00')")
    body = {key: value for key, value in VALID.items() if key != "rate_value"}
    response = client.post("/api/requests", json=body, headers=auth_as(AIDA))
    assert response.status_code == 201
    request = response.json()["request"]
    assert request["rate_value"] == 0
    assert request["effective_rate"] == pytest.approx(2.7)


def test_open_request_limit(client: TestClient, settings: Settings) -> None:
    for _ in range(5):
        create(client, AIDA)
    response = post(client, AIDA)
    assert response.status_code == 409
    assert response.json() == {"detail": "too_many_open_requests"}
    # Expired requests don't count towards the limit.
    sql(settings, "UPDATE requests SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = 1")
    sql(settings, "UPDATE requests SET created_at = '2000-01-01T00:00:00+00:00' WHERE id = 1")
    assert post(client, AIDA).status_code == 201


def test_hourly_creation_limit(client: TestClient, settings: Settings) -> None:
    for _ in range(5):
        create(client, AIDA)
    sql(settings, "UPDATE requests SET status = 'closed'")
    response = post(client, AIDA)
    assert response.status_code == 429
    assert response.json() == {"detail": "rate_limited"}


# --- Board ---


def test_board_hides_own_banned_expired_and_closed(client: TestClient, settings: Settings) -> None:
    own = create(client, AIDA)["id"]
    visible = create(client, BEK)["id"]
    expired = create(client, BEK)["id"]
    closed = create(client, BEK)["id"]
    create(client, DANA)  # author gets banned below
    sql(settings, "UPDATE requests SET expires_at = '2000-01-01T00:00:00+00:00' WHERE id = ?",
        (expired,))  # fmt: skip
    sql(settings, "UPDATE requests SET status = 'closed' WHERE id = ?", (closed,))
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (DANA["id"],))

    assert board_ids(client, AIDA) == [visible]
    assert board_ids(client, BEK) == [own]  # not his own, expired, closed or banned
    assert all(item["is_own"] is False for item in board(client, AIDA))


def test_board_filters(client: TestClient) -> None:
    small = create(client, BEK, amount=50_000)["id"]
    big = create(client, BEK, amount=500_000)["id"]
    krw = create(client, BEK, direction="KRW_KZT", amount=300_000)["id"]

    assert board_ids(client, AIDA, direction="KZT_KRW") == [big, small]
    assert board_ids(client, AIDA, direction="KRW_KZT") == [krw]
    assert board_ids(client, AIDA, min_amount=100_000, max_amount=400_000) == [krw]


def test_board_sorting(client: TestClient, settings: Settings) -> None:
    below = create(client, BEK, rate_value=-3, amount=300)["id"]
    above = create(client, BEK, rate_value=5, amount=100)["id"]
    market = create(client, BEK, rate_value=0, amount=200)["id"]
    krw = create(client, BEK, direction="KRW_KZT", rate_value=2, amount=400)["id"]

    # Best rate for the taker first, even without a reference rate: the taker of a KZT_KRW
    # request pays KRW, so a lower rate is better; of a KRW_KZT one, a higher rate.
    assert board_ids(client, AIDA, sort="best_rate") == [below, krw, market, above]

    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.7, 'test', '2026-01-01T00:00:00+00:00')")
    items = board(client, AIDA, sort="best_rate", direction="KZT_KRW")
    assert [item["id"] for item in items] == [below, market, above]
    assert [item["effective_rate"] for item in items] == pytest.approx([2.619, 2.7, 2.835])

    assert board_ids(client, AIDA, sort="amount_asc") == [above, market, below, krw]
    assert board_ids(client, AIDA, sort="amount_desc") == [krw, below, market, above]
    assert board_ids(client, AIDA) == [krw, market, above, below]  # newest first
    assert client.get(
        "/api/requests", params={"sort": "rate_asc"}, headers=auth_as(AIDA)
    ).json() == {"detail": "invalid_input"}


def test_board_pagination(client: TestClient) -> None:
    ids = [create(client, BEK)["id"] for _ in range(3)]
    assert board_ids(client, AIDA, limit=2) == ids[::-1][:2]
    assert board_ids(client, AIDA, limit=2, offset=2) == ids[:1]


@pytest.mark.parametrize(
    "params", [{"sort": "random"}, {"limit": 0}, {"limit": 101}, {"min_amount": -1}]
)
def test_board_rejects_bad_params(client: TestClient, params: dict[str, Any]) -> None:
    response = client.get("/api/requests", params=params, headers=auth_as(AIDA))
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_input"}


# --- Detail ---


def test_request_detail(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    response = client.get(f"/api/requests/{request_id}", headers=auth_as(BEK))
    assert response.status_code == 200
    assert response.json()["is_own"] is False
    assert "aida" not in response.text
    own = client.get(f"/api/requests/{request_id}", headers=auth_as(AIDA)).json()
    assert own["is_own"] is True


def test_request_detail_not_found(client: TestClient) -> None:
    response = client.get("/api/requests/999", headers=auth_as(AIDA))
    assert response.status_code == 404
    assert response.json() == {"detail": "request_not_found"}


def test_request_detail_hides_banned_author_from_others(
    client: TestClient, settings: Settings
) -> None:
    request_id = create(client, DANA)["id"]
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (DANA["id"],))
    assert client.get(f"/api/requests/{request_id}", headers=auth_as(AIDA)).status_code == 404
    assert client.get(f"/api/requests/{request_id}", headers=auth_as(DANA)).status_code == 200


def test_past_due_request_shows_as_expired(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    sql(settings, "UPDATE requests SET expires_at = '2000-01-01T00:00:00+00:00'")
    response = client.get(f"/api/requests/{request_id}", headers=auth_as(BEK))
    assert response.json()["status"] == "expired"


# --- My requests and closing ---


def close(client: TestClient, user: dict[str, Any], request_id: int) -> Any:
    return client.post(f"/api/requests/{request_id}/close", headers=auth_as(user))


def my_request_ids(client: TestClient, user: dict[str, Any]) -> list[int]:
    response = client.get("/api/my/requests", headers=auth_as(user))
    assert response.status_code == 200, response.json()
    return [item["id"] for item in response.json()]


def test_my_requests_are_own_requests_on_the_board(client: TestClient, settings: Settings) -> None:
    first = create(client, AIDA)["id"]
    second = create(client, AIDA)["id"]
    expired = create(client, AIDA)["id"]
    closed = create(client, AIDA)["id"]
    create(client, BEK)
    sql(settings, "UPDATE requests SET expires_at = ? WHERE id = ?", (PAST, expired))
    sql(settings, "UPDATE requests SET status = 'closed' WHERE id = ?", (closed,))

    assert my_request_ids(client, AIDA) == [second, first]
    assert my_request_ids(client, DANA) == []
    assert client.get("/api/my/requests").status_code == 401


def test_close_request(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    response = close(client, AIDA, request_id)
    assert response.status_code == 200
    assert response.json()["status"] == "closed"
    assert board_ids(client, BEK) == []
    assert my_request_ids(client, AIDA) == []
    # Closing twice is rejected, and closed requests still count towards the hourly limit.
    assert close(client, AIDA, request_id).json() == {"detail": "request_not_open"}


def test_close_rejections(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    assert client.post(f"/api/requests/{request_id}/close").status_code == 401
    response = close(client, BEK, request_id)
    assert (response.status_code, response.json()) == (403, {"detail": "not_request_author"})
    response = close(client, BEK, 999)
    assert (response.status_code, response.json()) == (404, {"detail": "request_not_found"})
    sql(settings, "UPDATE requests SET expires_at = ?", (PAST,))
    response = close(client, AIDA, request_id)
    assert (response.status_code, response.json()) == (409, {"detail": "request_not_open"})


def test_banned_author_can_still_close_own_request(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (AIDA["id"],))
    assert close(client, BEK, request_id).json() == {"detail": "request_not_found"}
    assert close(client, AIDA, request_id).json()["status"] == "closed"


# --- Matches ---


def test_matches_are_opposite_requests_closest_in_size(
    client: TestClient, settings: Settings
) -> None:
    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.0, 'test', '2026-01-01T00:00:00+00:00')")
    # KRW→KZT requests from others; in KZT these are worth 50k, 95k and 400k.
    far = create(client, BEK, direction="KRW_KZT", amount=800_000, rate_value=0)["id"]
    close = create(client, BEK, direction="KRW_KZT", amount=190_000, rate_value=0)["id"]
    market = create(client, DANA, direction="KRW_KZT", amount=100_000, rate_value=0)["id"]
    create(client, BEK, direction="KZT_KRW")  # same direction: not a match
    create(client, AIDA, direction="KRW_KZT")  # own: not a match

    response = post(client, AIDA, direction="KZT_KRW", amount=100_000)
    assert [m["id"] for m in response.json()["matches"]] == [close, market, far]
