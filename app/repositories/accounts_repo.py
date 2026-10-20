"""Accounts repository with encryption at rest and token preservation."""

from __future__ import annotations

import time
from typing import Any
import uuid

from app import crypto
from app.repositories.connection import get_conn

SECRET_FIELD_KEYS = {
    "api_token", "oauth_token", "api_key", "password", "token", "iam_token", "secret_key"
}


def mask_credentials(creds: dict[str, Any]) -> dict[str, Any]:
    return crypto.mask_credentials_dict(creds)


def merge_incoming_credentials(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    return crypto.merge_incoming_credentials(existing, incoming)


def _row_to_account(row: Any) -> dict[str, Any]:
    d = dict(row)
    d["credentials"] = crypto.decrypt_credentials(d.pop("credentials_json", "{}") or "{}")
    d["ignore_bonus"] = bool(d["ignore_bonus"])
    return d


def get_all_accounts() -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts ORDER BY created_at ASC")
        return [_row_to_account(r) for r in cursor.fetchall()]


get_accounts = get_all_accounts


def get_account(account_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = cursor.fetchone()
        return _row_to_account(row) if row else None


def create_account(data: dict[str, Any]) -> dict[str, Any]:
    acc_id = data.get("id") or f"acc_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    encrypted_creds = crypto.encrypt_credentials(data.get("credentials", {}))

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO accounts (
                id, provider, name, payer, credentials_json, balance_rub,
                bonus_balance_rub, currency, account_identifier, free_tier_gb,
                price_per_gb, package_cost_rub, ignore_bonus, low_balance_threshold,
                sync_status, sync_error, last_synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                acc_id, data["provider"], data["name"], data.get("payer", "misha"),
                encrypted_creds, float(data.get("balance_rub", 0.0)),
                float(data.get("bonus_balance_rub", 0.0)), data.get("currency", "RUB"),
                data.get("account_identifier"), float(data.get("free_tier_gb", 0.0)),
                float(data.get("price_per_gb", 1.50)), float(data.get("package_cost_rub", 0.0)),
                1 if data.get("ignore_bonus") else 0, float(data.get("low_balance_threshold", 200.0)),
                data.get("sync_status", "ok"), data.get("sync_error"),
                data.get("last_synced_at"), now, now,
            ),
        )
        conn.commit()
    return get_account(acc_id)  # type: ignore


def update_account(account_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_account(account_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields: list[str] = []
    values: list[Any] = []

    for k, v in updates.items():
        if v is None:
            continue
        if k == "credentials":
            merged = merge_incoming_credentials(current.get("credentials", {}), v)
            fields.append("credentials_json = ?")
            values.append(crypto.encrypt_credentials(merged))
        elif k == "ignore_bonus":
            fields.append("ignore_bonus = ?")
            values.append(1 if v else 0)
        elif k in (
            "name", "payer", "balance_rub", "bonus_balance_rub", "currency",
            "account_identifier", "free_tier_gb", "price_per_gb", "package_cost_rub",
            "low_balance_threshold", "sync_status", "sync_error", "last_synced_at"
        ):
            fields.append(f"{k} = ?")
            values.append(v)

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(account_id)

    query = f"UPDATE accounts SET {', '.join(fields)} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_account(account_id)


def update_account_sync_result(
    account_id: str,
    success: bool,
    balance_rub: float = 0.0,
    bonus_balance_rub: float = 0.0,
    account_identifier: str | None = None,
    error: str | None = None,
) -> dict[str, Any] | None:
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if success:
        updates: dict[str, Any] = {
            "sync_status": "ok",
            "sync_error": None,
            "last_synced_at": now_str,
        }
        if account_identifier != "demo-client@domain.ru":
            updates["balance_rub"] = balance_rub
            updates["bonus_balance_rub"] = bonus_balance_rub
            if account_identifier:
                updates["account_identifier"] = account_identifier
        return update_account(account_id, updates)
    else:
        return update_account(
            account_id,
            {"sync_status": "error", "sync_error": error, "last_synced_at": now_str},
        )


def delete_account(account_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()
        return cursor.rowcount > 0
