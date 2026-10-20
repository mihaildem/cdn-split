"""Core daily cost calculation and integer kopeck remainder distribution."""

from __future__ import annotations

from typing import Mapping
from app.billing.types import DayCostResult


def calculate_day_cost(
    date: str,
    day_traffic_gb: Mapping[str, float],
    free_tier_gb: float,
    price_per_gb_kop: int,
    cum_before_gb: float,
    cum_after_gb: float,
    count_bonus: bool = True,
    bonus_part_kop: int = 0,
) -> DayCostResult:
    """Calculate exact daily cost in kopecks for an account and split across resources.
    
    Implements Section 7.2 & 7.3 of specification:
    - Chronological Free Tier consumption across billing period.
    - Integer kopeck arithmetic.
    - Deterministic remainder allocation to largest fractional/traffic share.
    - Bonus deduction when count_bonus is False.
    """
    total_day_gb = round(sum(day_traffic_gb.values()), 6)

    # 7.2: billable(d) = max(0, cum_after - free) - max(0, cum_before - free)
    billable_before = max(0.0, cum_before_gb - free_tier_gb)
    billable_after = max(0.0, cum_after_gb - free_tier_gb)
    billable_day_gb = max(0.0, billable_after - billable_before)

    # Gross cost in integer kopecks
    gross_cost_kop = int(round(billable_day_gb * price_per_gb_kop))

    # 7.3: Bonus deduction when count_bonus == False
    if not count_bonus and bonus_part_kop > 0:
        actual_bonus_kop = min(gross_cost_kop, bonus_part_kop)
        billable_cost_kop = gross_cost_kop - actual_bonus_kop
    else:
        actual_bonus_kop = 0
        billable_cost_kop = gross_cost_kop

    resource_costs_kop: dict[str, int] = {}
    resource_billable_gb: dict[str, float] = {}

    if total_day_gb <= 0 or billable_cost_kop <= 0:
        for r_id, t_gb in day_traffic_gb.items():
            resource_costs_kop[r_id] = 0
            resource_billable_gb[r_id] = 0.0
        return DayCostResult(
            date=date,
            total_gb=total_day_gb,
            cum_before_gb=cum_before_gb,
            cum_after_gb=cum_after_gb,
            billable_gb=billable_day_gb,
            gross_cost_kop=gross_cost_kop,
            bonus_part_kop=actual_bonus_kop,
            billable_cost_kop=billable_cost_kop,
            resource_costs_kop=resource_costs_kop,
            resource_billable_gb=resource_billable_gb,
        )

    # Proportional split of billable GB and kopecks
    base_kop_map: dict[str, int] = {}
    candidates: list[tuple[float, float, str]] = []

    for r_id, t_gb in day_traffic_gb.items():
        share = t_gb / total_day_gb
        r_billable_gb = round(billable_day_gb * share, 6)
        resource_billable_gb[r_id] = r_billable_gb

        exact_cost = billable_cost_kop * share
        base_kop = int(exact_cost)
        frac = exact_cost - base_kop
        base_kop_map[r_id] = base_kop
        # Sort key: (-frac, -share, r_id)
        candidates.append((frac, share, r_id))

    allocated_base = sum(base_kop_map.values())
    rem_kop = billable_cost_kop - allocated_base

    # Deterministic remainder distribution: largest fractional part, tie-break by share, then id
    candidates.sort(key=lambda item: (-item[0], -item[1], str(item[2])))

    extra_kop_map: dict[str, int] = {c[2]: 0 for c in candidates}
    for i in range(rem_kop):
        r_id = candidates[i % len(candidates)][2]
        extra_kop_map[r_id] += 1

    for r_id in day_traffic_gb:
        resource_costs_kop[r_id] = base_kop_map[r_id] + extra_kop_map[r_id]

    # Invariant: sum of resource costs equals billable_cost_kop exactly!
    assert sum(resource_costs_kop.values()) == billable_cost_kop

    return DayCostResult(
        date=date,
        total_gb=total_day_gb,
        cum_before_gb=cum_before_gb,
        cum_after_gb=cum_after_gb,
        billable_gb=billable_day_gb,
        gross_cost_kop=gross_cost_kop,
        bonus_part_kop=actual_bonus_kop,
        billable_cost_kop=billable_cost_kop,
        resource_costs_kop=resource_costs_kop,
        resource_billable_gb=resource_billable_gb,
    )
