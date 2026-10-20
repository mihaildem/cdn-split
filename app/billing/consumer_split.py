"""Consumer split logic and deterministic kopeck remainder distribution."""

from __future__ import annotations

from typing import Any, Sequence


def member_sort_key(member_id: str) -> tuple[int, Any]:
    """Deterministic sort key for members prioritizing canonical order (Misha first, Max second)."""
    special = {"misha": 0, "max": 1}
    if str(member_id).lower() in special:
        return (0, special[str(member_id).lower()])
    try:
        return (1, int(member_id))
    except ValueError:
        return (2, str(member_id))


def split_cost_equally_kop(
    cost_kop: int,
    active_member_ids: Sequence[str],
) -> dict[str, int]:
    """Divide day cost equally among active members in integer kopecks.
    
    Any remainder kopecks (1 or 2 kop) are deterministically allocated to the member(s)
    with the smallest member_sort_key.
    Example: 100.00 ₽ (10000 kop) split 3 ways -> 3334, 3333, 3333 kop.
    """
    if not active_member_ids:
        return {}

    n = len(active_member_ids)
    base_kop = cost_kop // n
    rem_kop = cost_kop % n

    sorted_members = sorted(active_member_ids, key=member_sort_key)
    result: dict[str, int] = {}

    for i, m_id in enumerate(sorted_members):
        result[m_id] = base_kop + (1 if i < rem_kop else 0)

    assert sum(result.values()) == cost_kop
    return result


def allocate_resource_day_cost(
    cost_kop: int,
    mode: str,
    consumer_member_id: str | None,
    active_member_ids: Sequence[str],
) -> tuple[dict[str, int], int]:
    """Allocate resource day cost to members or unassigned pool.
    
    Returns:
        (consumed_by_member_kop, unassigned_kop)
    """
    if cost_kop <= 0:
        return ({}, 0)

    if mode == "unassigned":
        return ({}, cost_kop)

    if mode == "split_all":
        shares = split_cost_equally_kop(cost_kop, active_member_ids)
        return (shares, 0)

    # Specific member
    target_id = consumer_member_id or mode
    return ({target_id: cost_kop}, 0)
