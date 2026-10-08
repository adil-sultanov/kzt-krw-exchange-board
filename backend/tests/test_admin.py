from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from tests.conftest import ADMIN_ID, OWNER_ID
from tests.helpers import AIDA, BEK, DANA, auth_as, create, fill_profile, sql
from tests.test_deals import PAST, accepted_deal, act, get, taken
from tests.test_reports import report_deal, report_request

ADMIN = {"id": ADMIN_ID, "first_name": "Admin", "username": "admin"}
OWNER = {"id": OWNER_ID, "first_name": "Owner", "username": "owner"}


def admin_post(client: TestClient, user: dict[str, Any], path: str) -> Any:
    return client.post(f"/api/admin/{path}", headers=auth_as(user))


def open_reports(client: TestClient, user: dict[str, Any] = ADMIN, **params: Any) -> Any:
    return client.get("/api/admin/reports", params=params, headers=auth_as(user))


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "reports"),
        ("POST", "reports/1/resolve"),
        ("POST", "users/1/ban"),
        ("POST", "users/1/unban"),
        ("GET", "requests"),
        ("POST", "requests/1/remove"),
        ("GET", "requests/cancelled"),
        ("GET", "deals"),
        ("GET", "users"),
        ("GET", "users/1"),
    ],
)
def test_admin_routes_need_an_admin(client: TestClient, method: str, path: str) -> None:
    create(client, AIDA)
    response = client.request(method, f"/api/admin/{path}", headers=auth_as(BEK))
    assert (response.status_code, response.json()) == (403, {"detail": "admin_only"})


