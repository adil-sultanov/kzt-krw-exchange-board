import asyncio
from typing import Any

from fastapi.testclient import TestClient

from app.db import Database
from app.models import RequestCreate, TelegramUser
from app.services import deals, requests
from app.services.errors import ConflictError
from app.services.notifications import NullNotifier
from app.services.users import upsert_user
from tests.conftest import OWNER_ID, FakeNotifier
from tests.helpers import AIDA, BEK, DANA, VALID, auth_as, create, fill_profile, post, with_profile

OWNER = {"id": OWNER_ID, "first_name": "Owner", "username": "owner"}
NURA = {"id": 5, "first_name": "Nura", "username": "nura"}


def counter(client: TestClient, user: dict[str, Any], request_id: int, amount: int) -> Any:
    fill_profile(client, user)
    return client.post(
        f"/api/requests/{request_id}/counter", json={"amount": amount}, headers=auth_as(user)
    )


def countered(client: TestClient, user: dict[str, Any], request_id: int, amount: int) -> int:
    response = counter(client, user, request_id, amount)
    assert response.status_code == 201, response.json()
    return response.json()["id"]


def taken(client: TestClient, user: dict[str, Any], request_id: int) -> int:
    fill_profile(client, user)
    response = client.post(f"/api/requests/{request_id}/take", headers=auth_as(user))
    assert response.status_code == 201, response.json()
    return response.json()["id"]


def act(client: TestClient, user: dict[str, Any], deal_id: int, action: str) -> Any:
    return client.post(f"/api/deals/{deal_id}/{action}", headers=auth_as(user))


def get(client: TestClient, user: dict[str, Any], path: str) -> Any:
    return client.get(f"/api/{path}", headers=auth_as(user)).json()


def with_counters(client: TestClient, amount: int = 100_000, minimum: int = 20_000) -> int:
    return create(client, AIDA, amount=amount, min_counter_amount=minimum)["id"]


# --- Posting and editing the minimum ---


def test_minimum_is_optional_and_shown(client: TestClient) -> None:
    assert create(client, AIDA)["min_counter_amount"] is None
    request = create(client, AIDA, min_counter_amount=30_000)
    assert request["min_counter_amount"] == 30_000
    assert get(client, BEK, f"requests/{request['id']}")["min_counter_amount"] == 30_000


def test_minimum_must_be_a_positive_amount_up_to_the_request(client: TestClient) -> None:
    for minimum in (0, -5, VALID["amount"] + 1, 1.5, "10"):
        response = post(client, AIDA, min_counter_amount=minimum)
        assert response.status_code == 422, minimum
    assert post(client, AIDA, min_counter_amount=VALID["amount"]).status_code == 201


def test_edit_the_minimum(client: TestClient) -> None:
    request_id = with_counters(client)
    headers = auth_as(AIDA)
    patch = lambda body: client.patch(f"/api/requests/{request_id}", json=body, headers=headers)  # noqa: E731

    assert patch({"min_counter_amount": 50_000}).json()["min_counter_amount"] == 50_000
    # Null turns counter offers off.
    assert patch({"min_counter_amount": None}).json()["min_counter_amount"] is None
    assert patch({"amount": 40_000, "min_counter_amount": 10_000}).status_code == 200
    # Never above the amount, whichever of the two changes.
    assert patch({"min_counter_amount": 40_001}).json() == {"detail": "counter_minimum_too_large"}
    assert patch({"amount": 9_999}).json() == {"detail": "counter_minimum_too_large"}
    # Not while someone's offer waits for an answer: they made it under the old terms.
    countered(client, BEK, request_id, 20_000)
    assert patch({"min_counter_amount": 30_000}).json() == {"detail": "request_has_responders"}


# --- Making a counter offer ---


def test_counter_offer_creates_a_pending_partial_deal(
    client: TestClient, notifier: FakeNotifier
) -> None:
    request_id = with_counters(client)
    response = counter(client, BEK, request_id, 30_000)

    assert response.status_code == 201
    deal = response.json()
    assert (deal["status"], deal["amount"], deal["partial"]) == ("pending", 30_000, True)
    # The request stays on the board as it was.
    assert deal["request"]["amount"] == 100_000
    assert deal["request"]["status"] == "open"
    assert get(client, AIDA, f"requests/{request_id}")["pending_count"] == 1
    assert [event for event, _, _ in notifier.sent] == ["requested"]
    assert notifier.sent[0][2].amount == 30_000


