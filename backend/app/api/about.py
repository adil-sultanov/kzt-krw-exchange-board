from fastapi import APIRouter

from app.api.deps import CurrentUser, DbDep
from app.models import AboutOut
from app.services import about

router = APIRouter()


@router.get("/about")
async def get_about(_user: CurrentUser, db: DbDep) -> AboutOut:
    return await about.get_about(db)
