"""Automated pytest suite for all 9 mandatory specification examples from Section 7.10 of TZ-programmer.md."""

import pytest
from app.billing import (
    ConsumerHistoryEntry,
    DayTrafficRecord,
    PayerHistoryEntry,
    calculate_day_cost,
    calculate_period_ledger,
    simplify_debts_kop,
    split_cost_equally_kop,
)


def test_example_1_base_free_tier_split():
    """Example 1: Base, free tier, split_all across 1 day."""
    accounts = [
        {"id": "acc_a", "free_tier_gb": 100.0, "price_per_gb_kop": 200, "payer": "misha"},
        {"id": "acc_b", "free_tier_gb": 0.0, "price_per_gb_kop": 200, "payer": "max"},
    ]
    resources = [
        {"id": "r1", "account_id": "acc_a", "consumer": "misha"},
        {"id": "r2", "account_id": "acc_a", "consumer": "max"},
        {"id": "r3", "account_id": "acc_a", "consumer": "split_all"},
        {"id": "r4", "account_id": "acc_b", "consumer": "misha"},
    ]
    traffic = [
        DayTrafficRecord("r1", "2026-04-01", 300.0),
        DayTrafficRecord("r2", "2026-04-01", 200.0),
        DayTrafficRecord("r3", "2026-04-01", 100.0),
        DayTrafficRecord("r4", "2026-04-01", 50.0),
    ]
    result = calculate_period_ledger(
        accounts=accounts, resources=resources, daily_traffic=traffic,
        active_member_ids=["misha", "max"], names={"misha": "Миша", "max": "Макс"},
    )
    day_a = next(d for d in result.day_costs if "r1" in d.resource_costs_kop)
    assert day_a.total_gb == 600.0 and day_a.billable_gb == 500.0 and day_a.billable_cost_kop == 100000
    assert day_a.resource_costs_kop["r1"] == 50000
    assert day_a.resource_costs_kop["r2"] == 33333
    assert day_a.resource_costs_kop["r3"] == 16667
    assert result.balances["misha"].paid_kop == 100000 and result.balances["max"].paid_kop == 10000
    assert result.balances["misha"].consumed_kop == 68334 and result.balances["max"].consumed_kop == 41666
    assert result.balances["misha"].net_balance_kop == 31666 and result.balances["max"].net_balance_kop == -31666
    assert len(result.recommended_transfers) == 1
    tr = result.recommended_transfers[0]
    assert tr.from_member == "max" and tr.to_member == "misha" and tr.amount_rub == 317


def test_example_2_mid_period_consumer_change():
    """Example 2: Mid-period consumer change (Days 1-10 Misha, Days 11-20 Max)."""
    accounts = [{"id": "acc_1", "free_tier_gb": 0.0, "price_per_gb_kop": 200, "payer": "misha"}]
    resources = [{"id": "r1", "account_id": "acc_1", "consumer": "misha"}]
    consumer_hist = [
        ConsumerHistoryEntry("r1", "member", "misha", "2026-04-01"),
        ConsumerHistoryEntry("r1", "member", "max", "2026-04-11"),
    ]
    traffic = [DayTrafficRecord("r1", f"2026-04-{d:02d}", 10.0) for d in range(1, 21)]
    result = calculate_period_ledger(
        accounts=accounts, resources=resources, daily_traffic=traffic,
        consumer_history=consumer_hist, active_member_ids=["misha", "max"],
    )
    assert result.balances["misha"].paid_kop == 40000
    assert result.balances["misha"].consumed_kop == 20000 and result.balances["max"].consumed_kop == 20000
    assert result.balances["misha"].net_balance_kop == 20000 and result.balances["max"].net_balance_kop == -20000
    assert len(result.recommended_transfers) == 1
    assert result.recommended_transfers[0].amount_rub == 200
    assert result.recommended_transfers[0].from_member == "max" and result.recommended_transfers[0].to_member == "misha"


def test_example_3_chronological_free_tier():
    """Example 3: Chronological Free Tier (Day 1: 80 GB -> 0 ₽, Day 2: 80 GB -> 120 ₽)."""
    # Day 1: 80 GB, free tier 100 GB -> billable 0 GB -> 0 ₽
    day1 = calculate_day_cost(
        date="2026-04-01",
        day_traffic_gb={"r1": 80.0},
        free_tier_gb=100.0,
        price_per_gb_kop=200,
        cum_before_gb=0.0,
        cum_after_gb=80.0,
    )
    assert day1.billable_gb == 0.0
    assert day1.billable_cost_kop == 0

    # Day 2: 80 GB, cum_before 80 GB, cum_after 160 GB -> billable 60 GB -> 120 ₽ (12000 kop)
    day2 = calculate_day_cost(
        date="2026-04-02",
        day_traffic_gb={"r1": 80.0},
        free_tier_gb=100.0,
        price_per_gb_kop=200,
        cum_before_gb=80.0,
        cum_after_gb=160.0,
    )
    assert day2.billable_gb == 60.0
    assert day2.billable_cost_kop == 12000


def test_example_4_bonus_excluded():
    """Example 4: count_bonus=False, 100 ₽ gross with 40 ₽ bonus -> 60 ₽ debt."""
    day = calculate_day_cost(
        date="2026-04-01",
        day_traffic_gb={"r1": 50.0},
        free_tier_gb=0.0,
        price_per_gb_kop=200,  # 50 * 200 = 10000 kop (100 ₽)
        cum_before_gb=0.0,
        cum_after_gb=50.0,
        count_bonus=False,
        bonus_part_kop=4000,   # 40 ₽ bonus
    )
    assert day.gross_cost_kop == 10000
    assert day.bonus_part_kop == 4000
    assert day.billable_cost_kop == 6000  # Only 60 ₽ enters debt!


