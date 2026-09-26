"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth import InitDataError, validate_init_data
from app.config import Settings
from app.db import Database
from app.models import User
from app.services.notifications import Notifier
from app.services.users import upsert_user


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_notifier(request: Request) -> Notifier:
    return request.app.state.notifier


async def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[Database, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Validate `Authorization: tma <initData>` and refresh the caller's user row."""
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="auth_required")
    try:
        init_data = validate_init_data(
            authorization.removeprefix("tma "),
            settings.bot_token.get_secret_value(),
            max_age=settings.init_data_max_age,
        )
    except InitDataError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=exc.code) from None
    tg_user = init_data.user
    return await upsert_user(db, tg_user, is_admin=tg_user.id in settings.admin_ids)


CurrentUser = Annotated[User, Depends(get_current_user)]
DbDep = Annotated[Database, Depends(get_db)]
NotifierDep = Annotated[Notifier, Depends(get_notifier)]
