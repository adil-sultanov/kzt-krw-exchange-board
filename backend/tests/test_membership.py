import sqlite3
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_membership
from app.config import Settings
from app.main import create_app
from app.services import membership as membership_module
from app.services.errors import UnavailableError
from app.services.membership import Membership
from tests.conftest import ADMIN_ID, FakeNotifier
from tests.helpers import AIDA, BEK, auth_as

GROUP_ID = -100123


class FakeLookup:
    """Group members by user ID; `fail` makes Telegram unreachable."""

    def __init__(self, members: set[int]) -> None:
        self.members = members
        self.fail = False
        self.calls = 0

    async def __call__(self, group_id: int, user_id: int) -> bool:
        assert group_id == GROUP_ID
        self.calls += 1
        if self.fail:
            raise RuntimeError("telegram unreachable")
        return user_id in self.members


async def test_no_group_allows_everyone() -> None:
    assert await Membership(None, None).is_allowed(1, config_admin=False)


async def test_members_only() -> None:
    membership = Membership(GROUP_ID, FakeLookup({AIDA["id"]}))
    assert await membership.is_allowed(AIDA["id"], config_admin=False)
    assert not await membership.is_allowed(BEK["id"], config_admin=False)
    assert await membership.is_allowed(ADMIN_ID, config_admin=True)


async def test_members_are_cached_non_members_are_not(monkeypatch: pytest.MonkeyPatch) -> None:
    lookup = FakeLookup({AIDA["id"]})
    membership = Membership(GROUP_ID, lookup)
    for _ in range(2):
        await membership.is_allowed(AIDA["id"], config_admin=False)
        await membership.is_allowed(BEK["id"], config_admin=False)
    assert lookup.calls == 3  # Aida once, Bek twice

    # Bek joins: allowed right away.
    lookup.members.add(BEK["id"])
    assert await membership.is_allowed(BEK["id"], config_admin=False)

    # Aida leaves: noticed once her cached membership expires.
    lookup.members.discard(AIDA["id"])
    assert await membership.is_allowed(AIDA["id"], config_admin=False)
    monkeypatch.setattr(membership_module, "MEMBER_CACHE_SECONDS", 0)
    assert not await membership.is_allowed(AIDA["id"], config_admin=False)


async def test_forget_ends_access_at_once() -> None:
    lookup = FakeLookup({AIDA["id"]})
    membership = Membership(GROUP_ID, lookup)
    assert await membership.is_allowed(AIDA["id"], config_admin=False)
    lookup.members.discard(AIDA["id"])
    membership.forget(AIDA["id"])
    assert not await membership.is_allowed(AIDA["id"], config_admin=False)


async def test_telegram_down(monkeypatch: pytest.MonkeyPatch) -> None:
    lookup = FakeLookup({AIDA["id"]})
    membership = Membership(GROUP_ID, lookup)
    await membership.is_allowed(AIDA["id"], config_admin=False)
    monkeypatch.setattr(membership_module, "MEMBER_CACHE_SECONDS", 0)
    lookup.fail = True
    # A known member keeps access; anyone else can't be checked.
    assert await membership.is_allowed(AIDA["id"], config_admin=False)
    with pytest.raises(UnavailableError):
        await membership.is_allowed(BEK["id"], config_admin=False)


async def test_group_without_bot_fails_closed() -> None:
    with pytest.raises(UnavailableError):
        await Membership(GROUP_ID, None).is_allowed(AIDA["id"], config_admin=False)


@pytest.fixture
def members_client(settings: Settings, notifier: FakeNotifier) -> Iterator[TestClient]:
    app = create_app(settings)
    membership = Membership(GROUP_ID, FakeLookup({AIDA["id"]}))
    app.dependency_overrides[get_membership] = lambda: membership
    with TestClient(app) as test_client:
        yield test_client


def test_api_rejects_non_members(members_client: TestClient) -> None:
    assert members_client.get("/api/me", headers=auth_as(AIDA)).status_code == 200
    response = members_client.get("/api/requests", headers=auth_as(BEK))
    assert response.status_code == 403
    assert response.json() == {"detail": "not_group_member"}
    admin = {"id": ADMIN_ID, "first_name": "Admin", "username": "admin"}
    assert members_client.get("/api/me", headers=auth_as(admin)).status_code == 200


def test_non_members_get_no_user_row(members_client: TestClient, settings: Settings) -> None:
    members_client.get("/api/me", headers=auth_as(BEK))
    with sqlite3.connect(settings.db_path) as conn:
        ids = {row[0] for row in conn.execute("SELECT telegram_id FROM users")}
    assert BEK["id"] not in ids
