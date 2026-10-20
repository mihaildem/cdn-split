"""Beget provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    register_provider,
)


class BegetProvider(BaseProvider):
    provider_id = "beget"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        login = str(credentials.get("login", "")).strip()
        password = str(credentials.get("password", "")).strip()
        if not login or not password:
            return ProviderAccountResult(
                success=False, error="Логин и пароль Beget обязательны"
            )

        try:
            url = "https://api.beget.com/api/user/getAccountInfo"
            resp = await client.get(
                url,
                params={
                    "login": login,
                    "passwd": password,
                    "output_format": "json",
                },
            )
            if resp.status_code == 200:
                data = resp.json().get("answer", {}).get("result", {})
                balance = float(data.get("balance", 0.0) or 0.0)
                return ProviderAccountResult(
                    success=True,
                    balance_rub=balance,
                    account_identifier=login,
                )
        except Exception:
            pass

        return ProviderAccountResult(
            success=True,
            balance_rub=0.0,
            account_identifier=login,
        )


register_provider(BegetProvider())
