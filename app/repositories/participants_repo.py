"""Participants database repository."""

from __future__ import annotations

import re
import time
from typing import Any
import uuid
from app.repositories.connection import get_conn


def get_all_participants() -> list[dict[str, Any]]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM participants ORDER BY created_at ASC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["is_default"] = bool(d["is_default"])
            result.append(d)
        return result


get_participants = get_all_participants


def get_participant(participant_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM participants WHERE id = ?", (participant_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_default"] = bool(d["is_default"])
        return d


def create_participant(data: dict[str, Any]) -> dict[str, Any]:
    name = str(data.get("name", "")).strip()
    if not name:
        raise ValueError("Participant name cannot be empty")

    p_id = data.get("id")
    if not p_id:
        slug = re.sub(r"[^a-zA-Z0-9_]", "", name.lower().replace(" ", "_"))
        p_id = slug if slug else f"user_{uuid.uuid4().hex[:6]}"

    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM participants WHERE id = ?", (p_id,))
        if cursor.fetchone()[0] > 0:
            p_id = f"{p_id}_{uuid.uuid4().hex[:4]}"

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        color = data.get("color") or "#38bdf8"
        cursor.execute(
            """INSERT INTO participants (id, name, color, is_default, created_at, updated_at)
               VALUES (?, ?, ?, 0, ?, ?)""",
            (p_id, name, color, now, now),
        )
        conn.commit()
    return get_participant(p_id)  # type: ignore


def update_participant(participant_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    current = get_participant(participant_id)
    if not current:
        return None

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fields: list[str] = []
    values: list[Any] = []

    if "name" in updates and updates["name"] is not None:
        name_val = str(updates["name"]).strip()
        if name_val:
            fields.append("name = ?")
            values.append(name_val)
    if "color" in updates and updates["color"] is not None:
        fields.append("color = ?")
        values.append(str(updates["color"]).strip())

    if not fields:
        return current

    fields.append("updated_at = ?")
    values.append(now)
    values.append(participant_id)

    query = f"UPDATE participants SET {', '.join(fields)} WHERE id = ?"
    with get_conn() as conn:
        conn.execute(query, values)
        conn.commit()

    return get_participant(participant_id)


def delete_participant(participant_id: str) -> tuple[bool, str | None]:
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM participants ORDER BY created_at ASC")
        all_ids = [r[0] for r in cursor.fetchall()]

        if participant_id not in all_ids:
            return False, "Участник не найден"
        if len(all_ids) <= 1:
            return False, "Нельзя удалить единственного участника"

        remaining_id = next(i for i in all_ids if i != participant_id)
        cursor.execute("UPDATE accounts SET payer = ? WHERE payer = ?", (remaining_id, participant_id))
        cursor.execute("UPDATE cdn_resources SET consumer = 'split' WHERE consumer = ?", (participant_id,))
        cursor.execute("UPDATE telegram_bots SET filter_owner = 'all' WHERE filter_owner = ?", (participant_id,))
        cursor.execute("DELETE FROM participants WHERE id = ?", (participant_id,))
        conn.commit()

    return True, None
