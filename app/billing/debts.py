"""Debt simplification and Russian grammatical case helpers."""

from __future__ import annotations

import re
from typing import Any
from app.models import DebtTransfer

DEFAULT_PARTICIPANTS = [
    {"id": "misha", "name": "Миша", "color": "#38bdf8"},
    {"id": "max", "name": "Макс", "color": "#c084fc"},
]


def _format_dative(name: str) -> str:
    """Format name in Russian dative case if simple grammatical pattern applies."""
    if not name:
        return name
    if name == "Миша":
        return "Мише"
    if name == "Макс":
        return "Максу"
    if name.endswith("а") or name.endswith("я"):
        return name[:-1] + "е"
    if re.search(r"[бвгджзклмнпрстфхцчшщ]$", name, re.IGNORECASE):
        return name + "у"
    return name


def simplify_debts(
    balances: dict[str, float],
    names: dict[str, str],
) -> list[DebtTransfer]:
    """Greedy debt simplification for multi-party Splitwise mutual offsets."""
    debtors: list[list[Any]] = []
    creditors: list[list[Any]] = []

    for p_id, bal in balances.items():
        rounded_bal = round(bal, 2)
        if rounded_bal < -0.005:
            debtors.append([p_id, -rounded_bal])
        elif rounded_bal > 0.005:
            creditors.append([p_id, rounded_bal])

    debtors.sort(key=lambda x: x[1], reverse=True)
    creditors.sort(key=lambda x: x[1], reverse=True)

    transfers: list[DebtTransfer] = []
    d_idx = 0
    c_idx = 0

    while d_idx < len(debtors) and c_idx < len(creditors):
        debtor_id, owes = debtors[d_idx]
        creditor_id, credit = creditors[c_idx]

        amount = round(min(owes, credit), 2)
        if amount > 0.005:
            transfers.append(
                DebtTransfer(
                    from_id=debtor_id,
                    from_name=names.get(debtor_id, debtor_id),
                    to_id=creditor_id,
                    to_name=names.get(creditor_id, creditor_id),
                    amount=amount,
                )
            )

        owes = round(owes - amount, 2)
        credit = round(credit - amount, 2)

        if owes <= 0.005:
            d_idx += 1
        else:
            debtors[d_idx][1] = owes

        if credit <= 0.005:
            c_idx += 1
        else:
            creditors[c_idx][1] = credit

    return transfers
