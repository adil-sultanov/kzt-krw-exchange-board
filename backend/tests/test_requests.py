from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, utc_iso
from app.models import TelegramUser
from app.services import requests
from app.services.users import upsert_user
from tests.conftest import FakeNotifier
from tests.helpers import (
    AIDA,
    BEK,
    DANA,
    NO_USERNAME,
    VALID,
    auth_as,
    create,
    fill_profile,
    post,
    sql,
    take,
)

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
    # The author's username is shown, never their Telegram ID.
    assert "user_id" not in request
    assert request["author_username"] == "aida"


def test_create_requires_auth(client: TestClient) -> None:
    assert client.post("/api/requests", json=VALID).status_code == 401


def test_create_requires_username(client: TestClient) -> None:
    response = post(client, NO_USERNAME)
    assert response.status_code == 403
    assert response.json() == {"detail": "username_required"}


def test_create_requires_a_full_profile(client: TestClient) -> None:
    fill_profile(client, AIDA)
    client.patch("/api/me", json={"university": ""}, headers=auth_as(AIDA))
    response = client.post("/api/requests", json=VALID, headers=auth_as(AIDA))
    assert (response.status_code, response.json()) == (403, {"detail": "profile_required"})


def test_requests_show_the_authors_profile(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    expected = {
        "first_name": "Aida",
        "last_name": "Testova",
        "university": "UNIST",
        "enrollment_year": 2022,
    }
    assert board(client, BEK)[0]["author_profile"] == expected
    detail = client.get(f"/api/requests/{request_id}", headers=auth_as(BEK)).json()
    assert detail["author_profile"] == expected
    # With the author's username, but never their Telegram ID.
    assert detail["author_username"] == "aida"
    assert "user_id" not in detail and "author_id" not in detail

    # Clearing it later hides what was cleared (all of it: no profile at all).
    client.patch("/api/me", json={"university": ""}, headers=auth_as(AIDA))
    assert board(client, BEK)[0]["author_profile"]["university"] is None
    cleared = {"profile_first_name": "", "profile_last_name": "", "enrollment_year": None}
    client.patch("/api/me", json=cleared, headers=auth_as(AIDA))
    assert board(client, BEK)[0]["author_profile"] is None


def test_board_shows_the_authors_current_username(client: TestClient) -> None:
    create(client, AIDA)
    assert board(client, BEK)[0]["author_username"] == "aida"
    # Usernames aren't stored with requests: a new one shows at once, and none shows as null.
    client.get("/api/me", headers=auth_as({**AIDA, "username": "aida_new"}))
    assert board(client, BEK)[0]["author_username"] == "aida_new"
    client.get("/api/me", headers=auth_as({"id": AIDA["id"], "first_name": "Aida"}))
    assert board(client, BEK)[0]["author_username"] is None


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
        {"kzt_bank": "x" * 41},
        {"kzt_bank": "https://kaspi.kz"},
        {"kzt_bank": "Kaspi 💸"},
        {"kzt_bank": 5},
        {"remember_kzt_bank": "yes"},
    ],
)
def test_create_rejects_invalid_input(client: TestClient, overrides: dict[str, Any]) -> None:
    response = post(client, AIDA, **overrides)
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_input"}


def test_create_normalizes_input(client: TestClient) -> None:
    request = create(client, AIDA, rate_value=-2.345)
    assert request["rate_value"] == -2.35


def me(client: TestClient, user: dict[str, Any]) -> dict[str, Any]:
    return client.get("/api/me", headers=auth_as(user)).json()


def test_preferred_kzt_bank_is_optional_and_shown(client: TestClient) -> None:
    assert create(client, AIDA)["kzt_bank"] is None
    assert create(client, AIDA, kzt_bank="   ")["kzt_bank"] is None
    request = create(client, AIDA, kzt_bank="  Kaspi,  Halyk ")
    assert request["kzt_bank"] == "Kaspi, Halyk"
    shown = client.get(f"/api/requests/{request['id']}", headers=auth_as(BEK)).json()
    assert shown["kzt_bank"] == "Kaspi, Halyk"
    assert [item["kzt_bank"] for item in board(client, BEK)] == ["Kaspi, Halyk", None, None]


