"""Settlements and watermark mutual-offset API endpoints."""

from __future__ import annotations

import asyncio
from typing import Any
from fastapi import APIRouter, HTTPException

from app import db, notifier
from app.api.dashboard import build_dashboard_response

router = APIRouter(tags=["settlements"])


@router.post("/api/settle")
async def settle_balances_endpoint(payload: dict[str, Any] | None = None):
    dash = build_dashboard_response()
    split = dash.splitwise

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

    for acc in dash.accounts:
        for res in acc.resources:
            db.update_resource(
                res.id,
                {
                    "paid_watermark_gb": res.total_gb,
                    "paid_watermark_cost": res.current_cumulative_cost,
                },
            )

    asyncio.create_task(notifier.notify_settlement_event(settlement))

    fresh_dashboard = build_dashboard_response()
    return {
        "success": True,
        "settlement": settlement,
        "dashboard": fresh_dashboard,
    }


@router.get("/api/settlements")
async def list_settlements(limit: int = 20):
    return db.get_settlements(limit=limit)


@router.post("/api/settlements/undo")
async def undo_settlement_endpoint():
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
