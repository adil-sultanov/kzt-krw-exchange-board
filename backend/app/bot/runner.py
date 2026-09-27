"""Runs the aiogram bot (long polling) inside the FastAPI process."""

import asyncio
import contextlib
import logging

from aiogram import Bot, Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.bot import texts
from app.bot.handlers import router
from app.bot.middleware import UserRefreshMiddleware
from app.config import Settings
from app.db import Database
from app.services.membership import Membership

logger = logging.getLogger(__name__)


def build_dispatcher(settings: Settings, db: Database, membership: Membership) -> Dispatcher:
    # settings, db and membership are injected into handlers and middleware as keyword data.
    dp = Dispatcher(settings=settings, db=db, membership=membership)
    # Registered after aiogram's own context middleware, so event_from_user is set.
    dp.update.outer_middleware(UserRefreshMiddleware())
    dp.include_router(router)
    return dp


class BotRunner:
    """Polls for updates. The Bot (and its HTTP session) is owned by the app lifespan."""

    def __init__(self, settings: Settings, db: Database, bot: Bot, membership: Membership) -> None:
        self.settings = settings
        self.bot = bot
        self.dp = build_dispatcher(settings, db, membership)
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        await self._configure()
        self._task = asyncio.create_task(
            self.dp.start_polling(self.bot, handle_signals=False), name="bot-polling"
        )
        self._task.add_done_callback(_log_polling_exit)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _configure(self) -> None:
        await self.bot.set_my_commands(
            [BotCommand(command="start", description=texts.START_COMMAND_DESCRIPTION)]
        )
        if not self.settings.webapp_url.startswith("https://"):
            logger.warning("WEBAPP_URL is not HTTPS; Telegram won't open it. Menu button not set.")
            return
        await self.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text=texts.MENU_BUTTON, web_app=WebAppInfo(url=self.settings.webapp_url)
            )
        )


def _log_polling_exit(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        logger.error("Bot polling stopped with an error", exc_info=task.exception())
