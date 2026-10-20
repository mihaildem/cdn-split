"""VK Cloud provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    register_provider,
)


class VKProvider(BaseProvider):
    provider_id = "vk"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        token = str(credentials.get("api_token", "")).strip()
        project_id = str(credentials.get("project_id", "")).strip()
        if not token:
            return ProviderAccountResult(
                success=False, error="API-токен VK Cloud не указан"
            )

        headers = {"X-Auth-Token": token, "Accept": "application/json"}
        try:
            url = "https://infra.mail.ru/api/v1/balance"
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                balance = float(data.get("balance", 0.0) or 0.0)
                return ProviderAccountResult(
                    success=True,
                    balance_rub=balance,
                    account_identifier=project_id or "VK Cloud Project",
                )
        except Exception:
            pass

        return ProviderAccountResult(
            success=True,
            balance_rub=0.0,
            account_identifier=project_id or "VK Cloud Project",
        )


register_provider(VKProvider())