def test_counter_offer_rejections(client: TestClient) -> None:
    request_id = with_counters(client, minimum=20_000)
    off = create(client, AIDA)["id"]

    def code(user: dict[str, Any], rid: int, amount: int) -> Any:
        return counter(client, user, rid, amount).json()["detail"]

    assert code(BEK, off, 50_000) == "counter_offers_off"
    assert code(BEK, request_id, 19_999) == "counter_below_minimum"
    assert code(BEK, request_id, 100_001) == "counter_above_amount"
    assert code(AIDA, request_id, 50_000) == "own_request"
    assert counter(client, BEK, request_id, 0).status_code == 422
    countered(client, BEK, request_id, 20_000)
    # One response per person per request, whether a take or a counter offer.
    assert code(BEK, request_id, 30_000) == "already_responded"


def test_counter_offer_for_the_whole_amount_is_a_take(client: TestClient) -> None:
    request_id = with_counters(client)
    deal_id = countered(client, BEK, request_id, 100_000)
    assert get(client, BEK, f"deals/{deal_id}")["partial"] is False
    assert act(client, AIDA, deal_id, "accept").status_code == 200
    assert get(client, AIDA, f"requests/{request_id}")["status"] == "in_progress"


def test_responder_cancels_a_counter_offer(client: TestClient) -> None:
    request_id = with_counters(client)
    deal_id = countered(client, BEK, request_id, 30_000)
    deal = act(client, BEK, deal_id, "cancel").json()
    assert (deal["status"], deal["amount"], deal["partial"]) == ("cancelled", 30_000, True)
    request = get(client, AIDA, f"requests/{request_id}")
    assert (request["amount"], request["pending_count"]) == (100_000, 0)
    # They may send another, e.g. for a different amount.
    assert counter(client, BEK, request_id, 20_000).status_code == 201


def test_accepted_counter_offers_dont_count_toward_the_limit(client: TestClient) -> None:
    request_id = with_counters(client)
    act(client, BEK, countered(client, BEK, request_id, 20_000), "cancel")
    act(client, AIDA, countered(client, BEK, request_id, 20_000), "accept")
    assert get(client, BEK, f"requests/{request_id}")["offers_left"] == 2


# --- Accepting ---


def test_accepting_keeps_the_rest_on_the_board(client: TestClient) -> None:
    request_id = with_counters(client)
    deal_id = countered(client, BEK, request_id, 30_000)
    fits = countered(client, DANA, request_id, 70_000)
    too_big = countered(client, NURA, request_id, 70_001)
    whole = taken(client, OWNER, request_id)

    accepted = act(client, AIDA, deal_id, "accept").json()
    assert (accepted["status"], accepted["amount"], accepted["partial"]) == (
        "accepted",
        30_000,
        True,
    )
    request = get(client, AIDA, f"requests/{request_id}")
    assert (request["status"], request["amount"]) == ("open", 70_000)
    board = get(client, DANA, "requests?direction=KZT_KRW")
    assert [(r["id"], r["amount"]) for r in board] == [(request_id, 70_000)]
    # Offers that still fit stay pending (one for all that's left is no longer partial);
    # bigger ones, and taking the whole of what it was, are declined.
    assert get(client, DANA, f"deals/{fits}")["status"] == "pending"
    assert get(client, DANA, f"deals/{fits}")["partial"] is False
    assert get(client, NURA, f"deals/{too_big}")["status"] == "declined"
    assert get(client, OWNER, f"deals/{whole}")["status"] == "declined"
    # Contacts are swapped as for any accepted deal.
    assert get(client, BEK, f"deals/{deal_id}/contact")["username"] == "aida"


