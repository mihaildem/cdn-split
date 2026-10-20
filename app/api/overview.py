"""Overview API endpoint aggregating debt, attention items, accounts, and history."""

from __future__ import annotations

import time
from typing import Any
from fastapi import APIRouter

from app import db
from app.billing import (
    calculate_7d_rolling_avg,
    calculate_period_ledger,
    calculate_runway_days,
    detect_traffic_spike,
    forecast_period_cost_kop,
)

router = APIRouter(tags=["overview"])

SEVERITY_ORDER = {"red": 1, "yellow": 2, "green": 3}


def build_attention_items(
    accounts: list[dict[str, Any]],
    resources: list[dict[str, Any]],
    transfers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build attention items sorted by severity per Section 9.1."""
    items: list[dict[str, Any]] = []

    # 1. Key errors / auth invalid (red)
    for acc in accounts:
        if acc.get("sync_status") in ("error", "auth_error"):
            items.append({
                "type": "key",
                "severity": "red",
                "entity_id": acc["id"],
                "title": f"Ключ не принят ({acc.get('name', acc['id'])})",
                "action": "update_key",
                "action_label": "Обновить ключ",
            })

    # 2. Down CDN resources (red)
    for r in resources:
        if r.get("http_status") == "down" or r.get("status") == "down":
            items.append({
                "type": "down",
                "severity": "red",
                "entity_id": r["id"],
                "title": f"CDN не отвечает ({r.get('domain', r['id'])})",
                "action": "inspect_resource",
                "action_label": "Открыть",
            })

    # 3. Account balance runways (red / yellow)
    for acc in accounts:
        bal = float(acc.get("balance_rub", 0.0) or 0.0)
        bonus = float(acc.get("bonus_balance_rub", 0.0) or 0.0)
        price = float(acc.get("price_per_gb", 1.50) or 1.50)
        # Approximate daily spend from accounts resources
        acc_res = [r for r in resources if r.get("account_id") == acc["id"]]
        acc_daily_gb = sum(float(r.get("total_gb", 0.0) or 0.0) / 30.0 for r in acc_res)
        daily_cost_rub = acc_daily_gb * price
        days_left, severity = calculate_runway_days(bal, bonus, daily_cost_rub)
        if severity == "critical":
            items.append({
                "type": "balance",
                "severity": "red",
                "entity_id": acc["id"],
                "title": f"Деньги заканчиваются ({acc.get('name', acc['id'])}): хватит на {days_left or 0:.0f} дн.",
                "action": "open_billing",
                "action_label": "Открыть кабинет",
            })
        elif severity == "warning":
            items.append({
                "type": "balance_warn",
                "severity": "yellow",
                "entity_id": acc["id"],
                "title": f"Хватит на {days_left:.0f} дн. ({acc.get('name', acc['id'])})",
                "action": "open_billing",
                "action_label": "Пополнить",
            })

    # 4. Unassigned new CDN resources (yellow)
    for r in resources:
        if r.get("consumer") == "unassigned":
            items.append({
                "type": "newcdn",
                "severity": "yellow",
                "entity_id": r["id"],
                "title": f"Новый CDN: {r.get('domain', r['id'])}",
                "action": "assign",
                "action_label": "Назначить",
            })

    # 5. Traffic spikes (yellow)
    for r in resources:
        traffic_14d = db.get_traffic_14d_array(r["id"])
        if detect_traffic_spike(traffic_14d):
            items.append({
                "type": "spike",
                "severity": "yellow",
                "entity_id": r["id"],
                "title": f"Всплеск трафика: {r.get('domain', r['id'])}",
                "action": "inspect_resource",
                "action_label": "Открыть",
            })

    # 6. Pending transfers (green)
    for t in transfers:
        if t.get("status") == "pending":
            items.append({
                "type": "transfer_pending",
                "severity": "green",
                "entity_id": t["id"],
                "title": f"Ожидается подтверждение: {t.get('amount_rub', 0):.0f} ₽ от {t.get('from_member')}",
                "action": "confirm_transfer",
                "action_label": "Подтвердить",
            })

    items.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 99))
    return items


@router.get("/api/overview")
async def get_overview():
    accounts = db.get_accounts()
    resources = db.get_resources()
    participants = db.get_participants()
    transfers = db.get_all_transfers(limit=20)
    audit_log = db.get_audit_logs(limit=20)
    bots = db.get_telegram_bots()

    # Collect daily traffic
    all_traffic = db.get_traffic_daily(limit_days=30)
    payer_history = db.get_payer_history()
    consumer_history = db.get_consumer_history()
    active_m_ids = [p["id"] for p in participants]
    names_map = {p["id"]: p.get("name", p["id"]) for p in participants}

    # Run period ledger
    period_res = calculate_period_ledger(
        accounts=accounts,
        resources=resources,
        daily_traffic=all_traffic,
        payer_history=payer_history,
        consumer_history=consumer_history,
        transfers=transfers,
        active_member_ids=active_m_ids,
        names=names_map,
    )

    attention = build_attention_items(accounts, resources, transfers)

    # Attach 14-day traffic array to resources
    accounts_payload = []
    for acc in accounts:
        acc_dict = dict(acc)
        acc_res = [dict(r) for r in resources if r["account_id"] == acc["id"]]
        for r in acc_res:
            r["traffic_14d"] = db.get_traffic_14d_array(r["id"])
        acc_dict["resources"] = acc_res
        accounts_payload.append(acc_dict)

    debtors = [b for b in period_res.balances.values() if b.net_balance_kop < -99]
    creditors = [b for b in period_res.balances.values() if b.net_balance_kop > 99]

    if len(debtors) == 1 and len(creditors) == 1:
        d = debtors[0]
        c = creditors[0]
        sum_rub = round(abs(d.net_balance_kop) / 100.0)
        debt_summary = f"{names_map.get(d.member_id, d.member_id)} → {names_map.get(c.member_id, c.member_id)} · {sum_rub} ₽"
    elif not debtors and not creditors:
        debt_summary = "Все в расчёте (0 ₽)"
    else:
        debt_summary = f"Взаиморасчёты: {len(period_res.recommended_transfers)} перевода"

    return {
        "debt": {
            "summary_text": debt_summary,
            "balances": {m_id: b.net_balance_rub for m_id, b in period_res.balances.items()},
            "recommended_transfers": [
                {
                    "from_member": t.from_member,
                    "from_name": t.from_name,
                    "to_member": t.to_member,
                    "to_name": t.to_name,
                    "amount_rub": t.amount_rub,
                    "amount_kop": t.amount_kop,
                }
                for t in period_res.recommended_transfers
            ],
            "unassigned": {
                "count": len(period_res.unassigned_resource_ids),
                "cost_kop": period_res.unassigned_kop,
                "cost_rub": round(period_res.unassigned_kop / 100.0, 2),
            },
        },
        "attention": attention,
        "accounts": accounts_payload,
        "members": participants,
        "audit_log": audit_log,
        "bots": bots,
        "transfers": transfers,
        "last_updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
