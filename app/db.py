"""SQLite database operations, schema migrations, and demo data seed."""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any

from app import crypto


def get_db_path() -> str:
    data_dir = os.environ.get("DATA_DIR")
    if not data_dir:
        # Check current working directory or stacks/cdn-split/data
        if os.path.exists("./data"):
            data_dir = "./data"
        elif os.path.exists("./stacks/cdn-split/data"):
            data_dir = "./stacks/cdn-split/data"
        else:
            data_dir = "./data"
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "cdn_split.db")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Initialize database tables and constraints."""
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                name TEXT NOT NULL,
                payer TEXT NOT NULL DEFAULT 'misha',
                credentials_json TEXT NOT NULL DEFAULT '{}',
                balance_rub REAL NOT NULL DEFAULT 0.0,
                bonus_balance_rub REAL NOT NULL DEFAULT 0.0,
                currency TEXT NOT NULL DEFAULT 'RUB',
                account_identifier TEXT,
                free_tier_gb REAL NOT NULL DEFAULT 0.0,
                price_per_gb REAL NOT NULL DEFAULT 1.50,
                package_cost_rub REAL NOT NULL DEFAULT 0.0,
                ignore_bonus INTEGER NOT NULL DEFAULT 0,
                low_balance_threshold REAL NOT NULL DEFAULT 200.0,
                sync_status TEXT NOT NULL DEFAULT 'ok',
                sync_error TEXT,
                last_synced_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cdn_resources (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                provider_resource_id TEXT,
                domain TEXT NOT NULL,
                cname TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                consumer TEXT NOT NULL DEFAULT 'split',
                total_gb REAL NOT NULL DEFAULT 0.0,
                paid_watermark_gb REAL NOT NULL DEFAULT 0.0,
                paid_watermark_cost REAL NOT NULL DEFAULT 0.0,
                custom_cost_rub REAL,
                check_path TEXT NOT NULL DEFAULT '/',
                expected_codes TEXT NOT NULL DEFAULT '200,204,301,302,400,404',
                http_status TEXT NOT NULL DEFAULT 'unknown',
                http_code INTEGER,
                http_latency_ms REAL,
                last_checked_at TEXT,
                check_error TEXT,
                is_manual INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settlements (
                id TEXT PRIMARY KEY,
                settled_at TEXT NOT NULL,
                misha_owes_max REAL NOT NULL,
                max_owes_misha REAL NOT NULL,
                net_balance REAL NOT NULL,
                note TEXT,
                snapshot_json TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telegram_bots (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                bot_token TEXT NOT NULL,
                chat_id TEXT NOT NULL,
                filter_owner TEXT NOT NULL DEFAULT 'all',
                notify_low_balance INTEGER NOT NULL DEFAULT 1,
                notify_api_error INTEGER NOT NULL DEFAULT 1,
                notify_cdn_down INTEGER NOT NULL DEFAULT 1,
                notify_settlement INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notification_cooldowns (
                alert_key TEXT PRIMARY KEY,
                last_sent_at REAL NOT NULL
            )
        """)

        conn.commit()


# --- Accounts CRUD ---

