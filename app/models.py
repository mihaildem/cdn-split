"""Data models for CDN Splitwise service."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


ConsumerType = Literal["misha", "max", "split"]
PayerType = Literal["misha", "max"]
ProviderType = Literal["yandex", "selectel", "vk", "mts", "timeweb", "beget"]


class AccountCreate(BaseModel):
    provider: ProviderType
    name: str
    payer: PayerType = "misha"
    credentials: dict[str, Any] = Field(default_factory=dict)
    balance_rub: float = 0.0
    bonus_balance_rub: float = 0.0
    account_identifier: str | None = None
    free_tier_gb: float = 0.0
    price_per_gb: float = 1.50
    package_cost_rub: float = 0.0
    ignore_bonus: bool = False
    low_balance_threshold: float = 200.0


class AccountUpdate(BaseModel):
    name: str | None = None
    payer: PayerType | None = None
    credentials: dict[str, Any] | None = None
    balance_rub: float | None = None
    bonus_balance_rub: float | None = None
    account_identifier: str | None = None
    free_tier_gb: float | None = None
    price_per_gb: float | None = None
    package_cost_rub: float | None = None
    ignore_bonus: bool | None = None
    low_balance_threshold: float | None = None


class ResourceCreate(BaseModel):
    account_id: str
    domain: str
    cname: str | None = None
    status: str = "active"
    consumer: ConsumerType = "split"
    total_gb: float = 0.0
    custom_cost_rub: float | None = None
    check_path: str = "/"
    expected_codes: str = "200,204,301,302,400,404"


class ResourceUpdate(BaseModel):
    domain: str | None = None
    cname: str | None = None
    status: str | None = None
    consumer: ConsumerType | None = None
    total_gb: float | None = None
    custom_cost_rub: float | None = None
    check_path: str | None = None
    expected_codes: str | None = None


class ResourceConsumerUpdate(BaseModel):
    consumer: ConsumerType


class ResourceBillingSummary(BaseModel):
    id: str
    account_id: str
    provider_resource_id: str | None
    domain: str
    cname: str | None
    status: str
    consumer: ConsumerType
    total_gb: float
    unsettled_gb: float
    current_cumulative_cost: float
    unsettled_cost: float
    free_allocated_gb: float
    billable_gb: float
    paid_watermark_gb: float
    paid_watermark_cost: float
    check_path: str
    expected_codes: str
    http_status: str
    http_code: int | None
    http_latency_ms: float | None
    last_checked_at: str | None
    check_error: str | None
    is_manual: bool


class AccountBillingSummary(BaseModel):
    id: str
    provider: ProviderType
    name: str
    payer: PayerType
    balance_rub: float
    bonus_balance_rub: float
    currency: str
    account_identifier: str | None
    free_tier_gb: float
    price_per_gb: float
    package_cost_rub: float
    ignore_bonus: bool
    low_balance_threshold: float
    is_low_balance: bool
    sync_status: str
    sync_error: str | None
    last_synced_at: str | None
    total_traffic_gb: float
    free_tier_used_gb: float
    billable_traffic_gb: float
    gross_cost_rub: float
    bonus_spend_rub: float
    real_cost_rub: float
    unsettled_cost_rub: float
    resources: list[ResourceBillingSummary]


class SplitwiseOverview(BaseModel):
    misha_owes_max: float
    max_owes_misha: float
    net_balance: float
    direction: Literal["max_owes_misha", "misha_owes_max", "settled"]
    summary_text: str
    misha_paid_total: float
    max_paid_total: float
    misha_consumed_total: float
    max_consumed_total: float
    total_unsettled_cost: float
    total_resources_count: int
    active_resources_count: int
    down_resources_count: int
    accounts_count: int


class DashboardResponse(BaseModel):
    splitwise: SplitwiseOverview
    accounts: list[AccountBillingSummary]
    last_updated_at: str


class TelegramBotCreate(BaseModel):
    name: str
    bot_token: str
    chat_id: str
    filter_owner: Literal["all", "misha", "max"] = "all"
    notify_low_balance: bool = True
    notify_api_error: bool = True
    notify_cdn_down: bool = True
    notify_settlement: bool = True


class TelegramBotUpdate(BaseModel):
    name: str | None = None
    bot_token: str | None = None
    chat_id: str | None = None
    filter_owner: Literal["all", "misha", "max"] | None = None
    notify_low_balance: bool | None = None
    notify_api_error: bool | None = None
    notify_cdn_down: bool | None = None
    notify_settlement: bool | None = None


class TelegramBotResponse(BaseModel):
    id: str
    name: str
    bot_token: str  # Masked when returned in list
    chat_id: str
    filter_owner: str
    notify_low_balance: bool
    notify_api_error: bool
    notify_cdn_down: bool
    notify_settlement: bool
    created_at: str
    updated_at: str


class SettlementResponse(BaseModel):
    id: str
    settled_at: str
    misha_owes_max: float
    max_owes_misha: float
    net_balance: float
    note: str | None
