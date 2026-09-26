from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.models import RateOut
from app.services.rates import get_reference_rate

router = APIRouter()


@router.get("/rate")
async def get_rate(user: CurrentUser, db: DbDep) -> RateOut:
    rate = await get_reference_rate(db)
    if rate is None:
        return RateOut(rate=None, source=None, fetched_at=None)
    return RateOut.model_validate(rate.model_dump())
