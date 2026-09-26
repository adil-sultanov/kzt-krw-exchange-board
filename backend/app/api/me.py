from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.models import MeOut, MeUpdate
from app.services.users import update_receiving_details

router = APIRouter()


@router.get("/me")
async def get_me(user: CurrentUser) -> MeOut:
    return MeOut.model_validate(user.model_dump())


@router.patch("/me")
async def update_me(user: CurrentUser, db: DbDep, update: MeUpdate) -> MeOut:
    updated = await update_receiving_details(db, user.telegram_id, update)
    return MeOut.model_validate(updated.model_dump())
