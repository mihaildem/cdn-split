"""Splitwise mutual-offset calculation across participants."""

from __future__ import annotations

from typing import Any
from app.billing.debts import DEFAULT_PARTICIPANTS, _format_dative, simplify_debts
from app.models import AccountBillingSummary, ParticipantStat, SplitwiseOverview


def calculate_splitwise_overview(
    accounts: list[AccountBillingSummary],
    participants: list[dict[str, Any]] | None = None,
) -> SplitwiseOverview:
    """Calculate Splitwise mutual offset across all accounts, resources, and participants."""
    if not participants:
        parts = [dict(p) for p in DEFAULT_PARTICIPANTS]
    else:
        parts = [dict(p) if isinstance(p, dict) else p.model_dump() for p in participants]

    names = {p["id"]: p.get("name", p["id"]) for p in parts}
    colors = {p["id"]: p.get("color", "#38bdf8") for p in parts}
    n_participants = max(1, len(parts))

    paid_map: dict[str, float] = {p["id"]: 0.0 for p in parts}
    consumed_map: dict[str, float] = {p["id"]: 0.0 for p in parts}

    total_unsettled_cost = 0.0
    total_resources_count = 0
    active_resources_count = 0
    down_resources_count = 0

    misha_owes_max = 0.0
    max_owes_misha = 0.0

    for acc in accounts:
        payer = acc.payer
        for res in acc.resources:
            cost = res.unsettled_cost
            total_unsettled_cost += cost
            total_resources_count += 1
            if res.http_status == "up":
                active_resources_count += 1
            elif res.http_status == "down":
                down_resources_count += 1

            paid_map[payer] = paid_map.get(payer, 0.0) + cost

            if res.consumer == "split":
                share = cost / n_participants
                for p in parts:
                    consumed_map[p["id"]] = consumed_map.get(p["id"], 0.0) + share
            else:
                c = res.consumer
                consumed_map[c] = consumed_map.get(c, 0.0) + cost

            if payer == "misha":
                if res.consumer == "max":
                    max_owes_misha += cost
                elif res.consumer == "split":
                    max_owes_misha += cost * 0.5
            elif payer == "max":
                if res.consumer == "misha":
                    misha_owes_max += cost
                elif res.consumer == "split":
                    misha_owes_max += cost * 0.5

    participant_stats: list[ParticipantStat] = []
    balances: dict[str, float] = {}

    for p in parts:
        p_id = p["id"]
        p_paid = round(paid_map.get(p_id, 0.0), 2)
        p_cons = round(consumed_map.get(p_id, 0.0), 2)
        p_net = round(p_paid - p_cons, 2)
        balances[p_id] = p_net
        participant_stats.append(
            ParticipantStat(
                id=p_id,
                name=names.get(p_id, p_id),
                color=colors.get(p_id, "#38bdf8"),
                paid_total=p_paid,
                consumed_total=p_cons,
                net_balance=p_net,
            )
        )

    transfers = simplify_debts(balances, names)

    misha_paid_total = round(paid_map.get("misha", 0.0), 2)
    max_paid_total = round(paid_map.get("max", 0.0), 2)
    misha_consumed_total = round(consumed_map.get("misha", 0.0), 2)
    max_consumed_total = round(consumed_map.get("max", 0.0), 2)

    misha_owes_max = round(misha_owes_max, 2)
    max_owes_misha = round(max_owes_misha, 2)
    net_balance = round(max_owes_misha - misha_owes_max, 2)
    total_unsettled_cost = round(total_unsettled_cost, 2)

    misha_name = names.get("misha", "Миша")
    max_name = names.get("max", "Макс")

    if len(parts) == 2:
        if net_balance > 0.005:
            direction = "max_owes_misha"
            fmt_sum = f"{net_balance:,.2f}".replace(",", " ").rstrip("0").rstrip(".")
            summary_text = f"{max_name} должен {_format_dative(misha_name)} {fmt_sum} ₽"
        elif net_balance < -0.005:
            direction = "misha_owes_max"
            fmt_sum = f"{abs(net_balance):,.2f}".replace(",", " ").rstrip("0").rstrip(".")
            summary_text = f"{misha_name} должен {_format_dative(max_name)} {fmt_sum} ₽"
        else:
            direction = "settled"
            summary_text = "Все взаиморасчеты закрыты (0 ₽)"
    else:
        if not transfers:
            direction = "settled"
            summary_text = "Все взаиморасчеты закрыты (0 ₽)"
        elif len(transfers) == 1:
            t = transfers[0]
            direction = f"{t.from_id}_owes_{t.to_id}"
            fmt_sum = f"{t.amount:,.2f}".replace(",", " ").rstrip("0").rstrip(".")
            summary_text = f"{t.from_name} должен {_format_dative(t.to_name)} {fmt_sum} ₽"
        else:
            direction = "multi"
            desc = ", ".join(f"{t.from_name} → {_format_dative(t.to_name)} {t.amount:,.0f} ₽" for t in transfers)
            summary_text = f"Взаиморасчеты ({len(transfers)} перевода): {desc}"

    return SplitwiseOverview(
        misha_owes_max=misha_owes_max,
        max_owes_misha=max_owes_misha,
        net_balance=net_balance,
        direction=direction,
        summary_text=summary_text,
        misha_paid_total=misha_paid_total,
        max_paid_total=max_paid_total,
        misha_consumed_total=misha_consumed_total,
        max_consumed_total=max_consumed_total,
        total_unsettled_cost=total_unsettled_cost,
        total_resources_count=total_resources_count,
        active_resources_count=active_resources_count,
        down_resources_count=down_resources_count,
        accounts_count=len(accounts),
        participant_stats=participant_stats,
        transfers=transfers,
    )
