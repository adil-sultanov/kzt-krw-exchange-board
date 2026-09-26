from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from tests.conftest import ADMIN_ID, OWNER_ID
from tests.helpers import AIDA, BEK, DANA, auth_as, create
from tests.test_deals import accepted_deal, act, get, taken
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

    assert get(client, AIDA, f"requests/{open_id}").json()["status"] == "closed"
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


# --- Owner: admins and deals ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "admins"),
        ("POST", "admins"),
        ("DELETE", "admins/1"),
        ("GET", "deals"),
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


def owner_deals(client: TestClient, active: bool = True) -> list[dict[str, Any]]:
    response = client.get("/api/admin/deals", params={"active": active}, headers=auth_as(OWNER))
    assert response.status_code == 200
    return response.json()


def delete_deal(client: TestClient, deal_id: int) -> Any:
    return client.delete(f"/api/admin/deals/{deal_id}", headers=auth_as(OWNER))


def test_owner_lists_deals(client: TestClient) -> None:
    request_id, accepted_id = accepted_deal(client)
    pending_id = taken(client, AIDA, create(client, DANA)["id"])["id"]
    client.patch("/api/me", json={"receive_kzt_account": "SECRET-123"}, headers=auth_as(AIDA))

    listed = owner_deals(client)
    # Least recently changed first.
    assert [deal["id"] for deal in listed] == [accepted_id, pending_id]
    assert "SECRET-123" not in str(listed)
    accepted = listed[0]
    assert accepted["status"] == "accepted"
    assert accepted["request"]["id"] == request_id
    assert accepted["author"]["username"] == "aida"
    assert accepted["responder"]["username"] == "bek"
    assert owner_deals(client, active=False) == []


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
    assert [deal["id"] for deal in owner_deals(client, active=False)] == [deal_id]
    assert delete_deal(client, deal_id).status_code == 204
    # Completed-deal counts and the request's status don't change.
    assert get(client, AIDA, "me").json()["completed_deals"] == 1
    assert get(client, AIDA, f"requests/{request_id}").json()["status"] == "completed"
