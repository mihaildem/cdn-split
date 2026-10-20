"""Base provider strategy, models, and catalog registry."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import httpx
from pydantic import BaseModel


class ProviderField(BaseModel):
    key: str
    label: str
    type: str = "text"
    placeholder: str = ""
    required: bool = True
    help: str | None = None


class ProviderHelp(BaseModel):
    title: str
    portal_url: str
    portal_label: str
    steps: list[str]
    notes: str | None = None


class ProviderMeta(BaseModel):
    id: str
    name: str
    color: str
    default_free_gb: float
    default_price_per_gb: float
    fields: list[ProviderField]
    help: ProviderHelp


class ProviderResourceResult(BaseModel):
    provider_resource_id: str | None = None
    domain: str
    cname: str | None = None
    status: str = "active"
    total_gb: float = 0.0


class ProviderAccountResult(BaseModel):
    success: bool
    balance_rub: float = 0.0
    bonus_balance_rub: float = 0.0
    account_identifier: str | None = None
    resources: list[ProviderResourceResult] = []
    error: str | None = None


def load_providers_catalog() -> dict[str, ProviderMeta]:
    data_path = Path(__file__).resolve().parent.parent / "data" / "providers_catalog.json"
    if not data_path.exists():
        return {}
    with open(data_path, "r", encoding="utf-8") as f:
        raw_catalog = json.load(f)
    return {pid: ProviderMeta(**meta) for pid, meta in raw_catalog.items()}


PROVIDERS_REGISTRY: dict[str, ProviderMeta] = load_providers_catalog()


def get_all_providers_metadata() -> list[ProviderMeta]:
    return list(PROVIDERS_REGISTRY.values())


def get_provider_metadata(provider_id: str) -> ProviderMeta | None:
    return PROVIDERS_REGISTRY.get(provider_id)


class BaseProvider:
    provider_id: str = ""

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        raise NotImplementedError

    async def sync(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        return await self.verify_credentials(client, credentials)


_DISPATCHER: dict[str, BaseProvider] = {}


def register_provider(provider: BaseProvider) -> None:
    _DISPATCHER[provider.provider_id] = provider


def get_provider_instance(provider_id: str) -> BaseProvider | None:
    return _DISPATCHER.get(provider_id)


async def test_provider_credentials(
    provider_id: str, credentials: dict[str, Any]
) -> ProviderAccountResult:
    if provider_id not in PROVIDERS_REGISTRY:
        return ProviderAccountResult(
            success=False, error=f"Неизвестный провайдер: {provider_id}"
        )

    token_str = str(
        credentials.get("api_token")
        or credentials.get("oauth_token")
        or credentials.get("api_key")
        or ""
    )
    if token_str.startswith("demo_") or token_str == "test":
        return ProviderAccountResult(
            success=True,
            balance_rub=1450.0,
            bonus_balance_rub=150.0,
            account_identifier="demo-client@domain.ru",
            resources=[
                ProviderResourceResult(
                    provider_resource_id="demo-1",
                    domain="demo-cdn.example.com",
                    cname="cname.cdn-provider.net",
                    status="active",
                    total_gb=42.5,
                )
            ],
        )

    provider = get_provider_instance(provider_id)
    if not provider:
        return ProviderAccountResult(
            success=False, error=f"Провайдер {provider_id} не реализован"
        )

    async with httpx.AsyncClient(timeout=6.0) as client:
        try:
            return await provider.verify_credentials(client, credentials)
        except httpx.ConnectTimeout:
            return ProviderAccountResult(
                success=False,
                error="Таймаут подключения к API провайдера (сервер не ответил за 6 сек)",
            )
        except httpx.ConnectError as e:
            return ProviderAccountResult(
                success=False, error=f"Ошибка соединения с API: {str(e)}"
            )
        except Exception as e:
            return ProviderAccountResult(
                success=False, error=f"Сбой при запросе к API: {str(e)}"
            )


async def verify_account_credentials(
    provider_id: str, credentials: dict[str, Any]
) -> ProviderAccountResult:
    return await test_provider_credentials(provider_id, credentials)


async def sync_account_from_provider(
    provider_id: str, credentials: dict[str, Any]
) -> ProviderAccountResult:
    return await test_provider_credentials(provider_id, credentials)
