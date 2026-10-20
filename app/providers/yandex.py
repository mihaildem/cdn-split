"""Yandex Cloud provider API client."""

from __future__ import annotations

from typing import Any
import httpx
from app.providers.base import (
    BaseProvider,
    ProviderAccountResult,
    ProviderResourceResult,
    register_provider,
)


class YandexProvider(BaseProvider):
    provider_id = "yandex"

    async def verify_credentials(
        self, client: httpx.AsyncClient, credentials: dict[str, Any]
    ) -> ProviderAccountResult:
        token = str(credentials.get("oauth_token", "")).strip()
        folder_id = str(credentials.get("folder_id", "")).strip()
        if not token:
            return ProviderAccountResult(
                success=False, error="OAuth/IAM токен Yandex Cloud не указан"
            )

        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        resources: list[ProviderResourceResult] = []

        if folder_id:
            try:
                cdn_url = f"https://cdn.api.cloud.yandex.net/cdn/v1/resource?folderId={folder_id}"
                cdn_resp = await client.get(cdn_url, headers=headers)
                if cdn_resp.status_code == 200:
                    cdn_data = cdn_resp.json().get("resources", [])
                    for r in cdn_data:
                        cnames = r.get("cnames", [])
                        main_domain = cnames[0] if cnames else r.get("id")
                        resources.append(
                            ProviderResourceResult(
                                provider_resource_id=r.get("id"),
                                domain=main_domain,
                                cname=r.get("cname"),
                                status="active" if r.get("active", True) else "suspended",
                                total_gb=0.0,
                            )
                        )
            except Exception:
                pass

        balance_rub = 0.0
        try:
            b_url = "https://billing.api.cloud.yandex.net/billing/v1/billingAccounts"
            b_resp = await client.get(b_url, headers=headers)
            if b_resp.status_code == 200:
                b_data = b_resp.json().get("billingAccounts", [])
                if b_data:
                    balance_rub = float(b_data[0].get("balance", 0.0) or 0.0)
        except Exception:
            pass

        return ProviderAccountResult(
            success=True,
            balance_rub=balance_rub,
            bonus_balance_rub=0.0,
            account_identifier=f"Folder {folder_id}" if folder_id else "Yandex Cloud",
            resources=resources,
        )


register_provider(YandexProvider())
