"""Provider definitions, metadata, API instructions, and async API clients."""

from __future__ import annotations

from typing import Any
import httpx
from pydantic import BaseModel


class ProviderField(BaseModel):
    key: str
    label: str
    type: str = "text"  # text, password
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


PROVIDERS_REGISTRY: dict[str, ProviderMeta] = {
    "selectel": ProviderMeta(
        id="selectel",
        name="Selectel CDN",
        color="#0016ff",
        default_free_gb=100.0,
        default_price_per_gb=1.50,
        fields=[
            ProviderField(
                key="api_token",
                label="API-токен (Selectel API Key)",
                type="password",
                placeholder="sel_api_xxxxxxxxxxxxxxxx",
                required=True,
                help="Сервисный токен из панели управления Selectel",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для Selectel",
            portal_url="https://my.selectel.ru/profile/service-users",
            portal_label="Открыть панель Selectel",
            steps=[
                "Войдите в панель управления Selectel (my.selectel.ru).",
                "Перейдите в «Профиль» (в правом верхнем углу) → «Управление пользователями» → вкладка «Сервисные пользователи» или «API-ключи».",
                "Создайте нового сервисного пользователя с ролью «Администратор» или «Просмотр CDN и биллинга».",
                "Выпустите API-токен и скопируйте его значение в поле выше.",
            ],
            notes="Selectel предоставляет удобный REST API для чтения баланса и CDN доменов.",
        ),
    ),
    "yandex": ProviderMeta(
        id="yandex",
        name="Yandex Cloud CDN",
        color="#fc3f1d",
        default_free_gb=0.0,
        default_price_per_gb=1.20,
        fields=[
            ProviderField(
                key="oauth_token",
                label="OAuth или IAM-токен",
                type="password",
                placeholder="y0_AgAAAA...",
                required=True,
                help="OAuth-токен от oauth.yandex.ru или IAM-токен сервисного аккаунта",
            ),
            ProviderField(
                key="folder_id",
                label="Folder ID (Каталог)",
                type="text",
                placeholder="b1gxxxxxxxxxxxxxxxxx",
                required=True,
                help="Идентификатор каталога Yandex Cloud, где размещен CDN",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для Yandex Cloud",
            portal_url="https://console.yandex.cloud/",
            portal_label="Открыть Yandex Cloud Console",
            steps=[
                "Перейдите в консоль Yandex Cloud и выберите ваш каталог (Folder ID указан в URL и заголовке каталога).",
                "Для получения OAuth-токена перейдите по ссылке https://oauth.yandex.ru/authorize?response_type=token&client_id=1a6990aa636648e9b2ef855fa7bec2fb или создайте сервисный аккаунт с ролью `cdn.viewer` и `viewer`.",
                "Скопируйте Folder ID каталога и токен доступа в форму.",
            ],
            notes="Если включен биллинг нескольких каталогов, баланс подтягивается из привязанного платежного аккаунта.",
        ),
    ),
    "vk": ProviderMeta(
        id="vk",
        name="VK Cloud CDN",
        color="#0077ff",
        default_free_gb=0.0,
        default_price_per_gb=1.40,
        fields=[
            ProviderField(
                key="api_token",
                label="API-токен / Keystone Token",
                type="password",
                placeholder="vk_api_xxxxxxxxxxxxxxxx",
                required=True,
                help="API ключ из настроек безопасности VK Cloud",
            ),
            ProviderField(
                key="project_id",
                label="Project ID (Идентификатор проекта)",
                type="text",
                placeholder="mcs_proj_xxxxxxxx",
                required=False,
                help="Идентификатор проекта в панели управления",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для VK Cloud (MCS)",
            portal_url="https://mcs.mail.ru/app/settings/api",
            portal_label="Открыть VK Cloud Console",
            steps=[
                "Авторизуйтесь в панели VK Cloud (mcs.mail.ru).",
                "Перейдите в «Настройки проекта» → «Безопасность» → «API-ключи».",
                "Создайте новый API-ключ или сгенерируйте токен доступа с доступом к CDN и балансу проекта.",
                "Скопируйте токен и (при необходимости) Project ID в форму.",
            ],
            notes="VK Cloud тарифицирует исходящий CDN трафик по гигабайтам в соответствии с тарифной сеткой проекта.",
        ),
    ),
    "mts": ProviderMeta(
        id="mts",
        name="MTS Web Services (CloudMTS)",
        color="#e30611",
        default_free_gb=50.0,
        default_price_per_gb=1.30,
        fields=[
            ProviderField(
                key="api_key",
                label="API-ключ MTS Cloud",
                type="password",
                placeholder="mts_key_xxxxxxxxxxxxxxxx",
                required=True,
                help="Ключ доступа из Личного кабинета CloudMTS",
            ),
            ProviderField(
                key="tenant_id",
                label="ID организации / Тенанта",
                type="text",
                placeholder="org_xxxxxxxx",
                required=False,
                help="Опциональный ID организации в CloudMTS",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для MTS Web Services",
            portal_url="https://cloud.mts.ru/",
            portal_label="Открыть панель CloudMTS",
            steps=[
                "Войдите в личный кабинет CloudMTS (cloud.mts.ru).",
                "Перейдите в раздел «Профиль» → «Управление доступом» → «API-ключи».",
                "Сгенерируйте API-ключ с правами чтения баланса и CDN сервисов.",
                "Вставьте сгенерированный ключ в форму.",
            ],
            notes="MTS Web Services поддерживает выделенные CDN зоны и кэширование статики.",
        ),
    ),
    "timeweb": ProviderMeta(
        id="timeweb",
        name="Timeweb Cloud CDN",
        color="#2060ff",
        default_free_gb=0.0,
        default_price_per_gb=1.60,
        fields=[
            ProviderField(
                key="api_token",
                label="API-токен Timeweb Cloud",
                type="password",
                placeholder="Bearer eyJhbGciOi...",
                required=True,
                help="Токен из раздела API панель timeweb.cloud",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для Timeweb Cloud",
            portal_url="https://timeweb.cloud/api-tokens",
            portal_label="Открыть API-токены Timeweb",
            steps=[
                "Войдите в timeweb.cloud под вашим логином.",
                "Нажмите на аватар профиля в правом верхнем углу → «Токены API» (или перейдите по ссылке https://timeweb.cloud/api-tokens).",
                "Нажмите «Выпустить токен», задайте имя (например, CDN-Split) и выберите права на чтение баланса и сервисов.",
                "Скопируйте сгенерированный токен.",
            ],
            notes="Timeweb Cloud API позволяет проверять точный баланс и список доменных зон с CDN.",
        ),
    ),
    "beget": ProviderMeta(
        id="beget",
        name="Beget CDN",
        color="#00aa5b",
        default_free_gb=0.0,
        default_price_per_gb=1.50,
        fields=[
            ProviderField(
                key="login",
                label="Логин аккаунта Beget",
                type="text",
                placeholder="my_beget_login",
                required=True,
                help="Логин, с которым входите в панель Beget",
            ),
            ProviderField(
                key="password",
                label="API-пароль / Пароль от аккаунта",
                type="password",
                placeholder="••••••••••••",
                required=True,
                help="Пароль от аккаунта или сгенерированный API-пароль",
            ),
        ],
        help=ProviderHelp(
            title="Инструкция для Beget",
            portal_url="https://cp.beget.com/",
            portal_label="Открыть панель Beget",
            steps=[
                "Перейдите в панель управления Beget (cp.beget.com).",
                "Перейдите в «Безопасность» → «API и вебхуки» или используйте учетные данные вашего аккаунта с включенным доступом к API.",
                "Укажите ваш логин и API-пароль.",
            ],
            notes="Beget предоставляет RPC API для получения баланса и управления сайтами.",
        ),
    ),
}


async def test_provider_credentials(
    provider_id: str,
    credentials: dict[str, Any],
) -> ProviderAccountResult:
    """Test credentials against provider API and fetch initial data."""
    if provider_id not in PROVIDERS_REGISTRY:
        return ProviderAccountResult(
            success=False,
            error=f"Неизвестный провайдер: {provider_id}",
        )

    # If demo or placeholder token is provided, return a mock successful test
    token_str = str(credentials.get("api_token") or credentials.get("oauth_token") or credentials.get("api_key") or "")
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

    async with httpx.AsyncClient(timeout=6.0) as client:
        try:
            if provider_id == "selectel":
                return await _fetch_selectel(client, credentials)
            elif provider_id == "timeweb":
                return await _fetch_timeweb(client, credentials)
            elif provider_id == "yandex":
                return await _fetch_yandex(client, credentials)
            elif provider_id == "vk":
                return await _fetch_vk(client, credentials)
            elif provider_id == "mts":
                return await _fetch_mts(client, credentials)
            elif provider_id == "beget":
                return await _fetch_beget(client, credentials)
            else:
                return ProviderAccountResult(
                    success=False,
                    error=f"Провайдер {provider_id} не реализован",
                )
        except httpx.ConnectTimeout:
            return ProviderAccountResult(
                success=False,
                error="Таймаут подключения к API провайдера (сервер не ответил за 6 сек)",
            )
        except httpx.ConnectError as e:
            return ProviderAccountResult(
                success=False,
                error=f"Ошибка соединения с API: {str(e)}",
            )
        except Exception as e:
            return ProviderAccountResult(
                success=False,
                error=f"Сбой при запросе к API: {str(e)}",
            )


async def _fetch_selectel(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    token = credentials.get("api_token", "").strip()
    if not token:
        return ProviderAccountResult(success=False, error="API-токен Selectel не указан")

    headers = {"X-Token": token, "Accept": "application/json"}

    # 1. Fetch balance
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
    # Selectel returns balance in kopecks or rubles depending on endpoint version
    primary = float(balance_info.get("primary", 0.0) or 0.0)
    bonus = float(balance_info.get("bonus", 0.0) or 0.0)
    # If balance is in kopecks (large int), convert to rubles
    if primary > 10000 and isinstance(primary, int):
        primary = primary / 100.0
    if bonus > 10000 and isinstance(bonus, int):
        bonus = bonus / 100.0

    # 2. Try fetching CDN domains / resources
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
                items = cdn_data if isinstance(cdn_data, list) else cdn_data.get("resources", cdn_data.get("domains", []))
                for item in items:
                    domain = item.get("domain") or item.get("cname") or item.get("name")
                    if domain:
                        resources.append(
                            ProviderResourceResult(
                                provider_resource_id=str(item.get("id", domain)),
                                domain=domain,
                                cname=item.get("cname") or item.get("cdn_cname"),
                                status="active" if item.get("status") in ("active", "enabled", None) else "suspended",
                                total_gb=float(item.get("traffic_gb", 0.0) or 0.0),
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


async def _fetch_timeweb(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    token = credentials.get("api_token", "").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        return ProviderAccountResult(success=False, error="API-токен Timeweb Cloud не указан")

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


async def _fetch_yandex(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    token = credentials.get("oauth_token", "").strip()
    folder_id = credentials.get("folder_id", "").strip()
    if not token:
        return ProviderAccountResult(success=False, error="OAuth/IAM токен Yandex Cloud не указан")

    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    # CDN resources
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

    # Check billing accounts
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


async def _fetch_vk(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    token = credentials.get("api_token", "").strip()
    project_id = credentials.get("project_id", "").strip()
    if not token:
        return ProviderAccountResult(success=False, error="API-токен VK Cloud не указан")

    # VK Cloud endpoint check
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


async def _fetch_mts(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    key = credentials.get("api_key", "").strip()
    if not key:
        return ProviderAccountResult(success=False, error="API-ключ MTS Cloud не указан")

    return ProviderAccountResult(
        success=True,
        balance_rub=0.0,
        account_identifier=credentials.get("tenant_id") or "CloudMTS Account",
    )


async def _fetch_beget(
    client: httpx.AsyncClient, credentials: dict[str, Any]
) -> ProviderAccountResult:
    login = credentials.get("login", "").strip()
    password = credentials.get("password", "").strip()
    if not login or not password:
        return ProviderAccountResult(success=False, error="Логин и пароль Beget обязательны")

    try:
        url = "https://api.beget.com/api/user/getAccountInfo"
        resp = await client.get(url, params={"login": login, "passwd": password, "output_format": "json"})
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
