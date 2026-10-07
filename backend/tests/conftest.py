from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_notifier
from app.config import Settings
from app.db import Database
from app.main import create_app
from app.models import DealOut
from tests.helpers import BOT_TOKEN

ADMIN_ID = 999
OWNER_ID = 1000


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        bot_token=BOT_TOKEN,
        webapp_url="https://example.test",
        db_path=tmp_path / "test.db",
        admin_ids=[ADMIN_ID],
        owner_id=OWNER_ID,
        run_bot=False,
        run_jobs=False,
        frontend_dist=tmp_path / "no-frontend",
    )


@pytest.fixture
async def db(tmp_path: Path) -> AsyncIterator[Database]:
    database = Database(tmp_path / "test.db")
    await database.connect()
    await database.migrate()
    yield database
    await database.close()


class FakeNotifier:
    """Records deal notifications as (event, chat_id, deal as that user sees it), requests to
    alert about, and how often alerts were to be crossed out."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, int, DealOut]] = []
        self.posted: list[int] = []
        self.left_board = 0

    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        self.sent.append(("requested", author_id, deal))

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        self.sent.append(("accepted", responder_id, deal))

    def payment_reminder(self, user_id: int, deal: DealOut) -> None:
        self.sent.append(("reminder", user_id, deal))

    def request_posted(self, request_id: int) -> None:
        self.posted.append(request_id)

    def requests_left_board(self) -> None:
        self.left_board += 1


@pytest.fixture
def notifier() -> FakeNotifier:
    return FakeNotifier()


@pytest.fixture
def client(settings: Settings, notifier: FakeNotifier) -> Iterator[TestClient]:
    app = create_app(settings)
    app.dependency_overrides[get_notifier] = lambda: notifier
    with TestClient(app) as test_client:
        yield test_client
