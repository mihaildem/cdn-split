"""MTS Cloud provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    register_provider,
)


class MTSProvider(BaseProvider):
    provider_id = "mts"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        key = str(credentials.get("api_key", "")).strip()
        if not key:
            return ProviderAccountResult(
                success=False, error="API-ключ MTS Cloud не указан"
            )

        return ProviderAccountResult(
            success=True,
            balance_rub=0.0,
            account_identifier=str(
                credentials.get("tenant_id") or "CloudMTS Account"
            ),
        )


register_provider(MTSProvider())
