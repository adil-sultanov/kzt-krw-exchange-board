"""Pydantic schemas."""

from typing import Self

import aiosqlite
from pydantic import BaseModel, ConfigDict


class TelegramUser(BaseModel):
    """A Telegram user from initData or a bot update (only the fields we use)."""

    model_config = ConfigDict(extra="ignore")

    id: int
    first_name: str = ""
    username: str | None = None
    is_bot: bool = False


class User(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str
    completed_deals: int
    is_banned: bool
    is_admin: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: aiosqlite.Row) -> Self:
        return cls.model_validate(dict(row))


class MeOut(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str
    completed_deals: int
    is_banned: bool
    is_admin: bool
