"""Section 14 account validation, payer/consumer assignment, and cost breakdown endpoints."""

from __future__ import annotations

import time
from typing import Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app import crypto, db, providers
from app.api.dashboard import build_dashboard_response

router = APIRouter(tags=["account-ops"])


class AccountValidateRequest(BaseModel):
    provider: str
    credentials: dict[str, Any]


class AccountPayerUpdate(BaseModel):
    memberId: str | None = None
    member_id: str | None = None
    payer: str | None = None


class ResourceConsumerPut(BaseModel):
    mode: str | None = None
    memberId: str | None = None
    member_id: str | None = None
    consumer: str | None = None
    effective_from: str | None = None


class ManualUsageResource(BaseModel):
    resource_id: str
    gb: float


class ManualUsageRequest(BaseModel):
    date: str | None = None
    balance_rub: float | None = None
    resources: list[ManualUsageResource] = []


@router.post("/api/accounts/validate")
async def validate_account_credentials(payload: AccountValidateRequest):
    """Validate provider credentials without saving and return a checklist per Section 5.3."""
    res = await providers.test_provider_credentials(payload.provider, payload.credentials)
    if res.success:
        return {
            "key_accepted": True,
            "resources_read": {
                "ok": True,
                "count": len(res.resources) if res.resources else 0,
            },
            "balance_access": {
                "ok": True,
                "balance_rub": res.balance_rub,
            },
            "error": None,
        }
    return {
        "key_accepted": False,
        "resources_read": {"ok": False, "count": 0},
        "balance_access": {"ok": False, "balance_rub": 0.0},
        "error": res.error or "Auth invalid",
    }


@router.put("/api/accounts/{account_id}/payer")
async def update_account_payer(account_id: str, payload: AccountPayerUpdate):
    """Update account payer, record payer_history, and write audit log."""
    m_id = payload.memberId or payload.member_id or payload.payer
    if not m_id:
        raise HTTPException(status_code=400, detail="memberId is required")

    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    old_payer = acc.get("payer")
    db.add_payer_history(account_id, m_id)
    updated = db.update_account(account_id, {"payer": m_id})
    db.add_audit_log(
        action="update_payer",
        entity="account",
        before={"payer": old_payer},
        after={"payer": m_id},
    )
    return crypto.mask_account(updated)


@router.put("/api/resources/{resource_id}/consumer")
async def put_resource_consumer(resource_id: str, payload: ResourceConsumerPut):
    """Update resource consumer, retroactive if unassigned, and record audit log."""
    res = db.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    old_consumer = res.get("consumer", "split")
    if payload.consumer is not None:
        c = payload.consumer
        if c in ("split", "split_all"):
            mode, m_id = "split_all", None
        elif c == "unassigned":
            mode, m_id = "unassigned", None
        else:
            mode, m_id = "member", c
    else:
        mode = payload.mode or "split_all"
        m_id = payload.memberId or payload.member_id

    # Section 7.5: If unassigned -> retroactively assign from first_seen_at
    if old_consumer == "unassigned" and mode != "unassigned":
        eff = res.get("first_seen_at") or time.strftime("%Y-%m-%d", time.gmtime())
    else:
        eff = payload.effective_from or time.strftime("%Y-%m-%d", time.gmtime())

    db.add_consumer_history(resource_id, mode, m_id, effective_from=eff)
    final_consumer = m_id if mode == "member" else mode
    updated_res = db.update_resource_consumer(resource_id, final_consumer)

    db.add_audit_log(
        action="update_consumer",
        entity="resource",
        before={"consumer": old_consumer},
        after={"consumer": final_consumer, "effective_from": eff},
    )

    return {
        "success": True,
        "resource": updated_res,
        "dashboard": build_dashboard_response(),
    }


@router.get("/api/resources/{resource_id}/cost-breakdown")
async def get_resource_cost_breakdown(resource_id: str, period: str | None = None):
    """Return calculation breakdown formula and numbers for 'Как посчитано' per Section 11.1."""
    res = db.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    acc = db.get_account(res["account_id"])
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    all_res = db.get_resources_by_account(acc["id"])
    acc_total_gb = sum(float(r.get("total_gb", 0.0) or 0.0) for r in all_res)
    res_gb = float(res.get("total_gb", 0.0) or 0.0)
    free_gb = float(acc.get("free_tier_gb", 0.0) or 0.0)
    price_rub = float(acc.get("price_per_gb", 1.50) or 1.50)

    if acc_total_gb > 0:
        share = res_gb / acc_total_gb
        free_allocated = min(res_gb, round(free_gb * share, 2))
        billable_gb = max(0.0, round(res_gb - free_allocated, 2))
    else:
        free_allocated = 0.0
        billable_gb = 0.0

    cost_rub = round(billable_gb * price_rub, 2)
    cost_kop = int(round(cost_rub * 100))
    forecast_rub = round(cost_rub * 1.2, 2)

    return {
        "resource_id": resource_id,
        "domain": res["domain"],
        "free_tier_gb": free_gb,
        "account_total_gb": round(acc_total_gb, 2),
        "resource_total_gb": res_gb,
        "free_allocated_gb": free_allocated,
        "billable_gb": billable_gb,
        "price_per_gb_rub": price_rub,
        "bonus_part_rub": 0.0,
        "cost_rub": cost_rub,
        "cost_kop": cost_kop,
        "forecast_rub": forecast_rub,
        "formula": f"{billable_gb:.2f} ГБ × {price_rub:.2f} ₽ = {cost_rub:.2f} ₽",
    }


@router.post("/api/accounts/{account_id}/manual-usage")
async def manual_usage_endpoint(account_id: str, payload: ManualUsageRequest):
    """Fallback manual usage input per Section 5.4."""
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    date_str = payload.date or time.strftime("%Y-%m-%d", time.gmtime())
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    for r_item in payload.resources:
        db.record_daily_traffic(r_item.resource_id, date_str, r_item.gb)
        res = db.get_resource(r_item.resource_id)
        if res:
            new_total = float(res.get("total_gb", 0.0) or 0.0) + r_item.gb
            db.update_resource(r_item.resource_id, {"total_gb": new_total, "is_manual": 1})

    acc_updates: dict[str, Any] = {"last_synced_at": now_str}
    if payload.balance_rub is not None:
        acc_updates["balance_rub"] = payload.balance_rub
    db.update_account(account_id, acc_updates)

    db.add_audit_log(
        action="manual_usage_input",
        entity="account",
        before=None,
        after={"account_id": account_id, "date": date_str, "resources_count": len(payload.resources)},
    )
    return {"success": True, "account_id": account_id, "date": date_str}
