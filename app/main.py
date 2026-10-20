"""Main FastAPI backend application for CDN Splitwise & Resource Dashboard."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os
import time
from typing import Any
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import db, notifier, providers
from app.billing import calculate_account_billing, calculate_splitwise_overview
from app.models import (
    AccountCreate,
    AccountUpdate,
    DashboardResponse,
    ResourceConsumerUpdate,
    ResourceCreate,
    ResourceUpdate,
    TelegramBotCreate,
    TelegramBotUpdate,
)


SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", 300))
PING_INTERVAL_SECONDS = int(os.environ.get("PING_INTERVAL_SECONDS", 180))


async def background_sync_worker():
    """Background periodic sync for accounts and health checks."""
    await asyncio.sleep(2.0)  # brief startup delay
    while True:
        try:
            # 1. Sync accounts with provider APIs
            accounts = db.get_accounts()
            for acc in accounts:
                creds = acc.get("credentials", {})
                if creds:
                    try:
                        res = await providers.test_provider_credentials(acc["provider"], creds)
                        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                        if res.success:
                            updates = {
                                "balance_rub": res.balance_rub,
                                "bonus_balance_rub": res.bonus_balance_rub,
                                "sync_status": "ok",
                                "sync_error": None,
                                "last_synced_at": now_str,
                            }
                            if res.account_identifier and not acc.get("account_identifier"):
                                updates["account_identifier"] = res.account_identifier
                            db.update_account(acc["id"], updates)

                            # Check low balance alert
                            if res.balance_rub < acc.get("low_balance_threshold", 200.0):
                                alert_key = f"low_balance:{acc['id']}"
                                if db.check_and_update_cooldown(alert_key, cooldown_seconds=43200):  # 12 hours
                                    acc_copy = dict(acc)
                                    acc_copy.update(updates)
                                    await notifier.notify_low_balance(acc_copy)
                        else:
                            db.update_account(
                                acc["id"],
                                {
                                    "sync_status": "error",
                                    "sync_error": res.error,
                                    "last_synced_at": now_str,
                                },
                            )
                            alert_key = f"api_error:{acc['id']}"
                            if db.check_and_update_cooldown(alert_key, cooldown_seconds=21600):  # 6 hours
                                await notifier.notify_api_error(acc, res.error or "Sync failed")
                    except Exception as e:
                        pass

            # 2. Ping CDN health
            await notifier.ping_all_resources()

        except asyncio.CancelledError:
            break
        except Exception:
            pass

        await asyncio.sleep(min(SYNC_INTERVAL_SECONDS, PING_INTERVAL_SECONDS))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB and seed demo data if empty
    db.init_db()
    db.seed_demo_data(force=False)

    # Launch background task
    sync_task = asyncio.create_task(background_sync_worker())
    yield
    # Cleanup
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="CDN Splitwise & Resource Dashboard",
    description="Cost splitting, Free tier calculation, and CDN monitoring.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# --- Core App and Health ---

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/")
async def serve_index():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "CDN Splitwise API is running. UI not found."}


# --- Providers Metadata & Test ---

@app.get("/api/providers")
async def get_providers():
    return list(providers.PROVIDERS_REGISTRY.values())


@app.post("/api/accounts/test")
async def test_account_credentials(payload: dict[str, Any]):
    provider_id = payload.get("provider")
    credentials = payload.get("credentials", {})
    if not provider_id:
        raise HTTPException(status_code=400, detail="provider is required")
    res = await providers.test_provider_credentials(provider_id, credentials)
    return res


# --- Dashboard API ---

def build_dashboard_response() -> DashboardResponse:
    accounts = db.get_accounts()
    all_resources = db.get_resources()

    # Group resources by account_id
    res_by_acc: dict[str, list[dict[str, Any]]] = {}
    for r in all_resources:
        res_by_acc.setdefault(r["account_id"], []).append(r)

    account_summaries = []
    for acc in accounts:
        r_list = res_by_acc.get(acc["id"], [])
        acc_summary = calculate_account_billing(acc, r_list)
        account_summaries.append(acc_summary)

    splitwise = calculate_splitwise_overview(account_summaries)
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    return DashboardResponse(
        splitwise=splitwise,
        accounts=account_summaries,
        last_updated_at=now_str,
    )


@app.get("/api/dashboard", response_model=DashboardResponse)
async def get_dashboard():
    return build_dashboard_response()


# --- Accounts API ---

@app.get("/api/accounts")
async def list_accounts():
    return db.get_accounts()


@app.post("/api/accounts", status_code=status.HTTP_201_CREATED)
async def create_account_endpoint(payload: AccountCreate):
    acc = db.create_account(payload.model_dump())
    return acc


@app.get("/api/accounts/{account_id}")
async def get_account_endpoint(account_id: str):
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@app.put("/api/accounts/{account_id}")
async def update_account_endpoint(account_id: str, payload: AccountUpdate):
    acc = db.update_account(account_id, payload.model_dump(exclude_unset=True))
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@app.delete("/api/accounts/{account_id}")
async def delete_account_endpoint(account_id: str):
    success = db.delete_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True, "id": account_id}


@app.post("/api/accounts/{account_id}/sync")
async def sync_single_account(account_id: str):
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    creds = acc.get("credentials", {})
    res = await providers.test_provider_credentials(acc["provider"], creds)
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if res.success:
        updates = {
            "balance_rub": res.balance_rub,
            "bonus_balance_rub": res.bonus_balance_rub,
            "sync_status": "ok",
            "sync_error": None,
            "last_synced_at": now_str,
        }
        if res.account_identifier:
            updates["account_identifier"] = res.account_identifier
        updated_acc = db.update_account(account_id, updates)

        # Merge discovered resources if any
        if res.resources:
            current_res = db.get_resources(account_id)
            existing_domains = {r["domain"]: r for r in current_res}
            for pr in res.resources:
                if pr.domain in existing_domains:
                    db.update_resource(
                        existing_domains[pr.domain]["id"],
                        {"total_gb": pr.total_gb, "cname": pr.cname or existing_domains[pr.domain].get("cname")},
                    )
                else:
                    db.create_resource({
                        "account_id": account_id,
                        "provider_resource_id": pr.provider_resource_id,
                        "domain": pr.domain,
                        "cname": pr.cname,
                        "status": pr.status,
                        "total_gb": pr.total_gb,
                        "consumer": "split",
                    })

        return {"success": True, "account": updated_acc, "discovered_resources": len(res.resources)}
    else:
        db.update_account(
            account_id,
            {"sync_status": "error", "sync_error": res.error, "last_synced_at": now_str},
        )
        return {"success": False, "error": res.error}


@app.post("/api/sync/all")
async def sync_all_accounts():
    accounts = db.get_accounts()
    sync_results = []
    for acc in accounts:
        creds = acc.get("credentials", {})
        res = await providers.test_provider_credentials(acc["provider"], creds)
        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if res.success:
            db.update_account(
                acc["id"],
                {
                    "balance_rub": res.balance_rub,
                    "bonus_balance_rub": res.bonus_balance_rub,
                    "sync_status": "ok",
                    "sync_error": None,
                    "last_synced_at": now_str,
                },
            )
            sync_results.append({"id": acc["id"], "success": True})
        else:
            db.update_account(
                acc["id"],
                {"sync_status": "error", "sync_error": res.error, "last_synced_at": now_str},
            )
            sync_results.append({"id": acc["id"], "success": False, "error": res.error})

    # Also ping CDN resources
    ping_results = await notifier.ping_all_resources()

    return {
        "sync_results": sync_results,
        "ping_count": len(ping_results),
        "dashboard": build_dashboard_response(),
    }


# --- CDN Resources API ---

@app.post("/api/resources", status_code=status.HTTP_201_CREATED)
async def create_resource_endpoint(payload: ResourceCreate):
    acc = db.get_account(payload.account_id)
    if not acc:
        raise HTTPException(status_code=400, detail="Specified account_id does not exist")
    res = db.create_resource(payload.model_dump())
    # Fire off an async healthcheck ping
    asyncio.create_task(notifier.ping_single_resource(res))
    return res


@app.put("/api/resources/{resource_id}")
async def update_resource_endpoint(resource_id: str, payload: ResourceUpdate):
    res = db.update_resource(resource_id, payload.model_dump(exclude_unset=True))
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    return res


@app.patch("/api/resources/{resource_id}/consumer")
async def update_resource_consumer_endpoint(
    resource_id: str, payload: ResourceConsumerUpdate
):
    """Instant 1-tap update of consumer (misha, max, split) and returns updated dashboard."""
    res = db.update_resource_consumer(resource_id, payload.consumer)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    return {
        "success": True,
        "resource": res,
        "dashboard": build_dashboard_response(),
    }


@app.delete("/api/resources/{resource_id}")
async def delete_resource_endpoint(resource_id: str):
    success = db.delete_resource(resource_id)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"success": True, "id": resource_id}


@app.post("/api/resources/{resource_id}/ping")
async def ping_single_resource_endpoint(resource_id: str):
    res = db.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    ping_result = await notifier.ping_single_resource(res)
    return ping_result


# --- Settlements & "Оплатил" Mutual Offset Engine ---

@app.post("/api/settle")
async def settle_balances_endpoint(payload: dict[str, Any] | None = None):
    """Performs the 'Оплатил' (Settle Up) action:
    1. Computes current unsettled debt and per-resource cumulative costs.
    2. Takes snapshot of all current resource watermarks (paid_watermark_gb, paid_watermark_cost).
    3. Writes a settlement entry in the database.
    4. Advances paid_watermark_gb = total_gb and paid_watermark_cost = cumulative_cost.
    5. Sends Telegram notification to all registered bots.
    6. Returns the settlement summary and fresh dashboard state.
    """
    dash = build_dashboard_response()
    split = dash.splitwise

    # Snapshot existing watermarks for undo
    snapshot: dict[str, dict[str, float]] = {}
    all_resources = db.get_resources()
    for r in all_resources:
        snapshot[r["id"]] = {
            "paid_watermark_gb": float(r.get("paid_watermark_gb", 0.0)),
            "paid_watermark_cost": float(r.get("paid_watermark_cost", 0.0)),
        }

    note = (payload or {}).get("note")
    settlement = db.create_settlement(
        misha_owes_max=split.misha_owes_max,
        max_owes_misha=split.max_owes_misha,
        net_balance=split.net_balance,
        snapshot=snapshot,
        note=note,
    )

    # Advance watermarks for all resources to current cumulative state
    for acc in dash.accounts:
        for res in acc.resources:
            db.update_resource(
                res.id,
                {
                    "paid_watermark_gb": res.total_gb,
                    "paid_watermark_cost": res.current_cumulative_cost,
                },
            )

    # Broadcast notification to Telegram bots
    asyncio.create_task(notifier.notify_settlement_event(settlement))

    fresh_dashboard = build_dashboard_response()
    return {
        "success": True,
        "settlement": settlement,
        "dashboard": fresh_dashboard,
    }


@app.get("/api/settlements")
async def list_settlements(limit: int = 20):
    return db.get_settlements(limit=limit)


@app.post("/api/settlements/undo")
async def undo_settlement_endpoint():
    """Undoes the latest settlement, restoring resource watermarks and deleting the record."""
    restored = db.undo_latest_settlement()
    if not restored:
        raise HTTPException(
            status_code=400, detail="Нет предыдущих взаиморасчетов для отмены"
        )

    fresh_dashboard = build_dashboard_response()
    return {
        "success": True,
        "undone_settlement": restored,
        "dashboard": fresh_dashboard,
    }


# --- Telegram Multi-Bot Management ---

@app.get("/api/telegram")
async def list_telegram_bots():
    bots = db.get_telegram_bots()
    # Mask bot tokens
    safe_bots = []
    for b in bots:
        tok = b["bot_token"]
        masked_tok = tok[:6] + "..." + tok[-4:] if len(tok) > 12 else "••••••••"
        b_copy = dict(b)
        b_copy["bot_token_masked"] = masked_tok
        safe_bots.append(b_copy)
    return safe_bots


@app.post("/api/telegram", status_code=status.HTTP_201_CREATED)
async def create_telegram_bot_endpoint(payload: TelegramBotCreate):
    bot = db.create_telegram_bot(payload.model_dump())
    return bot


@app.put("/api/telegram/{bot_id}")
async def update_telegram_bot_endpoint(bot_id: str, payload: TelegramBotUpdate):
    bot = db.update_telegram_bot(bot_id, payload.model_dump(exclude_unset=True))
    if not bot:
        raise HTTPException(status_code=404, detail="Telegram bot not found")
    return bot


@app.delete("/api/telegram/{bot_id}")
async def delete_telegram_bot_endpoint(bot_id: str):
    success = db.delete_telegram_bot(bot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Telegram bot not found")
    return {"success": True, "id": bot_id}


@app.post("/api/telegram/{bot_id}/test")
async def test_telegram_bot_endpoint(bot_id: str):
    bot = db.get_telegram_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Telegram bot not found")

    test_msg = (
        f"🤖 <b>Тестовое уведомление CDN Splitwise</b>\n\n"
        f"Успешное подключение бота: <b>{bot['name']}</b>\n"
        f"Фильтр владельца: <code>{bot['filter_owner'].upper()}</code>\n"
        f"🕒 <i>{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}</i>\n\n"
        f"Все уведомления по CDN и биллингу настроены корректно!"
    )
    ok, error = await notifier.send_telegram_raw(
        bot["bot_token"], bot["chat_id"], test_msg
    )
    if not ok:
        return {"success": False, "error": error}
    return {"success": True, "message": "Тестовое сообщение успешно отправлено в Telegram"}


# --- Demo Data Seed / Reset ---

@app.post("/api/demo/reset")
async def reset_demo_data_endpoint():
    db.seed_demo_data(force=True)
    return {
        "success": True,
        "message": "Демо-данные успешно восстановлены",
        "dashboard": build_dashboard_response(),
    }
