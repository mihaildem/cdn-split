"""API routers package."""

from app.api.accounts import router as accounts_router
from app.api.dashboard import router as dashboard_router
from app.api.participants import router as participants_router
from app.api.settlements import router as settlements_router
from app.api.telegram import router as telegram_router

__all__ = [
    "accounts_router",
    "dashboard_router",
    "participants_router",
    "settlements_router",
    "telegram_router",
]