def test_example_5_partial_payment():
    """Example 5: Debt 317 ₽, confirmed payment 200 ₽ -> 117 ₽ left."""
    accounts = [{"id": "a1", "free_tier_gb": 0.0, "price_per_gb_kop": 200, "payer": "misha"}]
    resources = [{"id": "r1", "account_id": "a1", "consumer": "max"}]
    # 158.33 GB * 200 kop = ~31666 kop debt
    traffic = [DayTrafficRecord(resource_id="r1", date="2026-04-01", gb=158.33)]

    # Confirmed transfer 200 ₽ (20000 kop)
    transfers = [{"from_member": "max", "to_member": "misha", "amount_kop": 20000, "status": "confirmed"}]

    result = calculate_period_ledger(
        accounts=accounts,
        resources=resources,
        daily_traffic=traffic,
        transfers=transfers,
        active_member_ids=["misha", "max"],
    )

    # Initial debt was ~317 ₽, now 117 ₽ left
    assert result.balances["max"].net_balance_kop == -(31666 - 20000)
    assert len(result.recommended_transfers) == 1
    assert result.recommended_transfers[0].amount_rub == 117


def test_example_6_three_members_transfers():
    """Example 6: A +300, B -100, C -200 -> C->A 200 ₽, B->A 100 ₽."""
    balances = {"A": 30000, "B": -10000, "C": -20000}
    transfers = simplify_debts_kop(balances)

    assert len(transfers) == 2
    # C owes 200, pays A
    assert transfers[0].from_member == "C"
    assert transfers[0].to_member == "A"
    assert transfers[0].amount_rub == 200

    # B owes 100, pays A
    assert transfers[1].from_member == "B"
    assert transfers[1].to_member == "A"
    assert transfers[1].amount_rub == 100


def test_example_7_kopeck_remainder_split():
    """Example 7: 100.00 ₽ split 3 ways -> 33.34 / 33.33 / 33.33, exact sum 100.00."""
    shares = split_cost_equally_kop(cost_kop=10000, active_member_ids=["1", "2", "3"])

    assert shares["1"] == 3334
    assert shares["2"] == 3333
    assert shares["3"] == 3333
    assert sum(shares.values()) == 10000


def test_example_8_new_unassigned_resource_retroactive():
    """Example 8: 3 days unassigned -> assigned to Max -> retroactively included."""
    accounts = [{"id": "acc_1", "free_tier_gb": 0.0, "price_per_gb_kop": 200, "payer": "misha"}]
    resources = [{"id": "r_new", "account_id": "acc_1", "consumer": "unassigned"}]
    traffic = [
        DayTrafficRecord(resource_id="r_new", date="2026-04-01", gb=10.0),
        DayTrafficRecord(resource_id="r_new", date="2026-04-02", gb=10.0),
        DayTrafficRecord(resource_id="r_new", date="2026-04-03", gb=10.0),
    ]

    # Step 1: Unassigned - 3 days * 20 ₽ = 60 ₽ (6000 kop) in unassigned pool, 0 member debt
    res1 = calculate_period_ledger(
        accounts=accounts,
        resources=resources,
        daily_traffic=traffic,
        active_member_ids=["misha", "max"],
    )
    assert res1.unassigned_kop == 6000
    assert res1.balances["max"].consumed_kop == 0

    # Step 2: Retroactive assignment to Max from first_seen_at (2026-04-01)
    consumer_hist = [
        ConsumerHistoryEntry(resource_id="r_new", mode="member", member_id="max", effective_from="2026-04-01")
    ]
    res2 = calculate_period_ledger(
        accounts=accounts,
        resources=resources,
        daily_traffic=traffic,
        consumer_history=consumer_hist,
        active_member_ids=["misha", "max"],
    )
    assert res2.unassigned_kop == 0
    assert res2.balances["max"].consumed_kop == 6000
    assert res2.balances["max"].net_balance_kop == -6000


def test_example_9_mid_period_payer_change():
    """Example 9: Days 1-10 Misha pays, Days 11-20 Max pays."""
    accounts = [{"id": "acc_1", "free_tier_gb": 0.0, "price_per_gb_kop": 200, "payer": "misha"}]
    resources = [{"id": "r1", "account_id": "acc_1", "consumer": "split_all"}]

    payer_hist = [
        PayerHistoryEntry(account_id="acc_1", member_id="misha", effective_from="2026-04-01"),
        PayerHistoryEntry(account_id="acc_1", member_id="max", effective_from="2026-04-11"),
    ]

    traffic = [
        DayTrafficRecord(resource_id="r1", date=f"2026-04-{d:02d}", gb=10.0)
        for d in range(1, 21)
    ]

    result = calculate_period_ledger(
        accounts=accounts,
        resources=resources,
        daily_traffic=traffic,
        payer_history=payer_hist,
        active_member_ids=["misha", "max"],
    )

    # 10 days * 20 ₽ = 200 ₽ paid by Misha, 10 days * 20 ₽ = 200 ₽ paid by Max
    assert result.balances["misha"].paid_kop == 20000
    assert result.balances["max"].paid_kop == 20000
