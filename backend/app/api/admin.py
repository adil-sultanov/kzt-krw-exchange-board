from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbDep, NotifierDep, SettingsDep
from app.models import (
    AboutOut,
    AboutUpdate,
    AdminAdd,
    AdminBoardRequestOut,
    AdminOut,
    AdminReportOut,
    AdminUserDetailOut,
    AdminUserOut,
    AdminUsersOut,
    CancelledRequestOut,
    DealListState,
    ListedDealOut,
    UserListFilter,
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


@router.get("/users")
async def list_users(
    user: CurrentUser,
    db: DbDep,
    q: Annotated[str, Query(max_length=64)] = "",
    show: UserListFilter = "all",
) -> AdminUsersOut:
    return await admin.list_users(db, user, query=q, show=show)


@router.get("/users/{user_id}")
async def get_user(user: CurrentUser, db: DbDep, user_id: int) -> AdminUserDetailOut:
    return await admin.get_user(db, user, user_id)


@router.post("/users/{user_id}/ban")
async def ban_user(
    user: CurrentUser, db: DbDep, notifier: NotifierDep, user_id: int
) -> AdminUserOut:
    return await admin.ban_user(db, user, user_id, notifier)


@router.post("/users/{user_id}/unban")
async def unban_user(user: CurrentUser, db: DbDep, user_id: int) -> AdminUserOut:
    return await admin.unban_user(db, user, user_id)


@router.get("/requests")
async def list_board_requests(user: CurrentUser, db: DbDep) -> list[AdminBoardRequestOut]:
    return await admin.list_board_requests(db, user)


@router.get("/requests/cancelled")
async def list_cancelled_requests(user: CurrentUser, db: DbDep) -> list[CancelledRequestOut]:
    return await admin.list_cancelled_requests(db, user)


@router.get("/deals")
async def list_deals(
    user: CurrentUser, db: DbDep, state: DealListState = "active"
) -> list[ListedDealOut]:
    return await admin.list_deals(db, user, state=state)


@router.post("/requests/{request_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_board_request(
    user: CurrentUser, db: DbDep, notifier: NotifierDep, request_id: int
) -> Response:
    await admin.remove_board_request(db, user, request_id, notifier)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
