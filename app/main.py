"""Main FastAPI backend application for CDN Splitwise & Resource Dashboard."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os
from pathlib import Path
import time
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import db, notifier, providers
from app.api import accounts_router, dashboard_router, participants_router, settlements_router, telegram_router

SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL_SECONDS", 300))
PING_INTERVAL = int(os.environ.get("PING_INTERVAL_SECONDS", 180))


async def background_sync_worker():
    """Background periodic sync for accounts and health checks."""
    await asyncio.sleep(2.0)
    while True:
        try:
            for acc in db.get_accounts():
                creds = acc.get("credentials", {})
                if not creds:
                    continue
                try:
                    res = await providers.test_provider_credentials(acc["provider"], creds)
                    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    if res.success:
                        upd = {"balance_rub": res.balance_rub, "bonus_balance_rub": res.bonus_balance_rub,
                               "sync_status": "ok", "sync_error": None, "last_synced_at": now_str}
                        if res.account_identifier and not acc.get("account_identifier"):
                            upd["account_identifier"] = res.account_identifier
                        db.update_account(acc["id"], upd)
                        if res.balance_rub < acc.get("low_balance_threshold", 200.0):
                            if db.check_and_update_cooldown(f"low_balance:{acc['id']}", 43200):
                                await notifier.notify_low_balance({**acc, **upd})
                    else:
                        db.update_account(acc["id"], {"sync_status": "error", "sync_error": res.error, "last_synced_at": now_str})
                        if db.check_and_update_cooldown(f"api_error:{acc['id']}", 21600):
                            await notifier.notify_api_error(acc, res.error or "Sync failed")
                except Exception:
                    pass
            await notifier.ping_all_resources()
        except asyncio.CancelledError:
            break
        except Exception:
            pass
        await asyncio.sleep(min(SYNC_INTERVAL, PING_INTERVAL))


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    db.seed_demo_data(force=False)
    sync_task = asyncio.create_task(background_sync_worker())
    yield
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="CDN Splitwise & Resource Dashboard", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def pin_access_middleware(request: Request, call_next):
    pin = os.environ.get("APP_ACCESS_PIN", "").strip()
    if pin and request.method != "OPTIONS" and request.url.path != "/health" and request.url.path.startswith("/api/"):
        if request.headers.get("X-Access-Pin", "").strip() != pin:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Неверный или отсутствующий PIN-код доступа (X-Access-Pin)"},
            )
    return await call_next(request)


# Static and Root Index Handling
ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static" if (ROOT_DIR / "static").is_dir() else Path(__file__).resolve().parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/")
async def serve_index():
    for candidate in [ROOT_DIR / "index.html", Path(__file__).resolve().parent / "static" / "index.html"]:
        if candidate.is_file():
            return FileResponse(str(candidate))
    return {"message": "CDN Splitwise API is running. UI not found."}


for r in (dashboard_router, participants_router, accounts_router, settlements_router, telegram_router):
    app.include_router(r)
