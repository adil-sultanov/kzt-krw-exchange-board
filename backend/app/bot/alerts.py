"""Sends alerts about new requests, and crosses them out once a request leaves the board (see
app/services/alerts.py for who gets what)."""

import asyncio
import contextlib
import logging
from collections.abc import Callable

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.bot import texts
from app.bot.notifier import start_url
from app.db import Database
from app.services import alerts
from app.services.alerts import SentAlert
from app.services.errors import ServiceError
from app.services.membership import Membership

logger = logging.getLogger(__name__)

# Seconds between alert messages: Telegram lets a bot send about 30 a second in all.
SEND_INTERVAL = 1 / 20


class AlertSender:
    """One task works through the jobs in order, so messages go out at a steady pace, and all of
    a request's alerts are recorded before anything crosses them out.

    Jobs still queued at shutdown are dropped; the expiry job's first run after startup crosses
    out whatever it missed.
    """

    def __init__(
        self,
        bot: Bot,
        webapp_url: str,
        db: Database,
        membership: Membership,
        is_admin: Callable[[int], bool],
    ) -> None:
        self.bot = bot
        self.webapp_url = webapp_url
        self.db = db
        self.membership = membership
        self.is_admin = is_admin
        # A request id to alert about, or None to cross out alerts about requests that left.
        self._jobs: asyncio.Queue[int | None] = asyncio.Queue()
        self._cross_out_queued = False
        self._task: asyncio.Task[None] | None = None

    def request_posted(self, request_id: int) -> None:
        self._put(request_id)

    def requests_left_board(self) -> None:
        if not self._cross_out_queued:
            self._cross_out_queued = True
            self._put(None)

    async def aclose(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    def _put(self, job: int | None) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="alerts")
        self._jobs.put_nowait(job)

    async def _run(self) -> None:
        while True:
            job = await self._jobs.get()
            try:
                if job is None:
                    self._cross_out_queued = False
                else:
                    await self._send_alerts(job)
                # Also after sending: the request may have left the board meanwhile.
                await self._cross_out()
            except Exception:
                logger.exception("Alert job failed")
            finally:
                self._jobs.task_done()

    async def _send_alerts(self, request_id: int) -> None:
        alert = await alerts.load_alert(self.db, request_id)
        if alert is None:
            return
        text = texts.request_alert(alert)
        markup = None
        # Telegram rejects web_app buttons with non-HTTPS URLs (e.g. a local dev setup).
        if self.webapp_url.startswith("https://"):
            button = InlineKeyboardButton(
                text=texts.OPEN_REQUEST_BUTTON,
                web_app=WebAppInfo(url=start_url(self.webapp_url, f"req_{request_id}")),
            )
            markup = InlineKeyboardMarkup(inline_keyboard=[[button]])
        for chat_id in alert.recipients:
            # Taken or cancelled while the alerts go out: the rest would only be crossed out.
            if not await alerts.on_board(self.db, request_id):
                return
            if not await self._may_alert(chat_id):
                continue
            message_id = await self._send(chat_id, text, markup, request_id)
            if message_id is not None:
                await alerts.record_alert(self.db, SentAlert(request_id, chat_id, message_id, text))
            await asyncio.sleep(SEND_INTERVAL)

    async def _may_alert(self, chat_id: int) -> bool:
        """Only members of the group chat get alerts, as only they can use the board."""
        try:
            return await self.membership.is_allowed(chat_id, config_admin=self.is_admin(chat_id))
        except ServiceError:
            return False  # Telegram can't be asked now; skip rather than guess

    async def _send(
        self, chat_id: int, text: str, markup: InlineKeyboardMarkup | None, request_id: int
    ) -> int | None:
        for attempt in range(2):
            try:
                message = await self.bot.send_message(chat_id, text, reply_markup=markup)
                return message.message_id
            except TelegramRetryAfter as exc:
                if attempt == 0:
                    await asyncio.sleep(exc.retry_after)
                    continue
                self._log_failure("send", request_id, exc)
            except TelegramForbiddenError as exc:
                # They blocked the bot (or never started it): turn their alerts off.
                self._log_failure("send", request_id, exc)
                await alerts.turn_off_alerts(self.db, chat_id)
            except Exception as exc:
                self._log_failure("send", request_id, exc)
            return None
        return None

    async def _cross_out(self) -> None:
        for sent in await alerts.gone_alerts(self.db):
            for attempt in range(2):
                try:
                    # Without reply_markup, the Open request button goes too.
                    await self.bot.edit_message_text(
                        texts.alert_gone(sent.text),
                        chat_id=sent.chat_id,
                        message_id=sent.message_id,
                        parse_mode="HTML",
                    )
                except TelegramRetryAfter as exc:
                    if attempt == 0:
                        await asyncio.sleep(exc.retry_after)
                        continue
                    self._log_failure("cross out", sent.request_id, exc)
                except Exception as exc:
                    # e.g. they deleted the message or blocked the bot: nothing to cross out.
                    self._log_failure("cross out", sent.request_id, exc)
                break
            await alerts.forget_alert(self.db, sent)
            await asyncio.sleep(SEND_INTERVAL)

    @staticmethod
    def _log_failure(action: str, request_id: int, exc: Exception) -> None:
        # Log only the request and error type, never the user.
        logger.warning(
            "Couldn't %s alert for request %s: %s", action, request_id, type(exc).__name__
        )
