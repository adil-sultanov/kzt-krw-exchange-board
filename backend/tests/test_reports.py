import sqlite3
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.services.reports import MAX_REPORTS_PER_DAY
from tests.helpers import AIDA, BEK, DANA, auth_as, create, sql
from tests.test_deals import accepted_deal, act, get, taken

REPORT = {"category": "scam", "note": "  Asked me to pay first  "}


def report_request(client: TestClient, user: dict[str, Any], request_id: int, **body: Any) -> Any:
    return client.post(
        f"/api/requests/{request_id}/report", json=body or REPORT, headers=auth_as(user)
    )


def report_deal(client: TestClient, user: dict[str, Any], deal_id: int, **body: Any) -> Any:
    return client.post(f"/api/deals/{deal_id}/report", json=body or REPORT, headers=auth_as(user))


def reports(settings: Settings) -> list[tuple[Any, ...]]:
    with sqlite3.connect(settings.db_path) as conn:
        return conn.execute(
            "SELECT reporter_id, reported_id, request_id, deal_id, category, reason, resolved "
            "FROM reports ORDER BY id"
        ).fetchall()


def test_report_request(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    response = report_request(client, BEK, request_id)
    assert response.status_code == 201
    assert response.json()["request_id"] == request_id
    assert response.json()["deal_id"] is None
    assert reports(settings) == [
        (BEK["id"], AIDA["id"], request_id, None, "scam", "Asked me to pay first", 0)
    ]


def test_report_request_rejections(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    assert report_request(client, AIDA, request_id).json() == {"detail": "own_request"}
    assert report_request(client, BEK, 999).json() == {"detail": "request_not_found"}
    assert report_request(client, BEK, request_id, category="nope").status_code == 422
    assert (
        report_request(client, BEK, request_id, category="spam", note="x" * 501).status_code == 422
    )

    assert report_request(client, BEK, request_id).status_code == 201
    duplicate = report_request(client, BEK, request_id)
    assert (duplicate.status_code, duplicate.json()) == (409, {"detail": "already_reported"})
    # Someone else can still report it; and once resolved, BEK can report it again.
    assert report_request(client, DANA, request_id).status_code == 201
    sql(settings, "UPDATE reports SET resolved = 1")
    assert report_request(client, BEK, request_id).status_code == 201


def test_banned_authors_requests_cant_be_reported(client: TestClient, settings: Settings) -> None:
    request_id = create(client, AIDA)["id"]
    sql(settings, "UPDATE users SET is_banned = 1 WHERE telegram_id = ?", (AIDA["id"],))
    assert report_request(client, BEK, request_id).json() == {"detail": "request_not_found"}


def test_reports_are_rate_limited(client: TestClient) -> None:
    authors = [
        {"id": 100 + n, "first_name": "Author", "username": f"author{n}"}
        for n in range(MAX_REPORTS_PER_DAY + 1)
    ]
    request_ids = [create(client, author)["id"] for author in authors]
    for request_id in request_ids[:-1]:
        assert report_request(client, BEK, request_id).status_code == 201
    response = report_request(client, BEK, request_ids[-1])
    assert (response.status_code, response.json()) == (429, {"detail": "too_many_reports"})


@pytest.mark.parametrize("reporter", [AIDA, BEK])
def test_report_accepted_deal(client: TestClient, settings: Settings, reporter: Any) -> None:
    request_id, deal_id = accepted_deal(client)
    other = BEK if reporter is AIDA else AIDA
    assert get(client, reporter, f"deals/{deal_id}").json()["my_report_open"] is False

    response = report_deal(client, reporter, deal_id, category="disappeared")
    assert response.status_code == 201
    assert response.json()["deal_id"] == deal_id
    assert reports(settings) == [
        (reporter["id"], other["id"], request_id, deal_id, "disappeared", "", 0)
    ]
    # The deal stays accepted; only the reporter sees their open report.
    mine = get(client, reporter, f"deals/{deal_id}").json()
    assert (mine["status"], mine["my_report_open"]) == ("accepted", True)
    assert get(client, other, f"deals/{deal_id}").json()["my_report_open"] is False
    assert report_deal(client, reporter, deal_id).json() == {"detail": "already_reported"}
    # Both sides can still confirm and complete it.
    assert act(client, AIDA, deal_id, "confirm").status_code == 200
    assert act(client, BEK, deal_id, "confirm").json()["status"] == "completed"


def test_report_deal_rejections(client: TestClient) -> None:
    request_id = create(client, AIDA)["id"]
    pending_id = taken(client, BEK, request_id)["id"]
    assert report_deal(client, BEK, pending_id).json() == {"detail": "deal_not_accepted"}
    assert report_deal(client, AIDA, 999).json() == {"detail": "deal_not_found"}
    _, deal_id = accepted_deal(client)
    assert report_deal(client, DANA, deal_id).json() == {"detail": "deal_not_found"}
