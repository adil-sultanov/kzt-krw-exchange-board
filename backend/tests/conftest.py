from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from app.config import Settings
from app.db import Database
from tests.helpers import BOT_TOKEN

ADMIN_ID = 999


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        bot_token=BOT_TOKEN,
        webapp_url="https://example.test",
        db_path=tmp_path / "test.db",
        admin_ids=[ADMIN_ID],
        run_bot=False,
    )


@pytest.fixture
async def db(tmp_path: Path) -> AsyncIterator[Database]:
    database = Database(tmp_path / "test.db")
    await database.connect()
    await database.migrate()
    yield database
    await database.close()
