"""CDN resources repository."""

from __future__ import annotations

import time
from typing import Any
import uuid

from app.repositories.connection import get_conn


def _row_to_resource(row: Any) -> dict[str, Any]:
    d = dict(row)
    d["is_manual"] = bool(d["is_manual"])
    return d


def get_all_resources() -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cdn_resources ORDER BY domain ASC")
        return [_row_to_resource(r) for r in cursor.fetchall()]


def get_resources_by_account(account_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM cdn_resources WHERE account_id = ? ORDER BY domain ASC",
            (account_id,),
        )
        return [_row_to_resource(r) for r in cursor.fetchall()]


def get_resources(account_id: str | None = None) -> list[dict[str, Any]]:
    if account_id:
        return get_resources_by_account(account_id)
    return get_all_resources()


def get_resource(resource_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cdn_resources WHERE id = ?", (resource_id,))
        row = cursor.fetchone()
        return _row_to_resource(row) if row else None


def create_resource(data: dict[str, Any]) -> dict[str, Any]:
    res_id = data.get("id") or f"res_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO cdn_resources (
                id, account_id, provider_resource_id, domain, cname,
                status, consumer, total_gb, paid_watermark_gb, paid_watermark_cost,
                custom_cost_rub, check_path, expected_codes, http_status,
                http_code, http_latency_ms, last_checked_at, check_error,
                is_manual, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                res_id, data["account_id"], data.get("provider_resource_id"),
                data["domain"], data.get("cname"), data.get("status", "active"),
                data.get("consumer", "split"), float(data.get("total_gb", 0.0)),
                float(data.get("paid_watermark_gb", 0.0)), float(data.get("paid_watermark_cost", 0.0)),
                data.get("custom_cost_rub"), data.get("check_path", "/"),
                data.get("expected_codes", "200,204,301,302,400,404"),
                data.get("http_status", "unknown"), data.get("http_code"),
                data.get("http_latency_ms"), data.get("last_checked_at"),
                data.get("check_error"), 1 if data.get("is_manual") else 0,
                now, now,
            ),
        )
        conn.commit()
    return get_resource(res_id)  # type: ignore


def update_resource(resource_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_resource(resource_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields: list[str] = []
    values: list[Any] = []

    for k, v in updates.items():
        if k in (
            "domain", "cname", "status", "consumer", "total_gb",
            "paid_watermark_gb", "paid_watermark_cost", "custom_cost_rub",
            "check_path", "expected_codes", "http_status", "http_code",
            "http_latency_ms", "last_checked_at", "check_error", "is_manual",
        ):
            fields.append(f"{k} = ?")
            values.append(1 if (k == "is_manual" and v) else v)

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(resource_id)

    query = f"UPDATE cdn_resources SET {', '.join(fields)} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_resource(resource_id)


def update_resource_consumer(resource_id: str, consumer: str) -> dict[str, Any] | None:
    return update_resource(resource_id, {"consumer": consumer})


def update_resource_health(
    resource_id: str,
    http_status: str,
    http_code: int | None,
    http_latency_ms: float | None,
    check_error: str | None,
) -> None:
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with get_conn() as conn:
        conn.execute(
            """UPDATE cdn_resources
               SET http_status = ?, http_code = ?, http_latency_ms = ?,
                   check_error = ?, last_checked_at = ?, updated_at = ?
               WHERE id = ?""",
            (http_status, http_code, http_latency_ms, check_error, now, now, resource_id),
        )
        conn.commit()


def upsert_synced_resource(
    account_id: str,
    domain: str,
    cname: str | None = None,
    total_gb: float = 0.0,
    status: str = "active",
    provider_resource_id: str | None = None,
) -> dict[str, Any]:
    current_resources = get_resources_by_account(account_id)
    existing = next((r for r in current_resources if r["domain"] == domain), None)
    if existing:
        updates = {"total_gb": total_gb}
        if cname:
            updates["cname"] = cname
        return update_resource(existing["id"], updates)  # type: ignore
    return create_resource({
        "account_id": account_id,
        "provider_resource_id": provider_resource_id,
        "domain": domain,
        "cname": cname,
        "status": status,
        "total_gb": total_gb,
        "consumer": "split",
    })


def delete_resource(resource_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cdn_resources WHERE id = ?", (resource_id,))
        conn.commit()
        return cursor.rowcount > 0