def test_list_and_resolve_reports(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    report_request(client, BEK, request_id, category="spam", note="Fake")
    _, deal_id = accepted_deal(client)
    report_deal(client, BEK, deal_id, category="no_payment")
    # Receiving details never reach admins.
    client.patch("/api/me", json={"receive_kzt_account": "SECRET-123"}, headers=auth_as(AIDA))

    response = open_reports(client)
    assert response.status_code == 200
    assert "SECRET-123" not in response.text
    listed = response.json()
    assert [item["category"] for item in listed] == ["no_payment", "spam"]
    deal_report, request_report = listed
    assert deal_report["deal"] == {
        "id": deal_id,
        "status": "accepted",
        "partial": False,
        "author_confirmed": False,
        "responder_confirmed": False,
    }
    assert request_report["deal"] is None
    assert request_report["note"] == "Fake"
    assert request_report["request"]["id"] == request_id
    assert request_report["request"]["author_id"] == AIDA["id"]
    assert request_report["reporter"]["username"] == "bek"
    assert request_report["reported"]["username"] == "aida"
    assert request_report["reported"]["open_reports"] == 2

    # The owner is an admin too.
    assert len(open_reports(client, OWNER).json()) == 2

    report_id = request_report["id"]
    assert admin_post(client, ADMIN, f"reports/{report_id}/resolve").status_code == 204
    again = admin_post(client, OWNER, f"reports/{report_id}/resolve")
    assert (again.status_code, again.json()) == (409, {"detail": "report_already_resolved"})
    assert admin_post(client, ADMIN, "reports/999/resolve").json() == {"detail": "report_not_found"}
    assert [item["id"] for item in open_reports(client).json()] == [deal_report["id"]]
    resolved = open_reports(client, resolved="true").json()
    assert [item["id"] for item in resolved] == [report_id]
    assert resolved[0]["resolved"] is True
    assert resolved[0]["reported"]["open_reports"] == 1


def test_ban_closes_requests_and_declines_pending_deals(
    client: TestClient, settings: Settings
) -> None:
    open_id = create(client, AIDA)["id"]
    pending_on_hers = taken(client, BEK, open_id)["id"]
    dana_request = create(client, DANA)["id"]
    pending_as_responder = taken(client, AIDA, dana_request)["id"]
    in_progress_id, accepted_id = accepted_deal(client)  # AIDA's request, BEK accepted

    response = admin_post(client, ADMIN, f"users/{AIDA['id']}/ban")
    assert response.status_code == 200
    assert response.json()["is_banned"] is True

    closed = get(client, AIDA, f"requests/{open_id}").json()
    assert (closed["status"], closed["removed_by_admin"]) == ("closed", True)
    assert get(client, BEK, f"deals/{pending_on_hers}").json()["status"] == "declined"
    assert get(client, DANA, f"deals/{pending_as_responder}").json()["status"] == "declined"
    # Accepted deals carry on; DANA's own request is untouched.
    assert get(client, BEK, f"deals/{accepted_id}").json()["status"] == "accepted"
    assert get(client, AIDA, f"requests/{in_progress_id}").json()["status"] == "in_progress"
    assert get(client, DANA, f"requests/{dana_request}").json()["status"] == "open"
    # Banned users can't post.
    blocked = client.post(
        "/api/requests",
        json={"direction": "KZT_KRW", "amount": 1000, "duration_days": 1},
        headers=auth_as(AIDA),
    )
    assert blocked.json() == {"detail": "user_banned"}

    unbanned = admin_post(client, ADMIN, f"users/{AIDA['id']}/unban")
    assert unbanned.json()["is_banned"] is False
    # Requests closed by the ban stay closed.
    assert get(client, AIDA, f"requests/{open_id}").json()["status"] == "closed"


def test_cannot_ban_admins_or_unknown_users(client: TestClient) -> None:
    for target in (OWNER, ADMIN):
        get(client, target, "me")
        response = admin_post(client, ADMIN, f"users/{target['id']}/ban")
        assert (response.status_code, response.json()) == (403, {"detail": "cannot_ban_admin"})
    assert admin_post(client, ADMIN, "users/12345/ban").json() == {"detail": "user_not_found"}
    assert admin_post(client, ADMIN, "users/12345/unban").json() == {"detail": "user_not_found"}


# --- Board requests ---


def board_requests(client: TestClient, user: dict[str, Any] = ADMIN) -> list[dict[str, Any]]:
    response = client.get("/api/admin/requests", headers=auth_as(user))
    assert response.status_code == 200, response.json()
    return response.json()


def test_admins_list_every_request_on_the_board(client: TestClient) -> None:
    aida_request = create(client, AIDA)["id"]
    dana_request = create(client, DANA, direction="KRW_KZT", amount=5_000_000)["id"]
    taken(client, BEK, aida_request)
    taken(client, DANA, aida_request)
    accepted_deal(client)  # in progress: off the board
    closed = create(client, DANA)["id"]
    client.post(f"/api/requests/{closed}/close", headers=auth_as(DANA))
    report_request(client, BEK, dana_request, category="spam")
    client.patch("/api/me", json={"receive_kzt_account": "SECRET-123"}, headers=auth_as(AIDA))

    listed = board_requests(client)
    assert "SECRET-123" not in str(listed)
    # Newest first, both directions, the admin's own included.
    assert [item["id"] for item in listed] == [dana_request, aida_request]
    dana_item, aida_item = listed
    assert (dana_item["direction"], dana_item["amount"]) == ("KRW_KZT", 5_000_000)
    assert dana_item["author"]["username"] == "dana"
    assert dana_item["author"]["profile"]["university"] == "UNIST"
    assert (dana_item["responders"], dana_item["open_reports"]) == ([], 1)
    # Pending responders, first taker first.
    assert [user["username"] for user in aida_item["responders"]] == ["bek", "dana"]
    assert aida_item["open_reports"] == 0
    # The owner is an admin too.
    assert len(board_requests(client, OWNER)) == 2


def test_admins_remove_a_request_from_the_board(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    deal_id = taken(client, BEK, request_id)["id"]
    report_request(client, DANA, request_id, category="spam")

    assert admin_post(client, ADMIN, f"requests/{request_id}/remove").status_code == 204
    [report] = open_reports(client).json()
    assert (report["request"]["status"], report["request"]["removed_by_admin"]) == ("closed", True)
    assert board_requests(client) == []
    assert get(client, DANA, "requests").json() == []
    # Both sides see an admin took it off, not that the author cancelled it.
    own = get(client, AIDA, f"requests/{request_id}").json()
    assert (own["status"], own["removed_by_admin"]) == ("closed", True)
    deal = get(client, BEK, f"deals/{deal_id}").json()
    assert (deal["status"], deal["request"]["removed_by_admin"]) == ("declined", True)

    again = admin_post(client, OWNER, f"requests/{request_id}/remove")
    assert (again.status_code, again.json()) == (409, {"detail": "request_not_open"})
    missing = admin_post(client, ADMIN, "requests/999/remove")
    assert (missing.status_code, missing.json()) == (404, {"detail": "request_not_found"})
    # An accepted deal's request can't be removed this way (the owner deletes the deal).
    in_progress_id, _ = accepted_deal(client)
    response = admin_post(client, ADMIN, f"requests/{in_progress_id}/remove")
    assert response.json() == {"detail": "request_not_open"}


def test_authors_cancel_is_not_marked_as_an_admins(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    client.post(f"/api/requests/{request_id}/close", headers=auth_as(AIDA))
    assert get(client, AIDA, f"requests/{request_id}").json()["removed_by_admin"] is False


# --- Owner: admins and deals ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "admins"),
        ("POST", "admins"),
        ("DELETE", "admins/1"),
        ("DELETE", "deals/1"),
    ],
)
def test_owner_routes_need_the_owner(client: TestClient, method: str, path: str) -> None:
    for user in (BEK, ADMIN):
        response = client.request(
            method, f"/api/admin/{path}", json={"username": "aida"}, headers=auth_as(user)
        )
        assert (response.status_code, response.json()) == (403, {"detail": "owner_only"})


def add_admin(client: TestClient, username: str) -> Any:
    return client.post("/api/admin/admins", json={"username": username}, headers=auth_as(OWNER))


def admins(client: TestClient) -> list[tuple[int, str]]:
    listed = client.get("/api/admin/admins", headers=auth_as(OWNER)).json()
    return [(item["telegram_id"], item["source"]) for item in listed]


def test_owner_adds_and_removes_admins(client: TestClient) -> None:
    get(client, ADMIN, "me")
    get(client, AIDA, "me")
    assert admins(client) == [(OWNER_ID, "owner"), (ADMIN_ID, "config")]

    # By username, any case, with or without the @.
    added = add_admin(client, " @AIDA ")
    assert added.status_code == 201
    assert added.json()["telegram_id"] == AIDA["id"]
    assert added.json()["source"] == "granted"
    assert "receive_" not in added.text
    assert admins(client)[-1] == (AIDA["id"], "granted")
    # The new admin can review reports, and stays an admin on later requests.
    assert get(client, AIDA, "me").json()["is_admin"] is True
    assert open_reports(client, AIDA).status_code == 200
    assert admin_post(client, ADMIN, f"users/{AIDA['id']}/ban").json() == {
        "detail": "cannot_ban_admin"
    }

    for username in ("aida", "admin", "owner"):
        assert add_admin(client, username).json() == {"detail": "already_admin"}
    assert add_admin(client, "nobody_here").json() == {"detail": "username_not_found"}
    assert add_admin(client, "no spaces!").json() == {"detail": "invalid_input"}

    removed = client.delete(f"/api/admin/admins/{AIDA['id']}", headers=auth_as(OWNER))
    assert removed.status_code == 204
    assert get(client, AIDA, "me").json()["is_admin"] is False
    assert open_reports(client, AIDA).json() == {"detail": "admin_only"}
    again = client.delete(f"/api/admin/admins/{AIDA['id']}", headers=auth_as(OWNER))
    assert (again.status_code, again.json()) == (404, {"detail": "admin_not_found"})
    for user_id in (ADMIN_ID, OWNER_ID):
        response = client.delete(f"/api/admin/admins/{user_id}", headers=auth_as(OWNER))
        assert response.json() == {"detail": "admin_in_config"}


def test_banned_users_cannot_become_admins(client: TestClient) -> None:
    get(client, AIDA, "me")
    admin_post(client, ADMIN, f"users/{AIDA['id']}/ban")
    assert add_admin(client, "aida").json() == {"detail": "cannot_promote_banned"}


def all_deals(
    client: TestClient, state: str = "active", user: dict[str, Any] = OWNER
) -> list[dict[str, Any]]:
    response = client.get("/api/admin/deals", params={"state": state}, headers=auth_as(user))
    assert response.status_code == 200
    return response.json()


def delete_deal(client: TestClient, deal_id: int) -> Any:
    return client.delete(f"/api/admin/deals/{deal_id}", headers=auth_as(OWNER))


def test_admins_list_deals(client: TestClient, settings: Settings) -> None:
    sql(settings, "INSERT INTO reference_rate VALUES (1, 2.7, 'test', '2026-01-01T00:00:00+00:00')")
    request_id, accepted_id = accepted_deal(client)
    pending_id = taken(client, AIDA, create(client, DANA)["id"])["id"]
    client.patch("/api/me", json={"receive_kzt_account": "SECRET-123"}, headers=auth_as(AIDA))

    listed = all_deals(client)
    # Least recently changed first.
    assert [deal["id"] for deal in listed] == [accepted_id, pending_id]
    assert "SECRET-123" not in str(listed)
    accepted = listed[0]
    assert accepted["status"] == "accepted"
    assert accepted["request"]["id"] == request_id
    assert accepted["author"]["username"] == "aida"
    assert accepted["responder"]["username"] == "bek"
    # Accepting locked the rate; a pending deal follows the request's rate now.
    assert accepted["rate_locked"] and accepted["rate"] == 2.7
    assert accepted["accepted_at"] is not None
    pending = listed[1]
    assert not pending["rate_locked"] and pending["rate"] == 2.7
    assert all_deals(client, "completed") == all_deals(client, "cancelled") == []
    # Any admin sees the same list; only the owner deletes deals.
    assert all_deals(client, user=ADMIN) == listed

    client.post(f"/api/deals/{pending_id}/cancel", headers=auth_as(AIDA))
    assert [(d["id"], d["status"]) for d in all_deals(client, "cancelled")] == [
        (pending_id, "cancelled")
    ]
    assert all_deals(client, "completed") == []


def test_owner_deletes_an_accepted_deal(client: TestClient, settings: Settings) -> None:
    request_id, deal_id = accepted_deal(client)
    report_deal(client, BEK, deal_id, category="disappeared")

    assert delete_deal(client, deal_id).status_code == 204
    assert get(client, BEK, f"deals/{deal_id}").json() == {"detail": "deal_not_found"}
    assert get(client, AIDA, "my/deals").json() == []
    # Its request can't be taken again, so it closes. The report stays, on the request.
    assert get(client, AIDA, f"requests/{request_id}").json()["status"] == "closed"
    [report] = open_reports(client).json()
    assert report["deal"] is None
    assert report["request"]["id"] == request_id
    assert delete_deal(client, deal_id).json() == {"detail": "deal_not_found"}


def test_owner_deletes_pending_and_completed_deals(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    pending_id = taken(client, BEK, request_id)["id"]
    assert delete_deal(client, pending_id).status_code == 204
    # The request stays on the board, and the responder may take it again.
    assert get(client, AIDA, f"requests/{request_id}").json()["status"] == "open"
    deal_id = taken(client, BEK, request_id)["id"]

    act(client, AIDA, deal_id, "accept")
    act(client, AIDA, deal_id, "confirm")
    act(client, BEK, deal_id, "confirm")
    assert [deal["id"] for deal in all_deals(client, "completed")] == [deal_id]
    assert all_deals(client, "cancelled") == []
    assert delete_deal(client, deal_id).status_code == 204
    # Completed-deal counts and the request's status don't change.
    assert get(client, AIDA, "me").json()["completed_deals"] == 1
    assert get(client, AIDA, f"requests/{request_id}").json()["status"] == "completed"


def cancelled(client: TestClient, user: dict[str, Any] = ADMIN) -> list[dict[str, Any]]:
    response = client.get("/api/admin/requests/cancelled", headers=auth_as(user))
    assert response.status_code == 200, response.json()
    return response.json()


def test_admins_list_cancelled_requests(client: TestClient, settings: Settings) -> None:
    # Cancelled by its author, with someone waiting.
    by_author = create(client, AIDA)["id"]
    taken(client, BEK, by_author)
    client.post(f"/api/requests/{by_author}/close", headers=auth_as(AIDA))
    # Removed by an admin.
    by_admin = create(client, BEK)["id"]
    taken(client, DANA, by_admin)
    admin_post(client, ADMIN, f"requests/{by_admin}/remove")
    # Closed by a ban.
    by_ban = create(client, DANA)["id"]
    # Its accepted deal deleted by the owner.
    by_delete, deal_id = accepted_deal(client)
    delete_deal(client, deal_id)
    admin_post(client, OWNER, f"users/{DANA['id']}/ban")
    # Expired requests aren't cancelled ones.
    sql(
        settings,
        "UPDATE requests SET status = 'expired' WHERE id = ?",
        (create(client, BEK)["id"],),
    )

    # Closed earlier than the rest (closing times are stored to the second).
    sql(settings, "UPDATE requests SET updated_at = ? WHERE id = ?", (PAST, by_author))

    listed = cancelled(client)
    assert cancelled(client, OWNER) == listed
    summary = {(item["id"], item["close_reason"], item["closed_by"]["username"]) for item in listed}
    assert summary == {
        (by_ban, "ban", "owner"),
        (by_delete, "deal_deleted", "owner"),
        (by_admin, "admin", "admin"),
        (by_author, "author", "aida"),
    }
    # Most recently closed first.
    assert listed[-1]["id"] == by_author
    items = {item["id"]: item for item in listed}
    assert items[by_author]["author"]["username"] == "aida"
    assert [user["username"] for user in items[by_author]["takers"]] == ["bek"]
    assert [user["username"] for user in items[by_admin]["takers"]] == ["dana"]
    # The deleted deal is gone, so its taker isn't listed.
    assert items[by_delete]["takers"] == []
    assert items[by_ban]["closed_at"] >= items[by_ban]["created_at"]

    # Everything but the author's own cancel reads as an admin's doing to the people involved.
    removed = {
        request_id: get(client, AIDA if request_id != by_admin else BEK, f"requests/{request_id}")
        for request_id in (by_author, by_admin, by_delete)
    }
    assert {key: value.json()["removed_by_admin"] for key, value in removed.items()} == {
        by_author: False,
        by_admin: True,
        by_delete: True,
    }


# --- Users ---


def users(client: TestClient, user: dict[str, Any] = ADMIN, **params: Any) -> dict[str, Any]:
    response = client.get("/api/admin/users", params=params, headers=auth_as(user))
    assert response.status_code == 200, response.json()
    return response.json()


def user_page(client: TestClient, user_id: int, user: dict[str, Any] = ADMIN) -> Any:
    return client.get(f"/api/admin/users/{user_id}", headers=auth_as(user))


def test_admins_list_and_search_users(client: TestClient, settings: Settings) -> None:
    create(client, AIDA)
    request_id = create(client, BEK)["id"]
    fill_profile(client, DANA)
    report_request(client, AIDA, request_id, category="spam")
    admin_post(client, ADMIN, f"users/{DANA['id']}/ban")
    # Seen long ago: listed last.
    sql(settings, "UPDATE users SET last_seen_at = ? WHERE telegram_id = ?", (PAST, AIDA["id"]))

    listed = users(client)
    ids = [user["telegram_id"] for user in listed["users"]]
    assert set(ids) == {AIDA["id"], BEK["id"], DANA["id"], ADMIN_ID}
    assert ids[-1] == AIDA["id"]
    assert (listed["total"], listed["seen_this_week"], listed["reported"], listed["banned"]) == (
        4,
        3,
        1,
        1,
    )
    assert listed["users"][0]["last_seen_at"] is not None

    def found(**params: Any) -> list[int]:
        return [user["telegram_id"] for user in users(client, **params)["users"]]

    assert found(show="reported") == [BEK["id"]]
    assert found(show="banned") == [DANA["id"]]
    # By username (with or without the @, any case), name, university or the whole ID.
    assert found(q="@AID") == [AIDA["id"]]
    assert found(q="testova", show="banned") == [DANA["id"]]
    assert set(found(q="unist")) == {AIDA["id"], BEK["id"], DANA["id"]}
    assert found(q=str(BEK["id"])) == [BEK["id"]]
    assert found(q="nobody") == []


def test_user_page(client: TestClient, settings: Settings) -> None:
    request_id, deal_id = accepted_deal(client)
    on_board = create(client, AIDA)["id"]
    client.patch(
        "/api/me",
        json={"receive_kzt_bank": "Kaspi SECRET", "receive_kzt_account": "SECRET-123"},
        headers=auth_as(AIDA),
    )
    client.patch("/api/me/alerts", json={"buy_krw": True}, headers=auth_as(AIDA))
    report_deal(client, BEK, deal_id, category="disappeared")

    response = user_page(client, AIDA["id"])
    assert response.status_code == 200, response.json()
    page = response.json()
    assert "SECRET" not in str(page)
    assert (page["has_receive_kzt"], page["has_receive_krw"]) == (True, False)
    assert (page["alerts_buy_krw"], page["alerts_buy_kzt"]) == (True, False)
    assert page["profile"]["university"] == "UNIST"
    assert (page["open_requests"], page["active_deals"]) == (1, 1)
    assert (page["open_reports"], page["reports_total"], page["reports_sent"]) == (1, 1, 0)
    assert [r["id"] for r in page["requests"]] == [on_board, request_id]
    assert [d["id"] for d in page["deals"]] == [deal_id]
    assert page["deals"][0]["responder"]["username"] == "bek"
    assert user_page(client, BEK["id"]).json()["reports_sent"] == 1
    assert user_page(client, 12345).json() == {"detail": "user_not_found"}