def test_accepting_what_is_left_takes_the_request_off_the_board(client: TestClient) -> None:
    request_id = with_counters(client)
    first = countered(client, BEK, request_id, 40_000)
    rest = countered(client, DANA, request_id, 60_000)
    smaller = countered(client, NURA, request_id, 20_000)
    assert act(client, AIDA, first, "accept").status_code == 200
    assert act(client, AIDA, rest, "accept").status_code == 200

    assert get(client, AIDA, f"requests/{request_id}")["status"] == "in_progress"
    assert get(client, NURA, f"deals/{smaller}")["status"] == "declined"
    assert get(client, DANA, "requests?direction=KZT_KRW") == []


def test_completing_a_counter_offer_leaves_the_request_open(client: TestClient) -> None:
    request_id = with_counters(client)
    deal_id = countered(client, BEK, request_id, 30_000)
    act(client, AIDA, deal_id, "accept")
    act(client, AIDA, deal_id, "confirm")
    assert act(client, BEK, deal_id, "confirm").json()["status"] == "completed"

    assert get(client, AIDA, f"requests/{request_id}")["status"] == "open"
    assert get(client, AIDA, "me")["completed_deals"] == 1
    assert get(client, BEK, "me")["completed_deals"] == 1
    # The rest can still be taken, and completes the request.
    rest = taken(client, DANA, request_id)
    act(client, AIDA, rest, "accept")
    act(client, AIDA, rest, "confirm")
    act(client, DANA, rest, "confirm")
    assert get(client, AIDA, f"requests/{request_id}")["status"] == "completed"
    assert get(client, AIDA, "me")["completed_deals"] == 2


def test_counter_offer_can_finish_after_the_request(client: TestClient) -> None:
    request_id = with_counters(client)
    part = countered(client, BEK, request_id, 30_000)
    act(client, AIDA, part, "accept")
    rest = taken(client, DANA, request_id)
    act(client, AIDA, rest, "accept")
    for user in (AIDA, DANA):
        act(client, user, rest, "confirm")
    assert get(client, AIDA, f"requests/{request_id}")["status"] == "completed"
    for user in (AIDA, BEK):
        act(client, user, part, "confirm")
    assert get(client, BEK, f"deals/{part}")["status"] == "completed"


def test_counter_offers_show_the_whole_request(client: TestClient) -> None:
    request_id = with_counters(client)
    part = countered(client, BEK, request_id, 30_000)
    other = countered(client, DANA, request_id, 20_000)
    # While pending: part of what's on the board now.
    assert get(client, AIDA, f"deals/{part}")["request_amount"] == 100_000
    act(client, AIDA, other, "accept")
    assert get(client, AIDA, f"deals/{part}")["request_amount"] == 80_000
    # Once accepted: what it was then, though the request has moved on.
    act(client, AIDA, part, "accept")
    deal = get(client, BEK, f"deals/{part}")
    assert (deal["amount"], deal["request_amount"], deal["request"]["amount"]) == (
        30_000,
        80_000,
        50_000,
    )
    # A whole take is the whole request.
    rest = taken(client, NURA, request_id)
    assert get(client, NURA, f"deals/{rest}")["request_amount"] == 50_000


def test_counter_offers_on_an_amount_fixed_in_what_the_author_gives(
    client: TestClient,
) -> None:
    request_id = create(
        client, AIDA, amount=100_000, amount_currency="KZT", min_counter_amount=20_000
    )["id"]
    part = countered(client, BEK, request_id, 30_000)
    assert counter(client, DANA, request_id, 10_000).json() == {"detail": "counter_below_minimum"}
    deal = get(client, BEK, f"deals/{part}")
    assert (deal["amount"], deal["amount_currency"]) == (30_000, "KZT")
    act(client, AIDA, part, "accept")
    request = get(client, AIDA, f"requests/{request_id}")
    assert (request["amount"], request["amount_currency"]) == (70_000, "KZT")

    # Fixing the rest in KRW instead leaves the accepted counter offer in KZT.
    body = {"amount": 200_000, "amount_currency": "KRW", "min_counter_amount": None}
    response = client.patch(f"/api/requests/{request_id}", json=body, headers=auth_as(AIDA))
    assert response.json()["amount_currency"] == "KRW"
    deal = get(client, BEK, f"deals/{part}")
    assert (deal["amount"], deal["amount_currency"], deal["request_amount"]) == (
        30_000,
        "KZT",
        100_000,
    )
    rest = taken(client, DANA, request_id)
    deal = get(client, DANA, f"deals/{rest}")
    assert (deal["amount"], deal["amount_currency"]) == (200_000, "KRW")


