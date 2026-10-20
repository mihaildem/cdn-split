"""Database connection, schema initialization, and demo data seeding."""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any

from app import crypto

DB_PATH: str | None = None


def get_db_path() -> str:
    app_db = sys.modules.get("app.db")
    if app_db and getattr(app_db, "DB_PATH", None):
        return str(app_db.DB_PATH)
    if DB_PATH:
        return DB_PATH
    data_dir = os.environ.get("DATA_DIR")
    if not data_dir:
        data_dir = "./stacks/cdn-split/data" if os.path.exists("./stacks/cdn-split/data") else "./data"
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "cdn_split.db")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


get_connection = get_conn

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL,
    payer TEXT NOT NULL DEFAULT 'misha', credentials_json TEXT NOT NULL DEFAULT '{}',
    balance_rub REAL NOT NULL DEFAULT 0.0, bonus_balance_rub REAL NOT NULL DEFAULT 0.0,
    currency TEXT NOT NULL DEFAULT 'RUB', account_identifier TEXT,
    free_tier_gb REAL NOT NULL DEFAULT 0.0, price_per_gb REAL NOT NULL DEFAULT 1.50,
    package_cost_rub REAL NOT NULL DEFAULT 0.0, ignore_bonus INTEGER NOT NULL DEFAULT 0,
    low_balance_threshold REAL NOT NULL DEFAULT 200.0, sync_status TEXT NOT NULL DEFAULT 'ok',
    sync_error TEXT, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cdn_resources (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_resource_id TEXT,
    domain TEXT NOT NULL, cname TEXT, status TEXT NOT NULL DEFAULT 'active',
    consumer TEXT NOT NULL DEFAULT 'split', total_gb REAL NOT NULL DEFAULT 0.0,
    paid_watermark_gb REAL NOT NULL DEFAULT 0.0, paid_watermark_cost REAL NOT NULL DEFAULT 0.0,
    custom_cost_rub REAL, check_path TEXT NOT NULL DEFAULT '/',
    expected_codes TEXT NOT NULL DEFAULT '200,204,301,302,400,404',
    http_status TEXT NOT NULL DEFAULT 'unknown', http_code INTEGER,
    http_latency_ms REAL, last_checked_at TEXT, check_error TEXT,
    is_manual INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY, settled_at TEXT NOT NULL, misha_owes_max REAL NOT NULL,
    max_owes_misha REAL NOT NULL, net_balance REAL NOT NULL, note TEXT, snapshot_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_bots (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, bot_token TEXT NOT NULL, chat_id TEXT NOT NULL,
    filter_owner TEXT NOT NULL DEFAULT 'all', notify_low_balance INTEGER NOT NULL DEFAULT 1,
    notify_api_error INTEGER NOT NULL DEFAULT 1, notify_cdn_down INTEGER NOT NULL DEFAULT 1,
    notify_settlement INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_cooldowns (
    alert_key TEXT PRIMARY KEY, last_sent_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#38bdf8',
    is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_payer_history (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, member_id TEXT NOT NULL,
    effective_from TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_consumer_history (
    id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, mode TEXT NOT NULL,
    member_id TEXT, effective_from TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS traffic_daily (
    id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, date TEXT NOT NULL,
    bytes INTEGER NOT NULL DEFAULT 0, gb REAL NOT NULL DEFAULT 0.0, fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY, from_member TEXT NOT NULL, to_member TEXT NOT NULL,
    amount_kop INTEGER NOT NULL, amount_rub REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    note TEXT, created_by TEXT, confirmed_by TEXT, created_at TEXT NOT NULL, confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity TEXT NOT NULL,
    before_json TEXT, after_json TEXT, created_at TEXT NOT NULL
);
"""


def init_db() -> None:
    """Initialize database tables and constraints."""
    with get_conn() as conn:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    seed_default_participants()


def seed_default_participants(conn: sqlite3.Connection | None = None) -> None:
    close_after = False
    if conn is None:
        conn = get_conn()
        close_after = True
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM participants")
        if cursor.fetchone()[0] == 0:
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            cursor.execute(
                "INSERT INTO participants (id, name, color, is_default, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
                ("misha", "Миша", "#38bdf8", now, now),
            )
            cursor.execute(
                "INSERT INTO participants (id, name, color, is_default, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
                ("max", "Макс", "#c084fc", now, now),
            )
            conn.commit()
    finally:
        if close_after:
            conn.close()


def load_seed_data_file() -> dict[str, Any]:
    seed_path = Path(__file__).resolve().parent.parent / "data" / "seed_data.json"
    if not seed_path.exists():
        return {}
    with open(seed_path, "r", encoding="utf-8") as f:
        return json.load(f)


def seed_demo_data(force: bool = False) -> None:
    """Seed realistic accounts and resources from seed_data.json."""
    seed_default_participants()
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM accounts")
        if cursor.fetchone()[0] > 0 and not force:
            return

        if force:
            conn.execute("DELETE FROM cdn_resources")
            conn.execute("DELETE FROM accounts")
            conn.execute("DELETE FROM settlements")
            conn.execute("DELETE FROM notification_cooldowns")
            conn.commit()

        data = load_seed_data_file()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        for p in data.get("participants", []):
            cursor.execute(
                """INSERT INTO participants (id, name, color, is_default, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color""",
                (p["id"], p["name"], p.get("color", "#38bdf8"), 1 if p.get("is_default") else 0, now, now),
            )

        for acc in data.get("accounts", []):
            enc_creds = crypto.encrypt_credentials(acc.get("credentials", {}))
            cursor.execute(
                """INSERT OR REPLACE INTO accounts (
                    id, provider, name, payer, credentials_json, balance_rub,
                    bonus_balance_rub, currency, account_identifier, free_tier_gb,
                    price_per_gb, package_cost_rub, ignore_bonus, low_balance_threshold,
                    sync_status, sync_error, last_synced_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    acc["id"], acc["provider"], acc["name"], acc.get("payer", "misha"),
                    enc_creds, float(acc.get("balance_rub", 0.0)), float(acc.get("bonus_balance_rub", 0.0)),
                    acc.get("currency", "RUB"), acc.get("account_identifier"), float(acc.get("free_tier_gb", 0.0)),
                    float(acc.get("price_per_gb", 1.50)), float(acc.get("package_cost_rub", 0.0)),
                    1 if acc.get("ignore_bonus") else 0, float(acc.get("low_balance_threshold", 200.0)),
                    acc.get("sync_status", "ok"), None, None, now, now,
                ),
            )

        for r in data.get("resources", []):
            cursor.execute(
                """INSERT OR REPLACE INTO cdn_resources (
                    id, account_id, provider_resource_id, domain, cname,
                    status, consumer, total_gb, paid_watermark_gb, paid_watermark_cost,
                    custom_cost_rub, check_path, expected_codes, http_status,
                    http_code, http_latency_ms, last_checked_at, check_error,
                    is_manual, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    r["id"], r["account_id"], r.get("provider_resource_id"), r["domain"],
                    r.get("cname"), r.get("status", "active"), r.get("consumer", "split"),
                    float(r.get("total_gb", 0.0)), 0.0, 0.0, None, r.get("check_path", "/"),
                    r.get("expected_codes", "200,204,301,302,400,404"), r.get("http_status", "unknown"),
                    r.get("http_code"), r.get("http_latency_ms"), now, None, 0, now, now,
                ),
            )
        conn.commit()


def reset_to_demo() -> None:
    seed_demo_data(force=True)
