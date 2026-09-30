from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.config import Settings
from app.models import AlertsUpdate, MeOut, MeUpdate, User
from app.services import alerts, users

router = APIRouter()


def _me_out(user: User, settings: Settings) -> MeOut:
    return MeOut.model_validate(
        {**user.model_dump(), "is_owner": settings.is_owner(user.telegram_id)}
    )


@router.get("/me")
async def get_me(user: CurrentUser, settings: SettingsDep) -> MeOut:
    return _me_out(user, settings)


@router.patch("/me")
async def update_me(user: CurrentUser, db: DbDep, settings: SettingsDep, update: MeUpdate) -> MeOut:
    updated = await users.update_me(db, user.telegram_id, update)
    return _me_out(updated, settings)


@router.patch("/me/alerts")
async def update_alerts(
    user: CurrentUser, db: DbDep, settings: SettingsDep, update: AlertsUpdate
) -> MeOut:
    updated = await alerts.set_alerts(db, user.telegram_id, update)
    return _me_out(updated, settings)
