"""Forecasts, runway ('хватит на N дней'), and traffic spike detection per Section 7.9."""

from __future__ import annotations

import statistics
from typing import Sequence


def calculate_7d_rolling_avg(daily_costs_kop: Sequence[int]) -> float:
    """Calculate 7-day rolling average daily spend in kopecks."""
    if not daily_costs_kop:
        return 0.0
    recent = list(daily_costs_kop[-7:])
    return float(sum(recent)) / len(recent)


def forecast_period_cost_kop(
    already_spent_kop: int,
    avg_daily_kop: float,
    remaining_days: int,
) -> int:
    """Forecast total spend at the end of the period: already_spent + avg_7d * remaining_days."""
    forecast = already_spent_kop + (avg_daily_kop * max(0, remaining_days))
    return int(round(forecast))


def calculate_runway_days(
    money_rub: float,
    bonus_rub: float,
    avg_daily_cost_rub: float,
) -> tuple[float | None, str]:
    """Calculate runway ('хватит на N дней') and severity level.
    
    Returns:
        (runway_days, severity)
        severity: 'critical' (< 3 days), 'warning' (3-7 days), 'ok' (>= 7 days or inactive)
    """
    total_funds = money_rub + bonus_rub
    if avg_daily_cost_rub <= 0.001 or total_funds <= 0:
        if total_funds <= 0 and avg_daily_cost_rub > 0.001:
            return (0.0, "critical")
        return (None, "ok")

    days = total_funds / avg_daily_cost_rub
    if days < 3.0:
        severity = "critical"
    elif days < 7.0:
        severity = "warning"
    else:
        severity = "ok"

    return (round(days, 1), severity)


def detect_traffic_spike(
    traffic_history_gb: Sequence[float],
    threshold_ratio: float = 2.5,
    min_gb: float = 5.0,
) -> bool:
    """Detect traffic spike per Section 7.9:
    
    Last day traffic >= 2.5 * median(prev_7_days) AND last day traffic >= 5 GB.
    """
    if len(traffic_history_gb) < 2:
        return False

    last_day_gb = float(traffic_history_gb[-1])
    if last_day_gb < min_gb:
        return False

    prev_window = list(traffic_history_gb[-8:-1]) if len(traffic_history_gb) > 7 else list(traffic_history_gb[:-1])
    if not prev_window:
        return False

    med = statistics.median(prev_window)
    if med <= 0:
        return True  # Zero previous traffic and >= 5 GB is a spike

    return (last_day_gb / med) >= threshold_ratio
