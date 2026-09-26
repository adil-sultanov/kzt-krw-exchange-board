from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbDep, NotifierDep
from app.models import ContactOut, DealOut
from app.services import deals

router = APIRouter()


@router.post("/requests/{request_id}/take", status_code=status.HTTP_201_CREATED)
async def take_request(
    user: CurrentUser, db: DbDep, notifier: NotifierDep, request_id: int
) -> DealOut:
    return await deals.take_request(db, user, request_id, notifier)


@router.get("/my/deals")
async def list_my_deals(user: CurrentUser, db: DbDep) -> list[DealOut]:
    return await deals.list_my_deals(db, user.telegram_id)


@router.get("/deals/{deal_id}")
async def get_deal(user: CurrentUser, db: DbDep, deal_id: int) -> DealOut:
    return await deals.get_deal(db, user.telegram_id, deal_id)


@router.post("/deals/{deal_id}/accept")
async def accept_deal(user: CurrentUser, db: DbDep, notifier: NotifierDep, deal_id: int) -> DealOut:
    return await deals.accept_deal(db, user.telegram_id, deal_id, notifier)


@router.post("/deals/{deal_id}/decline")
async def decline_deal(user: CurrentUser, db: DbDep, deal_id: int) -> DealOut:
    return await deals.decline_deal(db, user.telegram_id, deal_id)


@router.post("/deals/{deal_id}/confirm")
async def confirm_received(user: CurrentUser, db: DbDep, deal_id: int) -> DealOut:
    return await deals.confirm_received(db, user.telegram_id, deal_id)


@router.get("/deals/{deal_id}/contact")
async def get_contact(user: CurrentUser, db: DbDep, deal_id: int) -> ContactOut:
    return await deals.get_contact(db, user.telegram_id, deal_id)
