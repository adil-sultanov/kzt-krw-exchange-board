from fastapi import APIRouter

from app.api import about, admin, deals, me, rates, requests

api_router = APIRouter(prefix="/api")
api_router.include_router(me.router)
api_router.include_router(rates.router)
api_router.include_router(requests.router)
api_router.include_router(deals.router)
api_router.include_router(about.router)
api_router.include_router(admin.router)