def test_preferred_kzt_bank_is_remembered_on_request(client: TestClient) -> None:
    create(client, AIDA, kzt_bank="Kaspi")
    assert me(client, AIDA)["saved_kzt_bank"] is None
    create(client, AIDA, kzt_bank="Halyk", remember_kzt_bank=True)
    assert me(client, AIDA)["saved_kzt_bank"] == "Halyk"
    # Left out, it stays; false forgets it, whatever this request's bank.
    create(client, AIDA, kzt_bank="Jusan")
    assert me(client, AIDA)["saved_kzt_bank"] == "Halyk"
    create(client, AIDA, kzt_bank="Jusan", remember_kzt_bank=False)
    assert me(client, AIDA)["saved_kzt_bank"] is None
    assert me(client, BEK)["saved_kzt_bank"] is None


def test_create_defaults_to_market_rate(client: TestClient, settings: Settings) -> None:
    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.7, 'test', '2026-01-01T00:00:00+00:00')")
    body = {key: value for key, value in VALID.items() if key != "rate_value"}
    fill_profile(client, AIDA)
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


def test_board_sorting(client: TestClient, settings: Settings) -> None:
    below = create(client, BEK, rate_value=-3, amount=300)["id"]
    above = create(client, BEK, rate_value=5, amount=100)["id"]
    market = create(client, BEK, rate_value=0, amount=200)["id"]
    krw = create(client, BEK, direction="KRW_KZT", rate_value=2, amount=400)["id"]

    # Best rate for the taker first, even without a reference rate: the taker of a KZT_KRW
    # request pays KRW, so a lower rate is better; of a KRW_KZT one, a higher rate.
    assert board_ids(client, AIDA, sort="rate") == [below, krw, market, above]
    assert board_ids(client, AIDA, sort="rate", order="asc") == [above, market, krw, below]
    # Without a reference rate, a KRW amount can't be compared with KZT ones: it comes last.
    assert board_ids(client, AIDA, sort="amount") == [below, market, above, krw]
    assert board_ids(client, AIDA, sort="amount", order="asc") == [above, market, below, krw]

    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.7, 'test', '2026-01-01T00:00:00+00:00')")
    items = board(client, AIDA, sort="rate", direction="KZT_KRW")
    assert [item["id"] for item in items] == [below, market, above]
    assert [item["effective_rate"] for item in items] == pytest.approx([2.619, 2.7, 2.835])

    # Within a tab, by amount; across both, KRW amounts count as KZT at the request's rate.
    kzt_krw = {"direction": "KZT_KRW", "sort": "amount"}
    assert board_ids(client, AIDA, **kzt_krw, order="asc") == [above, market, below]
    assert board_ids(client, AIDA, **kzt_krw) == [below, market, above]
    assert board_ids(client, AIDA, sort="amount") == [below, market, krw, above]  # 400 ₩ ≈ 145 ₸
    assert board_ids(client, AIDA, sort="amount", order="asc") == [above, krw, market, below]
    assert board_ids(client, AIDA) == [krw, market, above, below]  # newest first
    assert board_ids(client, AIDA, order="asc") == [below, above, market, krw]
    assert client.get(
        "/api/requests", params={"sort": "best_rate"}, headers=auth_as(AIDA)
    ).json() == {"detail": "invalid_input"}


def test_board_pagination(client: TestClient) -> None:
    ids = [create(client, BEK)["id"] for _ in range(3)]
    assert board_ids(client, AIDA, limit=2) == ids[::-1][:2]
    assert board_ids(client, AIDA, limit=2, offset=2) == ids[:1]


