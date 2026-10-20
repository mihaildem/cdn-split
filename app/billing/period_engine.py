"""Period ledger calculation engine in integer kopecks."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Mapping, Sequence

from app.billing.consumer_split import allocate_resource_day_cost
from app.billing.debts_kop import simplify_debts_kop
from app.billing.ledger_core import calculate_day_cost
from app.billing.types import (
    ConsumerHistoryEntry,
    DayCostResult,
    DayTrafficRecord,
    KopTransfer,
    LedgerEntry,
    MemberBalance,
    PayerHistoryEntry,
    PeriodLedgerResult,
)


def get_effective_payer(
    account_id: str,
    date: str,
    payer_history: Sequence[PayerHistoryEntry | dict[str, Any]],
    default_payer: str = "misha",
) -> str:
    """Find effective payer on date from payer_history (latest effective_from <= date)."""
    candidates = []
    for h in payer_history:
        acc_id = h.account_id if isinstance(h, PayerHistoryEntry) else h.get("account_id")
        eff = h.effective_from if isinstance(h, PayerHistoryEntry) else h.get("effective_from", "1970-01-01")
        m_id = h.member_id if isinstance(h, PayerHistoryEntry) else h.get("member_id", default_payer)
        if acc_id == account_id and eff <= date:
            candidates.append((eff, m_id))
    if not candidates:
        return default_payer
    candidates.sort(key=lambda x: x[0])
    return str(candidates[-1][1])


def get_effective_consumer(
    resource_id: str,
    date: str,
    consumer_history: Sequence[ConsumerHistoryEntry | dict[str, Any]],
    default_mode: str = "split_all",
    default_member: str | None = None,
) -> tuple[str, str | None]:
    """Find effective consumer on date from consumer_history (latest effective_from <= date)."""
    candidates = []
    for h in consumer_history:
        r_id = h.resource_id if isinstance(h, ConsumerHistoryEntry) else h.get("resource_id")
        eff = h.effective_from if isinstance(h, ConsumerHistoryEntry) else h.get("effective_from", "1970-01-01")
        mode = h.mode if isinstance(h, ConsumerHistoryEntry) else h.get("mode", default_mode)
        m_id = h.member_id if isinstance(h, ConsumerHistoryEntry) else h.get("member_id")
        if r_id == resource_id and eff <= date:
            candidates.append((eff, mode, m_id))
    if not candidates:
        return (default_mode, default_member)
    candidates.sort(key=lambda x: x[0])
    return (str(candidates[-1][1]), candidates[-1][2])


def calculate_period_ledger(
    accounts: Sequence[dict[str, Any]],
    resources: Sequence[dict[str, Any]],
    daily_traffic: Sequence[DayTrafficRecord | dict[str, Any]],
    payer_history: Sequence[PayerHistoryEntry | dict[str, Any]] | None = None,
    consumer_history: Sequence[ConsumerHistoryEntry | dict[str, Any]] | None = None,
    transfers: Sequence[dict[str, Any]] | None = None,
    active_member_ids: Sequence[str] | None = None,
    corrections: Mapping[str, int] | None = None,
    names: Mapping[str, str] | None = None,
) -> PeriodLedgerResult:
    """Calculate daily ledger, balances in kopecks, and minimal transfers per Section 7."""
    payer_hist = list(payer_history or [])
    consumer_hist = list(consumer_history or [])
    active_members = list(active_member_ids or ["misha", "max"])
    all_transfers = list(transfers or [])
    names_map = dict(names or {})

    # Map resource to account and defaults
    res_to_acc: dict[str, str] = {}
    res_default_consumer: dict[str, tuple[str, str | None]] = {}
    res_account_map: dict[str, dict[str, Any]] = {}
    for r in resources:
        r_id = str(r["id"])
        acc_id = str(r["account_id"])
        res_to_acc[r_id] = acc_id
        cons = r.get("consumer", "split")
        if cons in ("split", "split_all"):
            res_default_consumer[r_id] = ("split_all", None)
        elif cons == "unassigned":
            res_default_consumer[r_id] = ("unassigned", None)
        else:
            res_default_consumer[r_id] = ("member", cons)

    # Group traffic by (account_id, date)
    traffic_by_acc_date: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    all_dates_set: set[str] = set()

    for rec in daily_traffic:
        r_id = rec.resource_id if isinstance(rec, DayTrafficRecord) else str(rec["resource_id"])
        dt = rec.date if isinstance(rec, DayTrafficRecord) else str(rec["date"])
        gb = float(rec.gb if isinstance(rec, DayTrafficRecord) else rec["gb"])
        acc_id = res_to_acc.get(r_id)
        if acc_id:
            traffic_by_acc_date[acc_id][dt][r_id] = gb
            all_dates_set.add(dt)

    ledger_entries: list[LedgerEntry] = []
    day_costs: list[DayCostResult] = []
    unassigned_kop = 0
    unassigned_res_set: set[str] = set()

    # Process each account chronologically
    for acc in accounts:
        acc_id = str(acc["id"])
        free_tier_gb = float(acc.get("free_tier_gb", 0.0) or 0.0)
        # Price: accept price_per_gb_kop or float price_per_gb (in rubles)
        if "price_per_gb_kop" in acc:
            price_kop = int(acc["price_per_gb_kop"])
        else:
            price_kop = int(round(float(acc.get("price_per_gb", 1.50) or 1.50) * 100))

        count_bonus = bool(acc.get("count_bonus", not acc.get("ignore_bonus", False)))
        default_payer = str(acc.get("payer", "misha"))
        acc_dates = sorted(traffic_by_acc_date[acc_id].keys())

        cum_traffic_gb = 0.0

        for dt in acc_dates:
            day_traffic = traffic_by_acc_date[acc_id][dt]
            day_total_gb = sum(day_traffic.values())
            cum_before = cum_traffic_gb
            cum_after = cum_before + day_total_gb
            cum_traffic_gb = cum_after

            bonus_part_kop = int(acc.get("daily_bonus_part_kop", {}).get(dt, 0))

            day_res = calculate_day_cost(
                date=dt,
                day_traffic_gb=day_traffic,
                free_tier_gb=free_tier_gb,
                price_per_gb_kop=price_kop,
                cum_before_gb=cum_before,
                cum_after_gb=cum_after,
                count_bonus=count_bonus,
                bonus_part_kop=bonus_part_kop,
            )
            day_costs.append(day_res)

            # Record paid entry for effective payer
            eff_payer = get_effective_payer(acc_id, dt, payer_hist, default_payer)
            if day_res.billable_cost_kop > 0:
                ledger_entries.append(
                    LedgerEntry(
                        date=dt,
                        member_id=eff_payer,
                        kind="paid",
                        amount_kop=day_res.billable_cost_kop,
                        source_ref=acc_id,
                    )
                )

            # Split each resource cost
            for r_id, r_cost_kop in day_res.resource_costs_kop.items():
                def_mode, def_m = res_default_consumer.get(r_id, ("split_all", None))
                mode, m_id = get_effective_consumer(r_id, dt, consumer_hist, def_mode, def_m)
                shares, unassigned_part = allocate_resource_day_cost(
                    cost_kop=r_cost_kop,
                    mode=mode,
                    consumer_member_id=m_id,
                    active_member_ids=active_members,
                )
                if unassigned_part > 0:
                    unassigned_kop += unassigned_part
                    unassigned_res_set.add(r_id)

                for c_id, share_kop in shares.items():
                    if share_kop > 0:
                        ledger_entries.append(
                            LedgerEntry(
                                date=dt,
                                member_id=c_id,
                                kind="consumed",
                                amount_kop=share_kop,
                                source_ref=r_id,
                            )
                        )

    # Compute balances
    balances: dict[str, MemberBalance] = {m: MemberBalance(member_id=m) for m in active_members}

    for entry in ledger_entries:
        if entry.member_id not in balances:
            balances[entry.member_id] = MemberBalance(member_id=entry.member_id)
        if entry.kind == "paid":
            balances[entry.member_id].paid_kop += entry.amount_kop
        elif entry.kind == "consumed":
            balances[entry.member_id].consumed_kop += entry.amount_kop
        elif entry.kind == "correction":
            balances[entry.member_id].corrections_kop += entry.amount_kop

    if corrections:
        for m_id, corr_kop in corrections.items():
            if m_id not in balances:
                balances[m_id] = MemberBalance(member_id=m_id)
            balances[m_id].corrections_kop += corr_kop

    # Apply confirmed transfers
    for tr in all_transfers:
        status = tr.get("status", "confirmed")
        if status == "confirmed":
            amt = int(tr.get("amount_kop") or round(float(tr.get("amount_rub", 0.0)) * 100))
            f_m = str(tr["from_member"])
            t_m = str(tr["to_member"])
            if f_m not in balances:
                balances[f_m] = MemberBalance(member_id=f_m)
            if t_m not in balances:
                balances[t_m] = MemberBalance(member_id=t_m)
            balances[f_m].transfers_sent_kop += amt
            balances[t_m].transfers_received_kop += amt

    # Minimal transfers
    net_map = {m_id: b.net_balance_kop for m_id, b in balances.items()}
    recommended = simplify_debts_kop(net_map, names_map)

    return PeriodLedgerResult(
        balances=balances,
        unassigned_kop=unassigned_kop,
        unassigned_resource_ids=list(unassigned_res_set),
        ledger_entries=ledger_entries,
        day_costs=day_costs,
        recommended_transfers=recommended,
    )
