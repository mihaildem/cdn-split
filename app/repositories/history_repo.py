"""Repositories for payer/consumer histories, daily traffic, transfers, and audit log."""

from __future__ import annotations

import json
import time
from typing import Any
import uuid

from app.repositories.connection import get_conn


def add_payer_history(account_id: str, member_id: str, effective_from: str | None = None) -> dict[str, Any]:
    today = effective_from or time.strftime("%Y-%m-%d", time.gmtime())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO account_payer_history (id, account_id, member_id, effective_from, created_at) VALUES (?, ?, ?, ?, ?)",
            (entry_id, account_id, member_id, today, now),
        )
        conn.commit()
    return {"id": entry_id, "account_id": account_id, "member_id": member_id, "effective_from": today, "created_at": now}


def get_payer_history(account_id: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        if account_id:
            cursor.execute("SELECT * FROM account_payer_history WHERE account_id = ? ORDER BY effective_from ASC, created_at ASC", (account_id,))
        else:
            cursor.execute("SELECT * FROM account_payer_history ORDER BY effective_from ASC, created_at ASC")
        return [dict(r) for r in cursor.fetchall()]


def add_consumer_history(resource_id: str, mode: str, member_id: str | None = None, effective_from: str | None = None) -> dict[str, Any]:
    today = effective_from or time.strftime("%Y-%m-%d", time.gmtime())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO resource_consumer_history (id, resource_id, mode, member_id, effective_from, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (entry_id, resource_id, mode, member_id, today, now),
        )
        conn.commit()
    return {"id": entry_id, "resource_id": resource_id, "mode": mode, "member_id": member_id, "effective_from": today, "created_at": now}


def get_consumer_history(resource_id: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        if resource_id:
            cursor.execute("SELECT * FROM resource_consumer_history WHERE resource_id = ? ORDER BY effective_from ASC, created_at ASC", (resource_id,))
        else:
            cursor.execute("SELECT * FROM resource_consumer_history ORDER BY effective_from ASC, created_at ASC")
        return [dict(r) for r in cursor.fetchall()]


def record_daily_traffic(resource_id: str, date: str, gb: float, bytes_count: int | None = None) -> dict[str, Any]:
    b_count = bytes_count if bytes_count is not None else int(round(gb * 1_000_000_000))
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    entry_id = str(uuid.uuid4())
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO traffic_daily (id, resource_id, date, bytes, gb, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            (entry_id, resource_id, date, b_count, gb, now),
        )
        conn.commit()
    return {"id": entry_id, "resource_id": resource_id, "date": date, "bytes": b_count, "gb": gb, "fetched_at": now}


def get_traffic_daily(resource_id: str | None = None, limit_days: int = 14) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        if resource_id:
            cursor.execute("SELECT * FROM traffic_daily WHERE resource_id = ? ORDER BY date DESC LIMIT ?", (resource_id, limit_days))
        else:
            cursor.execute("SELECT * FROM traffic_daily ORDER BY date DESC LIMIT ?", (limit_days * 10,))
        rows = [dict(r) for r in cursor.fetchall()]
        rows.reverse()
        return rows


def get_traffic_14d_array(resource_id: str) -> list[float]:
    rows = get_traffic_daily(resource_id, limit_days=14)
    if not rows:
        return [0.0] * 14
    values = [float(r["gb"]) for r in rows]
    if len(values) < 14:
        values = [0.0] * (14 - len(values)) + values
    return values[-14:]


def create_transfer(from_member: str, to_member: str, amount_kop: int, status: str = "pending", note: str | None = None, created_by: str | None = None) -> dict[str, Any]:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    transfer_id = str(uuid.uuid4())
    amount_rub = round(amount_kop / 100.0, 2)
    confirmed_at = now if status == "confirmed" else None
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO transfers (id, from_member, to_member, amount_kop, amount_rub, status, note, created_by, confirmed_by, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (transfer_id, from_member, to_member, amount_kop, amount_rub, status, note, created_by, created_by if status == "confirmed" else None, now, confirmed_at),
        )
        conn.commit()
    return get_transfer(transfer_id) or {}


def get_transfer(transfer_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transfers WHERE id = ?", (transfer_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_all_transfers(limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transfers ORDER BY created_at DESC LIMIT ?", (limit,))
        return [dict(r) for r in cursor.fetchall()]


def confirm_transfer(transfer_id: str, confirmed_by: str | None = None) -> dict[str, Any] | None:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with get_conn() as conn:
        conn.execute("UPDATE transfers SET status = 'confirmed', confirmed_by = ?, confirmed_at = ? WHERE id = ?", (confirmed_by, now, transfer_id))
        conn.commit()
    return get_transfer(transfer_id)


def reject_transfer(transfer_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        conn.execute("UPDATE transfers SET status = 'rejected' WHERE id = ?", (transfer_id,))
        conn.commit()
    return get_transfer(transfer_id)


def cancel_latest_transfer() -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM transfers WHERE status = 'confirmed' ORDER BY confirmed_at DESC, created_at DESC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return None
        t_id = row[0]
        conn.execute("UPDATE transfers SET status = 'cancelled' WHERE id = ?", (t_id,))
        conn.commit()
    return get_transfer(t_id)


def add_audit_log(action: str, entity: str, before: Any = None, after: Any = None, user_id: str | None = None) -> dict[str, Any]:
    entry_id = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    b_json = json.dumps(before, ensure_ascii=False) if before is not None else None
    a_json = json.dumps(after, ensure_ascii=False) if after is not None else None
    with get_conn() as conn:
        conn.execute("INSERT INTO audit_log (id, user_id, action, entity, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (entry_id, user_id, action, entity, b_json, a_json, now))
        conn.commit()
    return {"id": entry_id, "user_id": user_id, "action": action, "entity": entity, "before": before, "after": after, "created_at": now}


def get_audit_logs(limit: int = 50) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["before"] = json.loads(d["before_json"]) if d.get("before_json") else None
            d["after"] = json.loads(d["after_json"]) if d.get("after_json") else None
            result.append(d)
        return result
