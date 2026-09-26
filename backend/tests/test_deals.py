import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Database, utc_iso
from app.models import RequestCreate, TelegramUser
from app.services import deals, requests
from app.services.errors import ConflictError
from app.services.notifications import NullNotifier
from app.services.users import upsert_user
from tests.conftest import FakeNotifier
from tests.helpers import AIDA, BEK, DANA, NO_USERNAME, VALID, auth_as, create, sql

PAST = "2000-01-01T00:00:00+00:00"


def take(client: TestClient, user: dict[str, Any], request_id: int) -> Any:
    return client.post(f"/api/requests/{request_id}/take", headers=auth_as(user))


def taken(client: TestClient, user: dict[str, Any], request_id: int) -> dict[str, Any]:
    response = take(client, user, request_id)
    assert response.status_code == 201, response.json()
    return response.json()


def act(client: TestClient, user: dict[str, Any], deal_id: int, action: str) -> Any:
    return client.post(f"/api/deals/{deal_id}/{action}", headers=auth_as(user))


def get(client: TestClient, user: dict[str, Any], path: str) -> Any:
    return client.get(f"/api/{path}", headers=auth_as(user))


def accepted_deal(client: TestClient) -> tuple[int, int]:
    """AIDA's request, taken by BEK and accepted. Returns (request_id, deal_id)."""
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    assert act(client, AIDA, deal_id, "accept").status_code == 200
    return request_id, deal_id


# --- Taking ---


def test_take_creates_pending_deal(client: TestClient, settings: Settings) -> None:
    sql(settings, "INSERT INTO users (telegram_id, username, completed_deals, created_at, "
        "updated_at) VALUES (2, 'bek', 4, ?, ?)", (PAST, PAST))  # fmt: skip
    request_id = create(client, AIDA, amount=150_000)["id"]
    response = take(client, BEK, request_id)

    assert response.status_code == 201
    deal = response.json()
    assert deal["status"] == "pending"
    assert deal["role"] == "responder"
    assert deal["request"]["id"] == request_id
    assert deal["request"]["my_deal_id"] == deal["id"]
    assert deal["request"]["my_deal_status"] == "pending"
    assert deal["other_completed_deals"] == 0
    # No usernames before the author accepts.
    assert "aida" not in response.text
    # The author sees the responder's record on their side of the deal.
    author_view = get(client, AIDA, f"deals/{deal['id']}").json()
    assert author_view["role"] == "author"
    assert author_view["other_completed_deals"] == 4


def test_request_detail_shows_viewers_own_deal(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    assert get(client, BEK, f"requests/{request_id}").json()["my_deal_id"] == deal_id
    for user in (AIDA, DANA):
        detail = get(client, user, f"requests/{request_id}").json()
        assert detail["my_deal_id"] is None
        assert detail["my_deal_status"] is None
    # Still on the board while pending, marked for the responder.
    assert [item["my_deal_status"] for item in get(client, BEK, "requests").json()] == ["pending"]


def test_take_requires_auth(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    assert client.post(f"/api/requests/{request_id}/take").status_code == 401


@pytest.mark.parametrize(
    ("setup", "status", "code"),
    [
        ("no_username", 403, "username_required"),
        ("banned", 403, "user_banned"),
        ("own", 403, "own_request"),
        ("missing", 404, "request_not_found"),
        ("author_banned", 404, "request_not_found"),
        ("closed", 409, "request_not_open"),
        ("expired", 409, "request_not_open"),
        ("twice", 409, "already_responded"),
    ],
)
def test_take_rejections(
    client: TestClient,
    settings: Settings,
    setup: str,
    status: int,
    code: str,
) -> None:
    request_id = create(client, AIDA)["id"]
    user = BEK
    match setup:
        case "no_username":
            user = NO_USERNAME
        case "banned":
            take(client, BEK, 999)  # creates BEK's user row
            sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (BEK["id"],))
        case "own":
            user = AIDA
        case "missing":
            request_id = 999
        case "author_banned":
            sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (AIDA["id"],))
        case "closed":
            sql(settings, "UPDATE requests SET status = 'closed'")
        case "expired":
            sql(settings, "UPDATE requests SET expires_at = ?", (PAST,))
        case "twice":
            taken(client, BEK, request_id)

    response = take(client, user, request_id)
    assert response.status_code == status
    assert response.json() == {"detail": code}


