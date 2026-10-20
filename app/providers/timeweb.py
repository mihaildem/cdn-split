"""Timeweb Cloud provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    register_provider,
)


class TimewebProvider(BaseProvider):
    provider_id = "timeweb"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        token = str(credentials.get("api_token", "")).strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token:
            return ProviderAccountResult(
                success=False, error="API-токен Timeweb Cloud не указан"
            )

        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        status_url = "https://api.timeweb.cloud/api/v1/account/status"
        resp = await client.get(status_url, headers=headers)
        if resp.status_code in (401, 403):
            return ProviderAccountResult(
                success=False,
                error="Ошибка авторизации Timeweb Cloud (неверный Bearer токен)",
            )
        if resp.status_code != 200:
            return ProviderAccountResult(
                success=False,
                error=f"Timeweb API вернул HTTP {resp.status_code}: {resp.text[:150]}",
            )

        data = resp.json().get("status", {})
        balance = float(data.get("balance", 0.0) or 0.0)
        company = data.get("company_name") or data.get("account_id") or "Timeweb Client"

        return ProviderAccountResult(
            success=True,
            balance_rub=round(balance, 2),
            bonus_balance_rub=0.0,
            account_identifier=str(company),
            resources=[],
        )


register_provider(TimewebProvider())