@pytest.mark.parametrize(
    "params",
    [{"sort": "random"}, {"order": "up"}, {"limit": 0}, {"limit": 101}],
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
    assert response.json()["author_username"] == "aida"
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


# --- Editing, extending and expiry ---


def edit(client: TestClient, user: dict[str, Any], request_id: int, **body: Any) -> Any:
    return client.patch(f"/api/requests/{request_id}", json=body, headers=auth_as(user))


def iso_in(**delta: float) -> str:
    return (datetime.now(UTC) + timedelta(**delta)).isoformat(timespec="seconds")


def test_edit_amount_and_rate(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    response = edit(client, AIDA, request_id, amount=250_000, rate_value=-2.345)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert (body["amount"], body["rate_value"]) == (250_000, -2.35)
    assert body["pending_count"] == 0
    assert client.get(f"/api/requests/{request_id}", headers=auth_as(BEK)).json()["amount"] == (
        250_000
    )


def test_edit_preferred_kzt_bank(client: TestClient) -> None:
    request_id = create(client, AIDA, kzt_bank="Kaspi")["id"]
    response = edit(client, AIDA, request_id, kzt_bank="Halyk")
    assert (response.status_code, response.json()["kzt_bank"]) == (200, "Halyk")
    assert edit(client, AIDA, request_id, kzt_bank=None).json()["kzt_bank"] is None
    assert edit(client, AIDA, request_id, kzt_bank="Jusan").json()["kzt_bank"] == "Jusan"
    assert edit(client, AIDA, request_id, kzt_bank="").json()["kzt_bank"] is None
    assert edit(client, AIDA, request_id, kzt_bank="www.x.kz/?a").status_code == 422
    # It's one of the terms people take a request on.
    take(client, BEK, request_id)
    response = edit(client, AIDA, request_id, kzt_bank="Kaspi")
    assert response.json() == {"detail": "request_has_responders"}


def test_pending_count_is_for_the_author_only(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    take(client, BEK, request_id)
    own = client.get(f"/api/requests/{request_id}", headers=auth_as(AIDA)).json()
    other = client.get(f"/api/requests/{request_id}", headers=auth_as(DANA)).json()
    assert (own["pending_count"], other["pending_count"]) == (1, None)


def test_edit_refused_while_responders_wait(client: TestClient) -> None:
    request_id = create(client, AIDA, duration_days=1)["id"]
    take(client, BEK, request_id)
    response = edit(client, AIDA, request_id, amount=1)
    assert (response.status_code, response.json()) == (409, {"detail": "request_has_responders"})
    # Unchanged values and extending don't change the terms.
    assert edit(client, AIDA, request_id, amount=VALID["amount"]).status_code == 200
    assert edit(client, AIDA, request_id, extend_days=3).status_code == 200


def test_edit_rejections(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    assert client.patch(f"/api/requests/{request_id}", json={"amount": 1}).status_code == 401
    response = edit(client, BEK, request_id, amount=1)
    assert (response.status_code, response.json()) == (403, {"detail": "not_request_author"})
    response = edit(client, AIDA, 999, amount=1)
    assert (response.status_code, response.json()) == (404, {"detail": "request_not_found"})
    for body in ({}, {"amount": 0}, {"rate_value": 21}, {"extend_days": 2}, {"direction": "x"}):
        assert edit(client, AIDA, request_id, **body).status_code == 422, body

    sql(settings, "UPDATE requests SET expires_at = ?", (PAST,))
    response = edit(client, AIDA, request_id, extend_days=1)
    assert (response.status_code, response.json()) == (409, {"detail": "request_not_open"})
    for status in ("closed", "in_progress", "expired"):
        sql(settings, "UPDATE requests SET status = ?, expires_at = ?", (status, iso_in(days=1)))
        assert edit(client, AIDA, request_id, amount=1).json() == {"detail": "request_not_open"}

    sql(settings, "UPDATE requests SET status = 'open'")
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (AIDA["id"],))
    assert edit(client, AIDA, request_id, amount=1).json() == {"detail": "user_banned"}


def test_extend(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA, duration_days=1)["id"]
    before = client.get(f"/api/requests/{request_id}", headers=auth_as(AIDA)).json()
    # Extending never shortens a request: 1 day from now isn't later than its expiry.
    response = edit(client, AIDA, request_id, extend_days=1)
    assert (response.status_code, response.json()) == (409, {"detail": "already_extended"})

    extended = edit(client, AIDA, request_id, extend_days=3).json()
    assert extended["expires_at"] > before["expires_at"]
    assert extended["expires_at"] <= iso_in(days=3, seconds=5)

    sql(settings, "UPDATE requests SET expires_at = ?", (iso_in(hours=2),))
    assert edit(client, AIDA, request_id, extend_days=1).json()["expires_at"] > iso_in(hours=23)


async def test_expire_due(db: Database) -> None:
    now = datetime.now(UTC)
    for telegram_id in (1, 2):
        await upsert_user(
            db, TelegramUser(id=telegram_id, username=f"u{telegram_id}"), config_admin=False
        )
    past, future = utc_iso(now - timedelta(minutes=1)), utc_iso(now + timedelta(days=1))
    stamp = utc_iso(now)
    rows = [(1, "open", past), (2, "open", future), (3, "in_progress", past)]
    async with db.transaction() as conn:
        for request_id, status, expires_at in rows:
            await conn.execute(
                "INSERT INTO requests (id, user_id, direction, amount, rate_type, rate_value, "
                "status, created_at, updated_at, expires_at) "
                "VALUES (?, 1, 'KZT_KRW', 100, 'market', 0, ?, ?, ?, ?)",
                (request_id, status, stamp, stamp, expires_at),
            )
            await conn.execute(
                "INSERT INTO deals (request_id, author_id, responder_id, status, "
                "created_at, updated_at) VALUES (?, 1, 2, ?, ?, ?)",
                (request_id, "accepted" if status == "in_progress" else "pending", stamp, stamp),
            )

    notifier = FakeNotifier()
    assert await requests.expire_due(db, notifier) == 1
    assert await requests.expire_due(db, notifier) == 0
    # Crossing out alerts runs every time, so it also catches any missed before a restart.
    assert notifier.left_board == 2
    async with db.conn.execute(
        "SELECT r.status, d.status FROM requests r JOIN deals d ON d.request_id = r.id "
        "ORDER BY r.id"
    ) as cursor:
        statuses = [tuple(row) for row in await cursor.fetchall()]
    assert statuses == [("expired", "declined"), ("open", "pending"), ("in_progress", "accepted")]


def test_my_requests_include_recently_expired(client: TestClient, settings: Settings) -> None:
    lazily_expired = create(client, AIDA)["id"]
    expired = create(client, AIDA)["id"]
    long_ago = create(client, AIDA)["id"]
    sql(
        settings,
        "UPDATE requests SET expires_at = ? WHERE id = ?",
        (iso_in(hours=-1), lazily_expired),
    )
    sql(
        settings,
        "UPDATE requests SET status = 'expired', expires_at = ? WHERE id = ?",
        (iso_in(hours=-23), expired),
    )
    sql(settings, "UPDATE requests SET expires_at = ? WHERE id = ?", (iso_in(hours=-25), long_ago))

    response = client.get("/api/my/requests", headers=auth_as(AIDA))
    listed = [(item["id"], item["status"]) for item in response.json()]
    assert listed == [(expired, "expired"), (lazily_expired, "expired")]


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


def test_request_matches_are_for_the_author(client: TestClient, settings: Settings) -> None:
    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.0, 'test', '2026-01-01T00:00:00+00:00')")
    mine = create(client, AIDA)["id"]
    other = create(client, BEK, direction="KRW_KZT")["id"]
    response = client.get(f"/api/requests/{mine}/matches", headers=auth_as(AIDA))
    assert [m["id"] for m in response.json()] == [other]
    response = client.get(f"/api/requests/{mine}/matches", headers=auth_as(BEK))
    assert (response.status_code, response.json()) == (403, {"detail": "not_request_author"})
    sql(settings, "UPDATE requests SET status = 'closed' WHERE id = ?", (mine,))
    assert client.get(f"/api/requests/{mine}/matches", headers=auth_as(AIDA)).json() == []
