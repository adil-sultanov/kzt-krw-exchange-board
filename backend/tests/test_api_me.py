import time

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ADMIN_ID, OWNER_ID
from tests.helpers import auth, make_init_data

USER = {"id": 42, "first_name": "Aida", "username": "aida_kz"}


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
        "is_owner": False,
        "receive_kzt_bank": None,
        "receive_kzt_account": None,
        "receive_krw_bank": None,
        "receive_krw_account": None,
        "profile_first_name": None,
        "profile_last_name": None,
        "university": None,
        "enrollment_year": None,
    }

    renamed = {**USER, "username": "aida_new"}
    response = client.get("/api/me", headers=auth(make_init_data(renamed)))
    assert response.json()["username"] == "aida_new"


def test_me_admin_from_config(client: TestClient) -> None:
    admin = {"id": ADMIN_ID, "first_name": "Admin"}
    response = client.get("/api/me", headers=auth(make_init_data(admin)))
    assert response.json()["is_admin"] is True
    assert response.json()["is_owner"] is False


def test_owner_is_an_admin(client: TestClient) -> None:
    owner = {"id": OWNER_ID, "first_name": "Owner"}
    me = client.get("/api/me", headers=auth(make_init_data(owner))).json()
    assert me["is_admin"] is True
    assert me["is_owner"] is True


def test_update_receiving_details(client: TestClient) -> None:
    headers = auth(make_init_data(USER))
    body = {
        "receive_kzt_bank": " Kaspi, Adil S. ",
        "receive_kzt_account": "  +7 707 000 00 00 ",
        "receive_krw_account": "",
    }
    response = client.patch("/api/me", json=body, headers=headers)
    assert response.status_code == 200
    me = response.json()
    assert me["receive_kzt_bank"] == "Kaspi, Adil S."
    assert me["receive_kzt_account"] == "+7 707 000 00 00"
    assert me["receive_krw_account"] is None

    # Fields left out are unchanged; an empty value clears one.
    client.patch("/api/me", json={"receive_krw_account": "1000-22"}, headers=headers)
    me = client.get("/api/me", headers=headers).json()
    assert (me["receive_kzt_account"], me["receive_krw_account"]) == ("+7 707 000 00 00", "1000-22")
    client.patch("/api/me", json={"receive_kzt_bank": None}, headers=headers)
    me = client.get("/api/me", headers=headers).json()
    assert (me["receive_kzt_bank"], me["receive_kzt_account"]) == (None, "+7 707 000 00 00")


@pytest.mark.parametrize(
    "body",
    [
        {"receive_kzt_bank": "x" * 101},
        {"receive_krw_account": "x" * 101},
        {"receive_kzt": "old field"},
        {"username": "evil"},
        {"receive_krw_bank": 5},
    ],
)
def test_update_receiving_details_rejects_bad_input(
    client: TestClient, body: dict[str, object]
) -> None:
    response = client.patch("/api/me", json=body, headers=auth(make_init_data(USER)))
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_input"}


def test_update_profile(client: TestClient) -> None:
    headers = auth(make_init_data(USER))
    body = {
        "profile_first_name": "  adil ",
        "profile_last_name": "sultanov-o\u2019neil",
        "university": " Korea   University ",
        "enrollment_year": 2022,
    }
    response = client.patch("/api/me", json=body, headers=headers)
    assert response.status_code == 200
    me = response.json()
    # First letters capitalized, spaces tidied; the university stays as typed.
    assert me["profile_first_name"] == "Adil"
    assert me["profile_last_name"] == "Sultanov-O\u2019neil"
    assert me["university"] == "Korea University"
    assert me["enrollment_year"] == 2022

    # Fields left out are unchanged; an empty value (or a null year) clears one.
    client.patch("/api/me", json={"university": "", "enrollment_year": None}, headers=headers)
    me = client.get("/api/me", headers=headers).json()
    assert (me["profile_first_name"], me["university"], me["enrollment_year"]) == (
        "Adil",
        None,
        None,
    )


@pytest.mark.parametrize(
    "body",
    [
        {"profile_first_name": "x" * 41},
        {"profile_last_name": "Smith, Jr"},
        {"profile_first_name": "Adil1"},
        {"profile_first_name": "Adil 😀"},
        {"university": "https://t.me/x"},
        {"university": "U" * 61},
        {"enrollment_year": 1999},
        {"enrollment_year": 3000},
        {"enrollment_year": "2022"},
    ],
)
def test_update_profile_rejects_bad_input(client: TestClient, body: dict[str, object]) -> None:
    response = client.patch("/api/me", json=body, headers=auth(make_init_data(USER)))
    assert (response.status_code, response.json()) == (422, {"detail": "invalid_input"})
