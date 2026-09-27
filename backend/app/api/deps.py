"""Shared FastAPI dependencies."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth import InitDataError, validate_init_data
from app.config import Settings
from app.db import Database
from app.models import User
from app.services.membership import Membership
from app.services.notifications import Notifier
from app.services.users import upsert_user


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_notifier(request: Request) -> Notifier:
    return request.app.state.notifier


def get_membership(request: Request) -> Membership:
    return request.app.state.membership


async def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[Database, Depends(get_db)],
    membership: Annotated[Membership, Depends(get_membership)],
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
    config_admin = settings.is_admin(tg_user.id)
    # Before the upsert, so non-members of the group get no user row.
    await membership.require(tg_user.id, config_admin=config_admin)
    return await upsert_user(db, tg_user, config_admin=config_admin)


CurrentUser = Annotated[User, Depends(get_current_user)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[Database, Depends(get_db)]
NotifierDep = Annotated[Notifier, Depends(get_notifier)]
