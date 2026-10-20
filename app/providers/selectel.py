"""Selectel provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    ProviderResourceResult,
    register_provider,
)


class SelectelProvider(BaseProvider):
    provider_id = "selectel"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        token = str(credentials.get("api_token", "")).strip()
        if not token:
            return ProviderAccountResult(
                success=False, error="API-токен Selectel не указан"
            )

        headers = {"X-Token": token, "Accept": "application/json"}
        balance_url = "https://api.selectel.ru/v2/billing/balance"
        resp = await client.get(balance_url, headers=headers)
        if resp.status_code in (401, 403):
            return ProviderAccountResult(
                success=False,
                error="Ошибка авторизации Selectel (неверный или недействительный X-Token)",
            )
        if resp.status_code != 200:
            return ProviderAccountResult(
                success=False,
                error=f"Selectel API вернул HTTP {resp.status_code}: {resp.text[:150]}",
            )

        data = resp.json()
        balance_info = data.get("data", data.get("balance", {}))
        primary = float(balance_info.get("primary", 0.0) or 0.0)
        bonus = float(balance_info.get("bonus", 0.0) or 0.0)
        if primary > 10000 and isinstance(primary, int):
            primary = primary / 100.0
        if bonus > 10000 and isinstance(bonus, int):
            bonus = bonus / 100.0

        resources: list[ProviderResourceResult] = []
        cdn_urls = [
            "https://api.selectel.ru/v2/cdn/domains",
            "https://cdn.selectel.ru/v1/resources",
        ]
        for cdn_url in cdn_urls:
            try:
                cdn_resp = await client.get(cdn_url, headers=headers)
                if cdn_resp.status_code == 200:
                    cdn_data = cdn_resp.json()
                    items = (
                        cdn_data
                        if isinstance(cdn_data, list)
                        else cdn_data.get("resources", cdn_data.get("domains", []))
                    )
                    for item in items:
                        domain = (
                            item.get("domain")
                            or item.get("cname")
                            or item.get("name")
                        )
                        if domain:
                            status_val = (
                                "active"
                                if item.get("status") in ("active", "enabled", None)
                                else "suspended"
                            )
                            resources.append(
                                ProviderResourceResult(
                                    provider_resource_id=str(
                                        item.get("id", domain)
                                    ),
                                    domain=domain,
                                    cname=item.get("cname")
                                    or item.get("cdn_cname"),
                                    status=status_val,
                                    total_gb=float(
                                        item.get("traffic_gb", 0.0) or 0.0
                                    ),
                                )
                            )
                    break
            except Exception:
                pass

        return ProviderAccountResult(
            success=True,
            balance_rub=round(primary, 2),
            bonus_balance_rub=round(bonus, 2),
            account_identifier="Selectel Account",
            resources=resources,
        )


register_provider(SelectelProvider())
