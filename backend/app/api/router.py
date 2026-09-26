from fastapi import APIRouter

from app.api import deals, me, rates, requests

api_router = APIRouter(prefix="/api")
api_router.include_router(me.router)
api_router.include_router(rates.router)
api_router.include_router(requests.router)
api_router.include_router(deals.router)
