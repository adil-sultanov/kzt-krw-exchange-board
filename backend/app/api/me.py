from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models import MeOut

router = APIRouter()


@router.get("/me")
async def get_me(user: CurrentUser) -> MeOut:
    return MeOut.model_validate(user.model_dump())