def get_accounts() -> list[dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts ORDER BY created_at ASC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["credentials"] = crypto.decrypt_credentials(d.pop("credentials_json", "{}") or "{}")
            d["ignore_bonus"] = bool(d["ignore_bonus"])
            result.append(d)
        return result


def get_account(account_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["credentials"] = crypto.decrypt_credentials(d.pop("credentials_json", "{}") or "{}")
        d["ignore_bonus"] = bool(d["ignore_bonus"])
        return d


def create_account(data: dict[str, Any]) -> dict[str, Any]:
    acc_id = data.get("id") or f"acc_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    encrypted_creds = crypto.encrypt_credentials(data.get("credentials", {}))

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO accounts (
                id, provider, name, payer, credentials_json, balance_rub,
                bonus_balance_rub, currency, account_identifier, free_tier_gb,
                price_per_gb, package_cost_rub, ignore_bonus, low_balance_threshold,
                sync_status, sync_error, last_synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                acc_id,
                data["provider"],
                data["name"],
                data.get("payer", "misha"),
                encrypted_creds,
                float(data.get("balance_rub", 0.0)),
                float(data.get("bonus_balance_rub", 0.0)),
                data.get("currency", "RUB"),
                data.get("account_identifier"),
                float(data.get("free_tier_gb", 0.0)),
                float(data.get("price_per_gb", 1.50)),
                float(data.get("package_cost_rub", 0.0)),
                1 if data.get("ignore_bonus") else 0,
                float(data.get("low_balance_threshold", 200.0)),
                data.get("sync_status", "ok"),
                data.get("sync_error"),
                data.get("last_synced_at"),
                now,
                now,
            ),
        )
        conn.commit()
    return get_account(acc_id)  # type: ignore


def update_account(account_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_account(account_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields = []
    values = []

    for k, v in updates.items():
        if v is None:
            continue
        if k == "credentials":
            merged_creds = crypto.merge_incoming_credentials(
                current.get("credentials", {}), v
            )
            fields.append("credentials_json = ?")
            values.append(crypto.encrypt_credentials(merged_creds))
        elif k == "ignore_bonus":
            fields.append("ignore_bonus = ?")
            values.append(1 if v else 0)
        elif k in (
            "name",
            "payer",
            "balance_rub",
            "bonus_balance_rub",
            "currency",
            "account_identifier",
            "free_tier_gb",
            "price_per_gb",
            "package_cost_rub",
            "low_balance_threshold",
            "sync_status",
            "sync_error",
            "last_synced_at",
        ):
            fields.append(f"{k} = ?")
            values.append(v)

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(account_id)

    query = f"UPDATE accounts SET {', '.join(fields)} WHERE id = ?"
    with get_connection() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_account(account_id)


def delete_account(account_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        conn.commit()
        return cursor.rowcount > 0


# --- CDN Resources CRUD ---

def get_resources(account_id: str | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        if account_id:
            cursor.execute(
                "SELECT * FROM cdn_resources WHERE account_id = ? ORDER BY domain ASC",
                (account_id,),
            )
        else:
            cursor.execute("SELECT * FROM cdn_resources ORDER BY domain ASC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["is_manual"] = bool(d["is_manual"])
            result.append(d)
        return result


def get_resource(resource_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cdn_resources WHERE id = ?", (resource_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_manual"] = bool(d["is_manual"])
        return d


def create_resource(data: dict[str, Any]) -> dict[str, Any]:
    res_id = data.get("id") or f"res_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO cdn_resources (
                id, account_id, provider_resource_id, domain, cname,
                status, consumer, total_gb, paid_watermark_gb, paid_watermark_cost,
                custom_cost_rub, check_path, expected_codes, http_status,
                http_code, http_latency_ms, last_checked_at, check_error,
                is_manual, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                res_id,
                data["account_id"],
                data.get("provider_resource_id"),
                data["domain"],
                data.get("cname"),
                data.get("status", "active"),
                data.get("consumer", "split"),
                float(data.get("total_gb", 0.0)),
                float(data.get("paid_watermark_gb", 0.0)),
                float(data.get("paid_watermark_cost", 0.0)),
                data.get("custom_cost_rub"),
                data.get("check_path", "/"),
                data.get("expected_codes", "200,204,301,302,400,404"),
                data.get("http_status", "unknown"),
                data.get("http_code"),
                data.get("http_latency_ms"),
                data.get("last_checked_at"),
                data.get("check_error"),
                1 if data.get("is_manual") else 0,
                now,
                now,
            ),
        )
        conn.commit()
    return get_resource(res_id)  # type: ignore


def update_resource(resource_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_resource(resource_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields = []
    values = []

    for k, v in updates.items():
        if k in (
            "domain",
            "cname",
            "status",
            "consumer",
            "total_gb",
            "paid_watermark_gb",
            "paid_watermark_cost",
            "custom_cost_rub",
            "check_path",
            "expected_codes",
            "http_status",
            "http_code",
            "http_latency_ms",
            "last_checked_at",
            "check_error",
            "is_manual",
        ):
            fields.append(f"{k} = ?")
            values.append(1 if (k == "is_manual" and v) else v)

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(resource_id)

    query = f"UPDATE cdn_resources SET {', '.join(fields)} WHERE id = ?"
    with get_connection() as conn:
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
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE cdn_resources
            SET http_status = ?, http_code = ?, http_latency_ms = ?,
                check_error = ?, last_checked_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (http_status, http_code, http_latency_ms, check_error, now, now, resource_id),
        )
        conn.commit()


def delete_resource(resource_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cdn_resources WHERE id = ?", (resource_id,))
        conn.commit()
        return cursor.rowcount > 0


# --- Telegram Bots CRUD ---

def get_telegram_bots() -> list[dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM telegram_bots ORDER BY created_at ASC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["bot_token"] = crypto.decrypt_text(d["bot_token"])
            d["notify_low_balance"] = bool(d["notify_low_balance"])
            d["notify_api_error"] = bool(d["notify_api_error"])
            d["notify_cdn_down"] = bool(d["notify_cdn_down"])
            d["notify_settlement"] = bool(d["notify_settlement"])
            result.append(d)
        return result


def get_telegram_bot(bot_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM telegram_bots WHERE id = ?", (bot_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["bot_token"] = crypto.decrypt_text(d["bot_token"])
        d["notify_low_balance"] = bool(d["notify_low_balance"])
        d["notify_api_error"] = bool(d["notify_api_error"])
        d["notify_cdn_down"] = bool(d["notify_cdn_down"])
        d["notify_settlement"] = bool(d["notify_settlement"])
        return d


def create_telegram_bot(data: dict[str, Any]) -> dict[str, Any]:
    bot_id = data.get("id") or f"bot_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    encrypted_token = crypto.encrypt_text(str(data["bot_token"]).strip())

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO telegram_bots (
                id, name, bot_token, chat_id, filter_owner,
                notify_low_balance, notify_api_error, notify_cdn_down,
                notify_settlement, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bot_id,
                data["name"],
                encrypted_token,
                str(data["chat_id"]),
                data.get("filter_owner", "all"),
                1 if data.get("notify_low_balance", True) else 0,
                1 if data.get("notify_api_error", True) else 0,
                1 if data.get("notify_cdn_down", True) else 0,
                1 if data.get("notify_settlement", True) else 0,
                now,
                now,
            ),
        )
        conn.commit()
    return get_telegram_bot(bot_id)  # type: ignore


def update_telegram_bot(bot_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_telegram_bot(bot_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields = []
    values = []

    for k, v in updates.items():
        if v is None:
            continue
        if k in ("notify_low_balance", "notify_api_error", "notify_cdn_down", "notify_settlement"):
            fields.append(f"{k} = ?")
            values.append(1 if v else 0)
        elif k == "bot_token":
            v_str = str(v).strip()
            # If user submitted a masked token or empty, preserve existing
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
    with get_connection() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_telegram_bot(bot_id)


def delete_telegram_bot(bot_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM telegram_bots WHERE id = ?", (bot_id,))
        conn.commit()
        return cursor.rowcount > 0


# --- Settlements & Watermark Engine ---

def create_settlement(
    misha_owes_max: float,
    max_owes_misha: float,
    net_balance: float,
    snapshot: dict[str, dict[str, float]],
    note: str | None = None,
) -> dict[str, Any]:
    settlement_id = f"stl_{uuid.uuid4().hex[:8]}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    snapshot_json = json.dumps(snapshot)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO settlements (
                id, settled_at, misha_owes_max, max_owes_misha,
                net_balance, note, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                settlement_id,
                now,
                misha_owes_max,
                max_owes_misha,
                net_balance,
                note,
                snapshot_json,
            ),
        )
        conn.commit()

    return {
        "id": settlement_id,
        "settled_at": now,
        "misha_owes_max": misha_owes_max,
        "max_owes_misha": max_owes_misha,
        "net_balance": net_balance,
        "note": note,
    }


def get_settlements(limit: int = 20) -> list[dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, settled_at, misha_owes_max, max_owes_misha, net_balance, note FROM settlements ORDER BY settled_at DESC LIMIT ?",
            (limit,),
        )
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def get_latest_settlement() -> dict[str, Any] | None:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settlements ORDER BY settled_at DESC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["snapshot"] = json.loads(d.pop("snapshot_json", "{}") or "{}")
        return d


def undo_latest_settlement() -> dict[str, Any] | None:
    """Restores resource watermarks from the latest settlement and deletes the record."""
    latest = get_latest_settlement()
    if not latest:
        return None

    snapshot = latest["snapshot"]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with get_connection() as conn:
        cursor = conn.cursor()
        # Restore watermarks
        for res_id, marks in snapshot.items():
            cursor.execute(
                """
                UPDATE cdn_resources
                SET paid_watermark_gb = ?, paid_watermark_cost = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    float(marks.get("paid_watermark_gb", 0.0)),
                    float(marks.get("paid_watermark_cost", 0.0)),
                    now,
                    res_id,
                ),
            )
        # Delete settlement record
        cursor.execute("DELETE FROM settlements WHERE id = ?", (latest["id"],))
        conn.commit()

    return latest


# --- Alert Cooldowns ---

def check_and_update_cooldown(alert_key: str, cooldown_seconds: int = 3600) -> bool:
    """Returns True if alert can be sent (cooldown expired), and updates last_sent_at."""
    now = time.time()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT last_sent_at FROM notification_cooldowns WHERE alert_key = ?",
            (alert_key,),
        )
        row = cursor.fetchone()
        if row and (now - row[0]) < cooldown_seconds:
            return False  # In cooldown

        cursor.execute(
            """
            INSERT INTO notification_cooldowns (alert_key, last_sent_at)
            VALUES (?, ?)
            ON CONFLICT(alert_key) DO UPDATE SET last_sent_at = excluded.last_sent_at
            """,
            (alert_key, now),
        )
        conn.commit()
        return True


# --- Demo Data Seed ---

def seed_demo_data(force: bool = False) -> None:
    """Seed realistic accounts, resources, and demo bot."""
    accounts = get_accounts()
    if accounts and not force:
        return

    if force:
        with get_connection() as conn:
            conn.execute("DELETE FROM cdn_resources")
            conn.execute("DELETE FROM accounts")
            conn.execute("DELETE FROM settlements")
            conn.execute("DELETE FROM notification_cooldowns")
            conn.commit()

    # 1. Selectel (Payer: Misha)
    sel = create_account({
        "id": "acc_selectel_main",
        "provider": "selectel",
        "name": "Selectel (Основной)",
        "payer": "misha",
        "credentials": {"api_token": "demo_sel_key_77a942"},
        "balance_rub": 1450.0,
        "bonus_balance_rub": 300.0,
        "currency": "RUB",
        "account_identifier": "selectel-28491",
        "free_tier_gb": 100.0,
        "price_per_gb": 1.50,
        "package_cost_rub": 0.0,
        "ignore_bonus": False,
        "low_balance_threshold": 200.0,
        "sync_status": "ok",
    })

    create_resource({
        "id": "res_sel_1",
        "account_id": sel["id"],
        "domain": "api-data3.mdworks.uk",
        "cname": "sel-cdn-942.selectelcdn.ru",
        "status": "active",
        "consumer": "split",
        "total_gb": 42.5,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 28.4,
    })

    create_resource({
        "id": "res_sel_2",
        "account_id": sel["id"],
        "domain": "media-assets.sreda.cc",
        "cname": "sel-cdn-811.selectelcdn.ru",
        "status": "active",
        "consumer": "max",
        "total_gb": 65.0,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 34.1,
    })

    create_resource({
        "id": "res_sel_3",
        "account_id": sel["id"],
        "domain": "cdn-static.mishadev.ru",
        "cname": "sel-cdn-102.selectelcdn.ru",
        "status": "active",
        "consumer": "misha",
        "total_gb": 18.2,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 19.2,
    })

    # 2. VK Cloud (Payer: Max)
    vk = create_account({
        "id": "acc_vk_max",
        "provider": "vk",
        "name": "VK Cloud (Проект Макса)",
        "payer": "max",
        "credentials": {"api_token": "demo_vk_key_99bb12", "project_id": "mcs_proj_8410"},
        "balance_rub": 620.0,
        "bonus_balance_rub": 0.0,
        "currency": "RUB",
        "account_identifier": "mcs_proj_8410",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.40,
        "package_cost_rub": 0.0,
        "ignore_bonus": False,
        "low_balance_threshold": 200.0,
        "sync_status": "ok",
    })

    create_resource({
        "id": "res_vk_1",
        "account_id": vk["id"],
        "domain": "stream-cache.video-cdn.ru",
        "cname": "vkcdn-live-42.mcs.mail.ru",
        "status": "active",
        "consumer": "split",
        "total_gb": 80.0,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 45.0,
    })

    create_resource({
        "id": "res_vk_2",
        "account_id": vk["id"],
        "domain": "heavy-files.maxhub.io",
        "cname": "vkcdn-storage-19.mcs.mail.ru",
        "status": "active",
        "consumer": "max",
        "total_gb": 45.0,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 52.3,
    })

    # 3. Yandex Cloud (Payer: Misha)
    yc = create_account({
        "id": "acc_yc_misha",
        "provider": "yandex",
        "name": "Yandex Cloud (Edge CDN)",
        "payer": "misha",
        "credentials": {"oauth_token": "demo_y0_AgAAA...", "folder_id": "b1g9941a0e1"},
        "balance_rub": 2100.0,
        "bonus_balance_rub": 500.0,
        "currency": "RUB",
        "account_identifier": "b1g9941a0e1",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.20,
        "package_cost_rub": 0.0,
        "ignore_bonus": False,
        "low_balance_threshold": 300.0,
        "sync_status": "ok",
    })

    create_resource({
        "id": "res_yc_1",
        "account_id": yc["id"],
        "domain": "origin-edge.sreda-hub.net",
        "cname": "yc-cdn-cache.yandexcloud.net",
        "status": "active",
        "consumer": "misha",
        "total_gb": 120.0,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 18.7,
    })

    # 4. Timeweb Cloud (Payer: Max, Low Balance)
    tw = create_account({
        "id": "acc_tw_max",
        "provider": "timeweb",
        "name": "Timeweb (Микросервисы)",
        "payer": "max",
        "credentials": {"api_token": "demo_tw_token_1823"},
        "balance_rub": 180.0,  # Below threshold 200
        "bonus_balance_rub": 0.0,
        "currency": "RUB",
        "account_identifier": "tw_client_942",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.60,
        "package_cost_rub": 0.0,
        "ignore_bonus": False,
        "low_balance_threshold": 200.0,
        "sync_status": "ok",
    })

    create_resource({
        "id": "res_tw_1",
        "account_id": tw["id"],
        "domain": "cdn-app.tw-cluster.pro",
        "cname": "twcdn-proxy.timeweb.cloud",
        "status": "active",
        "consumer": "max",
        "total_gb": 30.0,
        "http_status": "up",
        "http_code": 200,
        "http_latency_ms": 31.0,
    })
