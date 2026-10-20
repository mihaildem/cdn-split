"""API endpoints for transfers, settlement workflow, history, and CSV export."""

from __future__ import annotations

import csv
import io
import time
from typing import Any
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel

from app import db

router = APIRouter(tags=["transfers"])


class TransferCreate(BaseModel):
    from_member: str
    to_member: str
    amount_kop: int | None = None
    amount_rub: float | None = None
    note: str | None = None
    status: str = "pending"


@router.post("/api/transfers", status_code=status.HTTP_201_CREATED)
async def create_transfer_endpoint(payload: TransferCreate):
    if payload.amount_kop is not None:
        amount_kop = payload.amount_kop
    elif payload.amount_rub is not None:
        amount_kop = int(round(payload.amount_rub * 100))
    else:
        raise HTTPException(status_code=400, detail="amount_kop or amount_rub is required")

    tr = db.create_transfer(
        from_member=payload.from_member,
        to_member=payload.to_member,
        amount_kop=amount_kop,
        status=payload.status,
        note=payload.note,
    )
    db.add_audit_log(
        action="create_transfer",
        entity="transfer",
        before=None,
        after=tr,
    )
    return tr


@router.get("/api/transfers")
async def list_transfers_endpoint(limit: int = 50):
    return db.get_all_transfers(limit=limit)


@router.post("/api/transfers/{transfer_id}/confirm")
async def confirm_transfer_endpoint(transfer_id: str):
    tr_before = db.get_transfer(transfer_id)
    if not tr_before:
        raise HTTPException(status_code=404, detail="Transfer not found")

    tr_after = db.confirm_transfer(transfer_id)
    db.add_audit_log(
        action="confirm_transfer",
        entity="transfer",
        before=tr_before,
        after=tr_after,
    )
    return tr_after


@router.post("/api/transfers/{transfer_id}/reject")
async def reject_transfer_endpoint(transfer_id: str):
    tr_before = db.get_transfer(transfer_id)
    if not tr_before:
        raise HTTPException(status_code=404, detail="Transfer not found")

    tr_after = db.reject_transfer(transfer_id)
    db.add_audit_log(
        action="reject_transfer",
        entity="transfer",
        before=tr_before,
        after=tr_after,
    )
    return tr_after


@router.post("/api/transfers/{transfer_id}/cancel")
async def cancel_transfer_endpoint(transfer_id: str):
    tr_before = db.get_transfer(transfer_id)
    if not tr_before:
        raise HTTPException(status_code=404, detail="Transfer not found")

    cancelled = db.cancel_latest_transfer()
    if not cancelled:
        raise HTTPException(status_code=400, detail="Only latest confirmed transfer can be cancelled")

    db.add_audit_log(
        action="cancel_transfer",
        entity="transfer",
        before=tr_before,
        after=cancelled,
    )
    return cancelled


@router.get("/api/history")
async def get_history(limit: int = 50):
    return {
        "transfers": db.get_all_transfers(limit=limit),
        "audit_log": db.get_audit_logs(limit=limit),
    }


@router.get("/api/history.csv")
async def export_history_csv():
    transfers = db.get_all_transfers(limit=500)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["date", "from", "to", "sum_rub", "how"])

    for tr in transfers:
        raw_date = tr.get("confirmed_at") or tr.get("created_at") or ""
        date_str = raw_date[:10] if len(raw_date) >= 10 else raw_date
        writer.writerow([
            date_str,
            tr.get("from_member", ""),
            tr.get("to_member", ""),
            f"{float(tr.get('amount_rub', 0.0)):.2f}",
            tr.get("status", ""),
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=history.csv"},
    )
