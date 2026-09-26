from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbDep
from app.models import BoardFilters, CreatedRequestOut, RequestCreate, RequestOut
from app.services import requests

router = APIRouter()


@router.get("/requests")
async def list_board(
    user: CurrentUser, db: DbDep, filters: Annotated[BoardFilters, Query()]
) -> list[RequestOut]:
    return await requests.list_board(db, user.telegram_id, filters)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_request(user: CurrentUser, db: DbDep, body: RequestCreate) -> CreatedRequestOut:
    created = await requests.create_request(db, user, body)
    matches = await requests.find_matches(db, user.telegram_id, created)
    return CreatedRequestOut(request=created, matches=matches)


@router.get("/requests/{request_id}")
async def get_request(user: CurrentUser, db: DbDep, request_id: int) -> RequestOut:
    return await requests.get_request(db, user.telegram_id, request_id)


@router.post("/requests/{request_id}/close")
async def close_request(user: CurrentUser, db: DbDep, request_id: int) -> RequestOut:
    return await requests.close_request(db, user.telegram_id, request_id)


@router.get("/my/requests")
async def list_my_requests(user: CurrentUser, db: DbDep) -> list[RequestOut]:
    return await requests.list_my_open_requests(db, user.telegram_id)
