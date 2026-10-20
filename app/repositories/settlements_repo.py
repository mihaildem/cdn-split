"""Settlements repository with watermark snapshots and undo support."""

from __future__ import annotations

import json
import time
from typing import Any
import uuid

from app.repositories.connection import get_conn


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

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO settlements (
                id, settled_at, misha_owes_max, max_owes_misha,
                net_balance, note, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (settlement_id, now, misha_owes_max, max_owes_misha, net_balance, note, snapshot_json),
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


def create_settlement_and_advance_watermarks(
    misha_owes_max: float,
    max_owes_misha: float,
    net_balance: float,
    snapshot: dict[str, dict[str, float]],
    note: str | None = None,
    advancements: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any]:
    settlement = create_settlement(misha_owes_max, max_owes_misha, net_balance, snapshot, note)
    if advancements:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with get_conn() as conn:
            for res_id, marks in advancements.items():
                conn.execute(
                    """UPDATE cdn_resources
                       SET paid_watermark_gb = ?, paid_watermark_cost = ?, updated_at = ?
                       WHERE id = ?""",
                    (marks.get("paid_watermark_gb", 0.0), marks.get("paid_watermark_cost", 0.0), now, res_id),
                )
            conn.commit()
    return settlement


def get_all_settlements(limit: int = 20) -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, settled_at, misha_owes_max, max_owes_misha, net_balance, note
               FROM settlements ORDER BY settled_at DESC LIMIT ?""",
            (limit,),
        )
        return [dict(r) for r in cursor.fetchall()]


get_settlements = get_all_settlements


def get_latest_settlement() -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settlements ORDER BY settled_at DESC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["snapshot"] = json.loads(d.pop("snapshot_json", "{}") or "{}")
        return d


def undo_latest_settlement() -> dict[str, Any] | None:
    """Restores resource watermarks from latest settlement and deletes record."""
    latest = get_latest_settlement()
    if not latest:
        return None

    snapshot = latest["snapshot"]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with get_conn() as conn:
        cursor = conn.cursor()
        for res_id, marks in snapshot.items():
            cursor.execute(
                """UPDATE cdn_resources
                   SET paid_watermark_gb = ?, paid_watermark_cost = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    float(marks.get("paid_watermark_gb", 0.0)),
                    float(marks.get("paid_watermark_cost", 0.0)),
                    now,
                    res_id,
                ),
            )
        cursor.execute("DELETE FROM settlements WHERE id = ?", (latest["id"],))
        conn.commit()

    return latest
