"""Dashboard, providers, sync, and demo endpoints."""

from __future__ import annotations

import os
import time
from typing import Any
from fastapi import APIRouter

from app import db, notifier, providers
from app.billing import calculate_account_billing, calculate_splitwise_overview
from app.models import DashboardResponse, Participant

router = APIRouter(tags=["dashboard"])


def build_dashboard_response() -> DashboardResponse:
    accounts = db.get_accounts()
    all_resources = db.get_resources()
    participants = db.get_participants()

    res_by_acc: dict[str, list[dict[str, Any]]] = {}
    for r in all_resources:
        res_by_acc.setdefault(r["account_id"], []).append(r)

    account_summaries = []
    for acc in accounts:
        r_list = res_by_acc.get(acc["id"], [])
        acc_summary = calculate_account_billing(acc, r_list)
        account_summaries.append(acc_summary)

    splitwise = calculate_splitwise_overview(account_summaries, participants=participants)
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    return DashboardResponse(
        splitwise=splitwise,
        accounts=account_summaries,
        participants=[Participant(**p) for p in participants],
        last_updated_at=now_str,
    )


@router.get("/api/dashboard", response_model=DashboardResponse)
async def get_dashboard():
    return build_dashboard_response()


@router.get("/api/providers")
async def get_providers():
    return list(providers.PROVIDERS_REGISTRY.values())


@router.get("/api/auth/check")
async def check_auth():
    access_pin = os.environ.get("APP_ACCESS_PIN", "").strip()
    return {
        "auth_required": bool(access_pin),
        "authenticated": True,
    }


@router.post("/api/demo/reset")
async def reset_demo_data_endpoint():
    db.seed_demo_data(force=True)
    return {
        "success": True,
        "message": "Демо-данные успешно восстановлены",
        "dashboard": build_dashboard_response(),
    }


@router.post("/api/sync/all")
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

    ping_results = await notifier.ping_all_resources()

    return {
        "sync_results": sync_results,
        "ping_count": len(ping_results),
        "dashboard": build_dashboard_response(),
    }
