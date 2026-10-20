"""API routers package."""

from app.api.account_ops import router as account_ops_router
from app.api.accounts import router as accounts_router
from app.api.dashboard import router as dashboard_router
from app.api.overview import router as overview_router
from app.api.participants import router as participants_router
from app.api.settlements import router as settlements_router
from app.api.telegram import router as telegram_router
from app.api.transfers_api import router as transfers_router

__all__ = [
    "account_ops_router",
    "accounts_router",
    "dashboard_router",
    "overview_router",
    "participants_router",
    "settlements_router",
    "telegram_router",
    "transfers_router",
]
