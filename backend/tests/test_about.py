from fastapi.testclient import TestClient

from app.models import MAX_DONATE_OPTIONS
from tests.helpers import BEK, auth_as
from tests.test_admin import ADMIN, OWNER

ABOUT = {
    "donate_note": "  Covers hosting.  ",
    "donate_options": [
        {"label": " Kaspi ", "value": " +7 707 000 00 00 "},
        {"label": "Ko-fi", "value": "https://ko-fi.com/example"},
    ],
}


def test_about_is_empty_until_the_owner_saves_it(client: TestClient) -> None:
    response = client.get("/api/about", headers=auth_as(BEK))
    assert response.json() == {"donate_note": "", "donate_options": [], "updated_at": None}


def test_owner_edits_about(client: TestClient) -> None:
    response = client.put("/api/admin/about", json=ABOUT, headers=auth_as(OWNER))
    assert response.status_code == 200
    expected = {
        "donate_note": "Covers hosting.",
        "donate_options": [
            {"label": "Kaspi", "value": "+7 707 000 00 00"},
            {"label": "Ko-fi", "value": "https://ko-fi.com/example"},
        ],
    }
    assert {key: response.json()[key] for key in expected} == expected
    seen = client.get("/api/about", headers=auth_as(BEK)).json()
    assert {key: seen[key] for key in expected} == expected
    assert seen["updated_at"] is not None

    cleared = client.put("/api/admin/about", json={}, headers=auth_as(OWNER)).json()
    assert (cleared["donate_note"], cleared["donate_options"]) == ("", [])


def test_only_the_owner_edits_about(client: TestClient) -> None:
    for user in (ADMIN, BEK):
        response = client.put("/api/admin/about", json=ABOUT, headers=auth_as(user))
        assert (response.status_code, response.json()) == (403, {"detail": "owner_only"})


def test_about_validation(client: TestClient) -> None:
    option = {"label": "Kaspi", "value": "123"}
    bad = [
        {"donate_options": [option] * (MAX_DONATE_OPTIONS + 1)},
        {"donate_options": [{"label": " ", "value": "123"}]},
        {"donate_options": [{"label": "x" * 41, "value": "123"}]},
        {"donate_options": [{"label": "Kaspi", "value": "1" * 201}]},
        {"donate_note": "x" * 301},
        {"donate_options": [{**option, "extra": 1}]},
    ]
    for body in bad:
        response = client.put("/api/admin/about", json=body, headers=auth_as(OWNER))
        assert response.status_code == 422, body
