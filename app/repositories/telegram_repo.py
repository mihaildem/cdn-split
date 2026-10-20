"""Telegram bots and notification cooldown repository."""

from __future__ import annotations

import time
from typing import Any
import uuid

from app import crypto
from app.repositories.connection import get_conn


def mask_bot_token(token: str) -> str:
    return crypto.mask_secret_value(token)


def _row_to_bot(row: Any) -> dict[str, Any]:
    d = dict(row)
    d["bot_token"] = crypto.decrypt_text(d["bot_token"])
    d["notify_low_balance"] = bool(d["notify_low_balance"])
    d["notify_api_error"] = bool(d["notify_api_error"])
    d["notify_cdn_down"] = bool(d["notify_cdn_down"])
    d["notify_settlement"] = bool(d["notify_settlement"])
    return d


def get_all_telegram_bots() -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM telegram_bots ORDER BY created_at ASC")
        return [_row_to_bot(r) for r in cursor.fetchall()]


get_telegram_bots = get_all_telegram_bots


def get_telegram_bot(bot_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM telegram_bots WHERE id = ?", (bot_id,))
        row = cursor.fetchone()
        return _row_to_bot(row) if row else None


def create_telegram_bot(data: dict[str, Any]) -> dict[str, Any]:
    bot_id = data.get("id") or f"bot_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    encrypted_token = crypto.encrypt_text(str(data["bot_token"]).strip())

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO telegram_bots (
                id, name, bot_token, chat_id, filter_owner,
                notify_low_balance, notify_api_error, notify_cdn_down,
                notify_settlement, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                bot_id, data["name"], encrypted_token, str(data["chat_id"]),
                data.get("filter_owner", "all"),
                1 if data.get("notify_low_balance", True) else 0,
                1 if data.get("notify_api_error", True) else 0,
                1 if data.get("notify_cdn_down", True) else 0,
                1 if data.get("notify_settlement", True) else 0,
                now, now,
            ),
        )
        conn.commit()
    return get_telegram_bot(bot_id)  # type: ignore


def update_telegram_bot(bot_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_telegram_bot(bot_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields: list[str] = []
    values: list[Any] = []

    for k, v in updates.items():
        if v is None:
            continue
        if k in ("notify_low_balance", "notify_api_error", "notify_cdn_down", "notify_settlement"):
            fields.append(f"{k} = ?")
            values.append(1 if v else 0)
        elif k == "bot_token":
            v_str = str(v).strip()
            if v_str.startswith("••••") or not v_str:
                continue
            fields.append("bot_token = ?")
            values.append(crypto.encrypt_text(v_str))
        elif k in ("name", "chat_id", "filter_owner"):
            fields.append(f"{k} = ?")
            values.append(str(v))

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(bot_id)

    query = f"UPDATE telegram_bots SET {', '.join(fields)} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_telegram_bot(bot_id)


def delete_telegram_bot(bot_id: str) -> bool:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM telegram_bots WHERE id = ?", (bot_id,))
        conn.commit()
        return cursor.rowcount > 0


def check_and_set_cooldown(alert_key: str, cooldown_seconds: int = 3600) -> bool:
    now = time.time()
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT last_sent_at FROM notification_cooldowns WHERE alert_key = ?", (alert_key,))
        row = cursor.fetchone()
        if row and (now - row[0]) < cooldown_seconds:
            return False

        cursor.execute(
            """INSERT INTO notification_cooldowns (alert_key, last_sent_at)
               VALUES (?, ?)
               ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at""",
            (alert_key, now),
        )
        conn.commit()
        return True


check_and_update_cooldown = check_and_set_cooldown
