"""Single account billing calculations."""

from __future__ import annotations

from typing import Any
from app.models import AccountBillingSummary, ResourceBillingSummary


def calculate_account_billing(
    account: dict[str, Any],
    resources: list[dict[str, Any]],
) -> AccountBillingSummary:
    """Calculate billing summary for a single account and its CDN resources."""
    free_tier_gb = float(account.get("free_tier_gb", 0.0) or 0.0)
    price_per_gb = float(account.get("price_per_gb", 1.50) or 1.50)
    package_cost_rub = float(account.get("package_cost_rub", 0.0) or 0.0)
    ignore_bonus = bool(account.get("ignore_bonus", False))
    bonus_balance_rub = float(account.get("bonus_balance_rub", 0.0) or 0.0)
    balance_rub = float(account.get("balance_rub", 0.0) or 0.0)
    low_balance_threshold = float(account.get("low_balance_threshold", 200.0) or 200.0)

    total_traffic_gb = round(sum(float(r.get("total_gb", 0.0) or 0.0) for r in resources), 3)

    free_tier_used_gb = min(total_traffic_gb, free_tier_gb)
    billable_traffic_gb = round(max(0.0, total_traffic_gb - free_tier_gb), 3)

    gross_cost = round(package_cost_rub + (billable_traffic_gb * price_per_gb), 2)

    if ignore_bonus and bonus_balance_rub > 0:
        bonus_spend = min(bonus_balance_rub, gross_cost)
        real_cost = max(0.0, gross_cost - bonus_spend)
    else:
        bonus_spend = 0.0
        real_cost = gross_cost
    real_cost = round(real_cost, 2)
    bonus_spend = round(bonus_spend, 2)

    resource_summaries: list[ResourceBillingSummary] = []
    unsettled_account_cost = 0.0
    num_resources = len(resources)

    for r in resources:
        r_total_gb = float(r.get("total_gb", 0.0) or 0.0)
        paid_watermark_gb = float(r.get("paid_watermark_gb", 0.0) or 0.0)
        paid_watermark_cost = float(r.get("paid_watermark_cost", 0.0) or 0.0)
        unsettled_gb = max(0.0, r_total_gb - paid_watermark_gb)

        custom_cost = r.get("custom_cost_rub")
        if custom_cost is not None:
            cumulative_cost = float(custom_cost)
            free_allocated_gb = 0.0
            billable_gb = r_total_gb
        else:
            if total_traffic_gb > 0:
                share = r_total_gb / total_traffic_gb
                cumulative_cost = round(real_cost * share, 2)
                free_allocated_gb = round(free_tier_used_gb * share, 2)
                billable_gb = round(r_total_gb - free_allocated_gb, 2)
            else:
                share = 1.0 / num_resources if num_resources > 0 else 0.0
                cumulative_cost = round(real_cost * share, 2)
                free_allocated_gb = 0.0
                billable_gb = 0.0

        unsettled_cost = max(0.0, round(cumulative_cost - paid_watermark_cost, 2))
        unsettled_account_cost += unsettled_cost

        summary = ResourceBillingSummary(
            id=str(r["id"]),
            account_id=str(account["id"]),
            provider_resource_id=r.get("provider_resource_id"),
            domain=r["domain"],
            cname=r.get("cname"),
            status=r.get("status", "active"),
            consumer=r.get("consumer", "split"),
            total_gb=round(r_total_gb, 2),
            unsettled_gb=round(unsettled_gb, 2),
            current_cumulative_cost=cumulative_cost,
            unsettled_cost=unsettled_cost,
            free_allocated_gb=free_allocated_gb,
            billable_gb=billable_gb,
            paid_watermark_gb=round(paid_watermark_gb, 2),
            paid_watermark_cost=round(paid_watermark_cost, 2),
            check_path=r.get("check_path", "/"),
            expected_codes=r.get("expected_codes", "200,204,301,302,400,404"),
            http_status=r.get("http_status", "unknown"),
            http_code=r.get("http_code"),
            http_latency_ms=r.get("http_latency_ms"),
            last_checked_at=r.get("last_checked_at"),
            check_error=r.get("check_error"),
            is_manual=bool(r.get("is_manual", False)),
        )
        resource_summaries.append(summary)

    is_low_balance = balance_rub < low_balance_threshold

    return AccountBillingSummary(
        id=str(account["id"]),
        provider=account["provider"],
        name=account["name"],
        payer=account["payer"],
        balance_rub=balance_rub,
        bonus_balance_rub=bonus_balance_rub,
        currency=account.get("currency", "RUB"),
        account_identifier=account.get("account_identifier"),
        free_tier_gb=free_tier_gb,
        price_per_gb=price_per_gb,
        package_cost_rub=package_cost_rub,
        ignore_bonus=ignore_bonus,
        low_balance_threshold=low_balance_threshold,
        is_low_balance=is_low_balance,
        sync_status=account.get("sync_status", "ok"),
        sync_error=account.get("sync_error"),
        last_synced_at=account.get("last_synced_at"),
        total_traffic_gb=total_traffic_gb,
        free_tier_used_gb=round(free_tier_used_gb, 2),
        billable_traffic_gb=round(billable_traffic_gb, 2),
        gross_cost_rub=gross_cost,
        bonus_spend_rub=bonus_spend,
        real_cost_rub=real_cost,
        unsettled_cost_rub=round(unsettled_account_cost, 2),
        resources=resource_summaries,
    )
