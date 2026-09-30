"""Sends deal notifications as bot messages, and hands alerts to the alert sender (see
app/services/notifications.py)."""

import asyncio
import logging
from typing import TYPE_CHECKING

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.bot import texts
from app.models import DealOut

if TYPE_CHECKING:
    from app.bot.alerts import AlertSender

logger = logging.getLogger(__name__)

SHUTDOWN_TIMEOUT = 5.0  # seconds to let in-flight messages finish


def start_url(webapp_url: str, start_param: str) -> str:
    """The Mini App URL that opens a screen (`deal_45`, `req_123`). web_app buttons can't carry
    a start param, so the frontend also reads `startapp` from the query string."""
    separator = "&" if "?" in webapp_url else "?"
    return f"{webapp_url}{separator}startapp={start_param}"


def deal_url(webapp_url: str, deal_id: int) -> str:
    return start_url(webapp_url, f"deal_{deal_id}")


class BotNotifier:
    """Sends in the background, so the API response doesn't wait for Telegram."""

    def __init__(self, bot: Bot, webapp_url: str, alerts: "AlertSender | None" = None) -> None:
        self.bot = bot
        self.webapp_url = webapp_url
        self.alerts = alerts
        self._tasks: set[asyncio.Task[None]] = set()

    def deal_requested(self, author_id: int, deal: DealOut) -> None:
        self._send(author_id, texts.deal_requested(deal), deal.id)

    def deal_accepted(self, responder_id: int, deal: DealOut) -> None:
        self._send(responder_id, texts.deal_accepted(deal), deal.id)

    def request_posted(self, request_id: int) -> None:
        if self.alerts is not None:
            self.alerts.request_posted(request_id)

    def requests_left_board(self) -> None:
        if self.alerts is not None:
            self.alerts.requests_left_board()

    async def aclose(self) -> None:
        if self._tasks:
            await asyncio.wait(self._tasks, timeout=SHUTDOWN_TIMEOUT)
        if self.alerts is not None:
            await self.alerts.aclose()

    def _send(self, chat_id: int, text: str, deal_id: int) -> None:
        task = asyncio.create_task(self._deliver(chat_id, text, deal_id))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _deliver(self, chat_id: int, text: str, deal_id: int) -> None:
        markup = None
        # Telegram rejects web_app buttons with non-HTTPS URLs (e.g. a local dev setup).
        if self.webapp_url.startswith("https://"):
            button = InlineKeyboardButton(
                text=texts.OPEN_DEAL_BUTTON,
                web_app=WebAppInfo(url=deal_url(self.webapp_url, deal_id)),
            )
            markup = InlineKeyboardMarkup(inline_keyboard=[[button]])
        try:
            await self.bot.send_message(chat_id, text, reply_markup=markup)
        except Exception as exc:
            # Usually the user never started the bot or blocked it; they still see the
            # deal in the app. Log only the deal and error type, never the user.
            logger.warning(
                "Couldn't send notification for deal %s: %s", deal_id, type(exc).__name__
            )
