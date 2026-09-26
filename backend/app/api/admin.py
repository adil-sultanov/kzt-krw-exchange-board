from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbDep, SettingsDep
from app.models import (
    AboutOut,
    AboutUpdate,
    AdminAdd,
    AdminOut,
    AdminReportOut,
    AdminUserOut,
    OwnerDealOut,
)
from app.services import about, admin

router = APIRouter(prefix="/admin")


@router.get("/reports")
async def list_reports(
    user: CurrentUser, db: DbDep, resolved: bool = False
) -> list[AdminReportOut]:
    return await admin.list_reports(db, user, resolved=resolved)


@router.post("/reports/{report_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def resolve_report(user: CurrentUser, db: DbDep, report_id: int) -> Response:
    await admin.resolve_report(db, user, report_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/users/{user_id}/ban")
async def ban_user(user: CurrentUser, db: DbDep, user_id: int) -> AdminUserOut:
    return await admin.ban_user(db, user, user_id)


@router.post("/users/{user_id}/unban")
async def unban_user(user: CurrentUser, db: DbDep, user_id: int) -> AdminUserOut:
    return await admin.unban_user(db, user, user_id)


# --- Owner only ---


@router.get("/admins")
async def list_admins(user: CurrentUser, db: DbDep, settings: SettingsDep) -> list[AdminOut]:
    return await admin.list_admins(db, user, settings)


@router.post("/admins", status_code=status.HTTP_201_CREATED)
async def add_admin(
    user: CurrentUser, db: DbDep, settings: SettingsDep, body: AdminAdd
) -> AdminOut:
    return await admin.add_admin(db, user, settings, body.username)


@router.delete("/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_admin(
    user: CurrentUser, db: DbDep, settings: SettingsDep, user_id: int
) -> Response:
    await admin.remove_admin(db, user, settings, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/deals")
async def list_deals(
    user: CurrentUser, db: DbDep, settings: SettingsDep, active: bool = True
) -> list[OwnerDealOut]:
    return await admin.list_deals(db, user, settings, active=active)


@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    user: CurrentUser, db: DbDep, settings: SettingsDep, deal_id: int
) -> Response:
    await admin.delete_deal(db, user, settings, deal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/about")
async def update_about(
    user: CurrentUser, db: DbDep, settings: SettingsDep, body: AboutUpdate
) -> AboutOut:
    return await about.update_about(db, user.telegram_id, settings.owner_id, body)