def test_declined_responder_cannot_take_again(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    act(client, AIDA, deal_id, "decline")
    assert take(client, BEK, request_id).json() == {"detail": "already_responded"}


# --- Accepting and declining ---


def set_details(client: TestClient, user: dict[str, Any], **details: str) -> None:
    assert client.patch("/api/me", json=details, headers=auth_as(user)).status_code == 200


def test_accept(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    other_id = taken(client, DANA, request_id)["id"]

    response = act(client, AIDA, deal_id, "accept")
    assert response.status_code == 200
    deal = response.json()
    assert deal["status"] == "accepted"
    assert deal["role"] == "author"
    assert deal["request"]["status"] == "in_progress"

    assert get(client, DANA, f"deals/{other_id}").json()["status"] == "declined"
    assert get(client, DANA, "requests").json() == []  # off the board


def test_only_the_author_can_accept_or_decline(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    for action in ("accept", "decline"):
        response = act(client, BEK, deal_id, action)
        assert response.status_code == 403
        assert response.json() == {"detail": "not_request_author"}
        response = act(client, DANA, deal_id, action)
        assert response.status_code == 404
        assert response.json() == {"detail": "deal_not_found"}
    assert get(client, BEK, f"deals/{deal_id}").json()["status"] == "pending"


def test_accept_twice_and_after_decline(client: TestClient) -> None:
    _, deal_id = accepted_deal(client)
    response = act(client, AIDA, deal_id, "accept")
    assert response.status_code == 409
    assert response.json() == {"detail": "deal_not_pending"}
    assert act(client, AIDA, deal_id, "decline").json() == {"detail": "deal_not_pending"}


def test_accept_on_expired_request(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    sql(settings, "UPDATE requests SET expires_at = ?", (PAST,))
    response = act(client, AIDA, deal_id, "accept")
    assert response.status_code == 409
    assert response.json() == {"detail": "request_not_open"}


def test_decline(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    response = act(client, AIDA, deal_id, "decline")
    assert response.status_code == 200
    assert response.json()["status"] == "declined"
    assert response.json()["request"]["status"] == "open"
    assert get(client, BEK, f"deals/{deal_id}").json()["status"] == "declined"


async def test_concurrent_accepts_pick_exactly_one(db: Database) -> None:
    author = await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    request = await requests.create_request(db, author, RequestCreate.model_validate(VALID))
    deal_ids = []
    for user_id, name in ((2, "bek"), (3, "dana")):
        responder = await upsert_user(
            db, TelegramUser(id=user_id, username=name), config_admin=False
        )
        deal_ids.append((await deals.take_request(db, responder, request.id, NullNotifier())).id)

    results = await asyncio.gather(
        *(deals.accept_deal(db, author.telegram_id, d, NullNotifier()) for d in deal_ids),
        return_exceptions=True,
    )
    assert sorted(type(r).__name__ for r in results) == ["ConflictError", "DealOut"]
    assert any(isinstance(r, ConflictError) and r.code == "deal_not_pending" for r in results)


# --- Contact ---


def test_contact_after_accept(client: TestClient) -> None:
    _, deal_id = accepted_deal(client)
    assert get(client, BEK, f"deals/{deal_id}/contact").json() == {
        "username": "aida",
        "url": "https://t.me/aida",
        "pay_currency": "KRW",
        "pay_bank": None,
        "pay_account": None,
    }
    assert get(client, AIDA, f"deals/{deal_id}/contact").json()["url"] == "https://t.me/bek"
    assert get(client, DANA, f"deals/{deal_id}/contact").status_code == 404


def test_contact_uses_current_username(client: TestClient) -> None:
    _, deal_id = accepted_deal(client)
    renamed = {**AIDA, "username": "aida_new"}
    get(client, renamed, "me")  # refreshes the cached username
    assert get(client, BEK, f"deals/{deal_id}/contact").json()["url"] == "https://t.me/aida_new"

    get(client, {**AIDA, "username": None}, "me")
    response = get(client, BEK, f"deals/{deal_id}/contact")
    assert response.status_code == 409
    assert response.json() == {"detail": "contact_no_username"}


def test_no_contact_before_accept(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    for user in (AIDA, BEK):
        response = get(client, user, f"deals/{deal_id}/contact")
        assert response.status_code == 409
        assert response.json() == {"detail": "contact_unavailable"}


@pytest.mark.parametrize(
    ("direction", "aida_pays", "bek_pays"), [("KZT_KRW", "KZT", "KRW"), ("KRW_KZT", "KRW", "KZT")]
)
def test_contact_shows_details_for_the_currency_the_viewer_pays(
    client: TestClient, direction: str, aida_pays: str, bek_pays: str
) -> None:
    for user, name in ((AIDA, "aida"), (BEK, "bek")):
        set_details(
            client,
            user,
            receive_kzt_bank=f"Kaspi, {name}",
            receive_kzt_account=f"{name} kzt",
            receive_krw_bank=f"Toss, {name}",
            receive_krw_account=f"{name} krw",
        )
    request_id = create(client, AIDA, direction=direction)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    act(client, AIDA, deal_id, "accept")

    bank = {"KZT": "Kaspi", "KRW": "Toss"}
    aida_view = get(client, AIDA, f"deals/{deal_id}/contact").json()
    assert aida_view["pay_currency"] == aida_pays
    assert aida_view["pay_bank"] == f"{bank[aida_pays]}, bek"
    assert aida_view["pay_account"] == f"bek {aida_pays.lower()}"
    bek_view = get(client, BEK, f"deals/{deal_id}/contact").json()
    assert bek_view["pay_currency"] == bek_pays
    assert bek_view["pay_bank"] == f"{bank[bek_pays]}, aida"
    assert bek_view["pay_account"] == f"aida {bek_pays.lower()}"


def test_receiving_details_hidden_before_accept(client: TestClient) -> None:
    set_details(client, AIDA, receive_krw_bank="aida toss", receive_krw_account="1000-22")
    request_id = create(client, AIDA)["id"]
    response = take(client, BEK, request_id)
    assert "aida toss" not in response.text
    assert "1000-22" not in response.text
    deal_id = response.json()["id"]
    assert "aida toss" not in get(client, BEK, f"deals/{deal_id}").text
    assert get(client, BEK, f"deals/{deal_id}/contact").status_code == 409


# --- Confirming payment received ---


def test_one_confirmation_keeps_deal_accepted(client: TestClient) -> None:
    _, deal_id = accepted_deal(client)
    response = act(client, BEK, deal_id, "confirm")
    assert response.status_code == 200
    deal = response.json()
    assert deal["status"] == "accepted"
    assert (deal["my_confirmed"], deal["other_confirmed"]) == (True, False)
    aida_view = get(client, AIDA, f"deals/{deal_id}").json()
    assert (aida_view["my_confirmed"], aida_view["other_confirmed"]) == (False, True)

    # Confirming again is a no-op.
    again = act(client, BEK, deal_id, "confirm").json()
    assert (again["status"], again["my_confirmed"]) == ("accepted", True)


def test_both_confirmations_complete_the_deal(client: TestClient) -> None:
    request_id, deal_id = accepted_deal(client)
    act(client, AIDA, deal_id, "confirm")
    response = act(client, BEK, deal_id, "confirm")
    assert response.status_code == 200
    deal = response.json()
    assert deal["status"] == "completed"
    assert deal["request"]["status"] == "completed"
    assert get(client, AIDA, "me").json()["completed_deals"] == 1
    assert get(client, BEK, "me").json()["completed_deals"] == 1
    assert get(client, DANA, f"requests/{request_id}").json()["author_completed_deals"] == 1
    # Done: no more confirming, and nothing is counted twice.
    assert act(client, AIDA, deal_id, "confirm").json() == {"detail": "deal_not_accepted"}
    assert get(client, AIDA, "me").json()["completed_deals"] == 1


def test_confirm_rejections(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    other_id = taken(client, DANA, request_id)["id"]
    response = act(client, BEK, deal_id, "confirm")  # still pending
    assert response.status_code == 409
    assert response.json() == {"detail": "deal_not_accepted"}
    act(client, AIDA, deal_id, "accept")
    response = act(client, DANA, deal_id, "confirm")
    assert response.status_code == 404
    assert response.json() == {"detail": "deal_not_found"}
    # DANA's own response was declined when BEK was accepted.
    assert act(client, DANA, other_id, "confirm").json() == {"detail": "deal_not_accepted"}


async def test_concurrent_final_confirmations_count_once(db: Database) -> None:
    author = await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    responder = await upsert_user(db, TelegramUser(id=2, username="bek"), config_admin=False)
    request = await requests.create_request(db, author, RequestCreate.model_validate(VALID))
    deal_id = (await deals.take_request(db, responder, request.id, NullNotifier())).id
    await deals.accept_deal(db, 1, deal_id, NullNotifier())
    results = await asyncio.gather(
        deals.confirm_received(db, 1, deal_id),
        deals.confirm_received(db, 2, deal_id),
        deals.confirm_received(db, 2, deal_id),
        return_exceptions=True,
    )
    # A double tap that lands after completion is rejected, not counted.
    assert all(
        not isinstance(r, Exception)
        or (isinstance(r, ConflictError) and r.code == "deal_not_accepted")
        for r in results
    )
    async with db.conn.execute("SELECT completed_deals FROM users ORDER BY telegram_id") as cur:
        assert [row[0] for row in await cur.fetchall()] == [1, 1]
    assert (await deals.get_deal(db, 1, deal_id)).status == "completed"


# --- No cancelling ---


@pytest.mark.parametrize("user", [AIDA, BEK])
def test_accepted_deal_cannot_be_cancelled(client: TestClient, user: dict[str, Any]) -> None:
    # Once contacts are exchanged, money may have moved: no side can back out.
    _, deal_id = accepted_deal(client)
    act(client, AIDA, deal_id, "confirm")
    assert act(client, user, deal_id, "cancel").status_code in (404, 405)
    deal = get(client, user, f"deals/{deal_id}").json()
    assert deal["status"] == "accepted"
    assert deal["request"]["status"] == "in_progress"
    assert get(client, DANA, "requests").json() == []


# --- Closing and expiring the request ---


def test_closing_a_request_declines_its_pending_deals(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    response = client.post(f"/api/requests/{request_id}/close", headers=auth_as(AIDA))
    assert response.status_code == 200

    deal = get(client, BEK, f"deals/{deal_id}").json()
    assert (deal["status"], deal["request"]["status"]) == ("declined", "closed")
    assert act(client, AIDA, deal_id, "accept").json() == {"detail": "deal_not_pending"}
    assert take(client, DANA, request_id).json() == {"detail": "request_not_open"}


def test_request_in_progress_cannot_be_closed(client: TestClient) -> None:
    request_id, deal_id = accepted_deal(client)
    response = client.post(f"/api/requests/{request_id}/close", headers=auth_as(AIDA))
    assert (response.status_code, response.json()) == (409, {"detail": "request_not_open"})
    assert get(client, BEK, f"deals/{deal_id}").json()["status"] == "accepted"


def test_pending_deal_on_expired_request_shows_as_declined(
    client: TestClient, settings: Settings
) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    sql(settings, "UPDATE requests SET expires_at = ?", (PAST,))
    for user in (AIDA, BEK):
        assert get(client, user, f"deals/{deal_id}").json()["status"] == "declined"
        assert [d["status"] for d in get(client, user, "my/deals").json()] == ["declined"]
    assert get(client, BEK, f"requests/{request_id}").json()["my_deal_status"] == "declined"


# --- Notifications ---


def test_take_notifies_the_author(client: TestClient, notifier: FakeNotifier) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    assert [(event, chat_id) for event, chat_id, _ in notifier.sent] == [("requested", AIDA["id"])]
    deal = notifier.sent[0][2]
    assert (deal.id, deal.role, deal.status) == (deal_id, "author", "pending")


def test_accept_notifies_the_responder(client: TestClient, notifier: FakeNotifier) -> None:
    _, deal_id = accepted_deal(client)
    event, chat_id, deal = notifier.sent[-1]
    assert (event, chat_id) == ("accepted", BEK["id"])
    assert (deal.id, deal.role, deal.status) == (deal_id, "responder", "accepted")


def test_other_actions_send_nothing(client: TestClient, notifier: FakeNotifier) -> None:
    request_id = create(client, AIDA)["id"]
    declined = taken(client, DANA, request_id)["id"]
    act(client, AIDA, declined, "decline")
    assert take(client, DANA, request_id).status_code == 409  # a failed take
    deal_id = taken(client, BEK, request_id)["id"]
    act(client, AIDA, deal_id, "accept")
    act(client, AIDA, deal_id, "confirm")
    act(client, BEK, deal_id, "confirm")
    assert [event for event, _, _ in notifier.sent] == ["requested", "requested", "accepted"]


# --- Reading ---


def test_my_deals_and_deal_detail(client: TestClient) -> None:
    first = create(client, AIDA)["id"]
    second = create(client, BEK)["id"]
    took = taken(client, BEK, first)["id"]
    gave = taken(client, AIDA, second)["id"]

    mine = get(client, BEK, "my/deals").json()
    assert [(d["id"], d["role"]) for d in mine] == [(gave, "author"), (took, "responder")]
    assert get(client, DANA, "my/deals").json() == []

    detail = get(client, AIDA, f"deals/{took}").json()
    assert detail["role"] == "author"
    assert detail["request"]["is_own"] is True
    response = get(client, DANA, f"deals/{took}")
    assert response.status_code == 404
    assert response.json() == {"detail": "deal_not_found"}


# --- Cleanup ---


async def test_delete_old_deals(db: Database) -> None:
    now = datetime.now(UTC)
    for telegram_id in (1, 2):
        await upsert_user(
            db, TelegramUser(id=telegram_id, username=f"u{telegram_id}"), config_admin=False
        )
    old, recent = utc_iso(now - timedelta(days=31)), utc_iso(now - timedelta(days=29))
    # (deal id, status, last change, reported, request status)
    rows = [
        (1, "completed", old, False, "completed"),
        (2, "declined", old, False, "expired"),
        (3, "cancelled", old, False, "closed"),
        (4, "completed", recent, False, "completed"),
        (5, "accepted", old, False, "in_progress"),
        (6, "completed", old, True, "completed"),
        (7, "declined", old, False, "open"),
    ]
    async with db.transaction() as conn:
        for deal_id, status, stamp, reported, request_status in rows:
            await conn.execute(
                "INSERT INTO requests (id, user_id, direction, amount, rate_type, rate_value, "
                "status, created_at, updated_at, expires_at) "
                "VALUES (?, 1, 'KZT_KRW', 100, 'market', 0, ?, ?, ?, ?)",
                (deal_id, request_status, stamp, stamp, stamp),
            )
            await conn.execute(
                "INSERT INTO deals (id, request_id, author_id, responder_id, status, "
                "created_at, updated_at) VALUES (?, ?, 1, 2, ?, ?, ?)",
                (deal_id, deal_id, status, stamp, stamp),
            )
            if reported:
                await conn.execute(
                    "INSERT INTO reports (reporter_id, reported_id, request_id, deal_id, reason, "
                    "created_at) VALUES (2, 1, ?, ?, '', ?)",
                    (deal_id, deal_id, stamp),
                )
        await conn.execute("UPDATE users SET completed_deals = 3")

    assert await deals.delete_old_deals(db) == 3
    assert await deals.delete_old_deals(db) == 0
    async with db.conn.execute("SELECT id FROM deals ORDER BY id") as cursor:
        assert [row["id"] for row in await cursor.fetchall()] == [4, 5, 6, 7]
    async with db.conn.execute("SELECT completed_deals FROM users") as cursor:
        assert [row["completed_deals"] for row in await cursor.fetchall()] == [3, 3]
