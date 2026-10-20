"""Greedy minimal transfers algorithm in integer kopecks."""

from __future__ import annotations

from typing import Mapping
from app.billing.types import KopTransfer


def simplify_debts_kop(
    balances_kop: Mapping[str, int],
    names: Mapping[str, str] | None = None,
) -> list[KopTransfer]:
    """Greedy minimal transfers algorithm for 2-4 members in integer kopecks.
    
    Implements Section 7.6:
    - Debtors sorted by largest owed amount descending.
    - Creditors sorted by largest credit amount descending.
    - Largest debtor pays largest creditor until settled.
    - Transfer amount in whole rubles: round(amount_kop / 100).
    - Threshold 'в расчёте': abs(balance_kop) < 100 (< 1 ₽).
    """
    names_map = dict(names or {})
    debtors: list[list[object]] = []
    creditors: list[list[object]] = []

    for m_id, bal in balances_kop.items():
        if bal <= -100:  # owes 1 ₽ or more
            debtors.append([m_id, -bal])
        elif bal >= 100:  # is owed 1 ₽ or more
            creditors.append([m_id, bal])

    # Sort descending by amount
    debtors.sort(key=lambda x: int(x[1]), reverse=True)
    creditors.sort(key=lambda x: int(x[1]), reverse=True)

    transfers: list[KopTransfer] = []
    d_idx = 0
    c_idx = 0

    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor_id = str(debtors[d_idx][0])
        owes = int(debtors[d_idx][1])
        creditor_id = str(creditors[c_idx][0])
        credit = int(creditors[c_idx][1])

        amount_kop = min(owes, credit)
        if amount_kop >= 50:  # At least 50 kopecks (rounds to >= 1 ₽)
            amount_rub = int(round(amount_kop / 100.0))
            transfers.append(
                KopTransfer(
                    from_member=debtor_id,
                    from_name=names_map.get(debtor_id, debtor_id),
                    to_member=creditor_id,
                    to_name=names_map.get(creditor_id, creditor_id),
                    amount_kop=amount_kop,
                    amount_rub=amount_rub,
                )
            )

        owes -= amount_kop
        credit -= amount_kop

        if owes < 100:
            d_idx += 1
        else:
            debtors[d_idx][1] = owes

        if credit < 100:
            c_idx += 1
        else:
            creditors[c_idx][1] = credit

    return transfers
