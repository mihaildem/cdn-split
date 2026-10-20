"""Type definitions and models for integer kopeck daily ledger engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class PayerHistoryEntry:
    account_id: str
    member_id: str
    effective_from: str  # YYYY-MM-DD


@dataclass
class ConsumerHistoryEntry:
    resource_id: str
    mode: Literal["member", "split_all", "unassigned"]
    member_id: str | None = None
    effective_from: str = "1970-01-01"  # YYYY-MM-DD


@dataclass
class DayTrafficRecord:
    resource_id: str
    date: str  # YYYY-MM-DD
    gb: float


@dataclass
class DayCostResult:
    date: str
    total_gb: float
    cum_before_gb: float
    cum_after_gb: float
    billable_gb: float
    gross_cost_kop: int
    bonus_part_kop: int
    billable_cost_kop: int
    resource_costs_kop: dict[str, int]
    resource_billable_gb: dict[str, float]


@dataclass
class LedgerEntry:
    date: str
    member_id: str
    kind: Literal["paid", "consumed", "correction"]
    amount_kop: int
    source_ref: str  # e.g. account_id or resource_id


@dataclass
class KopTransfer:
    from_member: str
    from_name: str
    to_member: str
    to_name: str
    amount_kop: int
    amount_rub: int  # Rounded to whole rubles per spec 7.6


@dataclass
class MemberBalance:
    member_id: str
    paid_kop: int = 0
    consumed_kop: int = 0
    corrections_kop: int = 0
    transfers_sent_kop: int = 0
    transfers_received_kop: int = 0

    @property
    def net_balance_kop(self) -> int:
        return (
            self.paid_kop
            - self.consumed_kop
            + self.corrections_kop
            + self.transfers_sent_kop
            - self.transfers_received_kop
        )

    @property
    def net_balance_rub(self) -> float:
        return round(self.net_balance_kop / 100.0, 2)


@dataclass
class PeriodLedgerResult:
    balances: dict[str, MemberBalance]
    unassigned_kop: int
    unassigned_resource_ids: list[str]
    ledger_entries: list[LedgerEntry]
    day_costs: list[DayCostResult]
    recommended_transfers: list[KopTransfer]