def test_responding_again_after_a_counter_offer(client: TestClient) -> None:
    request_id = with_counters(client)
    part = countered(client, BEK, request_id, 30_000)
    act(client, AIDA, part, "accept")
    for user in (AIDA, BEK):
        act(client, user, part, "confirm")

    # The rest is a request like any other to them: no status of theirs on it.
    [listed] = get(client, BEK, "requests?direction=KZT_KRW")
    assert (listed["amount"], listed["my_deal_id"], listed["my_deal_status"]) == (
        70_000,
        None,
        None,
    )
    # The counter offer stays in their history.
    [history] = get(client, BEK, "my/deals")
    assert (history["id"], history["status"], history["amount"]) == (part, "completed", 30_000)

    again = countered(client, BEK, request_id, 40_000)
    assert get(client, BEK, f"requests/{request_id}")["my_deal_id"] == again
    # Still one response at a time.
    assert counter(client, BEK, request_id, 20_000).json() == {"detail": "already_responded"}
    act(client, AIDA, again, "decline")
    # And none after being declined.
    assert counter(client, BEK, request_id, 20_000).json() == {"detail": "already_responded"}
    assert [d["id"] for d in get(client, BEK, "my/deals")] == [again, part]


def test_cancelling_the_rest_keeps_accepted_counter_offers(client: TestClient) -> None:
    request_id = with_counters(client)
    part = countered(client, BEK, request_id, 30_000)
    waiting = countered(client, DANA, request_id, 20_000)
    act(client, AIDA, part, "accept")
    closed = client.post(f"/api/requests/{request_id}/close", headers=auth_as(AIDA))
    assert closed.json()["status"] == "closed"
    assert get(client, DANA, f"deals/{waiting}")["status"] == "declined"
    assert get(client, BEK, f"deals/{part}")["status"] == "accepted"
    act(client, AIDA, part, "confirm")
    assert act(client, BEK, part, "confirm").json()["status"] == "completed"


def test_deleting_a_counter_offer_keeps_its_request(client: TestClient) -> None:
    request_id = with_counters(client)
    part = countered(client, BEK, request_id, 30_000)
    act(client, AIDA, part, "accept")
    assert get(client, OWNER, "admin/deals?active=true")[0]["request"]["amount"] == 30_000
    response = client.delete(f"/api/admin/deals/{part}", headers=auth_as(OWNER))
    assert response.status_code == 204
    request = get(client, AIDA, f"requests/{request_id}")
    assert (request["status"], request["amount"]) == ("open", 70_000)


async def test_concurrent_accepts_never_overdraw(db: Database) -> None:
    author = with_profile(
        await upsert_user(db, TelegramUser(id=1, username="aida"), config_admin=False)
    )
    request = await requests.create_request(
        db,
        author,
        RequestCreate.model_validate({**VALID, "min_counter_amount": 10_000}),
        NullNotifier(),
    )
    deal_ids = []
    for user_id, name in ((2, "bek"), (3, "dana")):
        responder = with_profile(
            await upsert_user(db, TelegramUser(id=user_id, username=name), config_admin=False)
        )
        offer = await deals.take_request(db, responder, request.id, NullNotifier(), 60_000)
        deal_ids.append(offer.id)

    results = await asyncio.gather(
        *(deals.accept_deal(db, author.telegram_id, d, NullNotifier()) for d in deal_ids),
        return_exceptions=True,
    )
    assert sorted(type(r).__name__ for r in results) == ["ConflictError", "DealOut"]
    assert any(isinstance(r, ConflictError) and r.code == "deal_not_pending" for r in results)
    left = await requests.get_request(db, author.telegram_id, request.id)
    assert (left.status, left.amount) == ("open", 40_000)
