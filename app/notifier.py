"""HTTP healthcheck pinger and Telegram multi-bot notifications."""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any
import httpx
from app import db

TELEGRAM_PROXY = os.environ.get("TELEGRAM_PROXY", "").strip() or None


async def ping_single_resource(resource: dict[str, Any]) -> dict[str, Any]:
    """Ping a single CDN resource and update health state in database."""
    domain = resource["domain"]
    check_path = resource.get("check_path", "/") or "/"
    if not check_path.startswith("/"):
        check_path = "/" + check_path

    url = f"https://{domain}{check_path}"
    expected_str = resource.get("expected_codes", "200,204,301,302,400,404")
    expected_codes = set()
    for code in expected_str.split(","):
        try:
            expected_codes.add(int(code.strip()))
        except ValueError:
            pass
    if not expected_codes:
        expected_codes = {200, 204, 301, 302, 400, 404}

    start_t = time.perf_counter()
    http_status = "down"
    http_code: int | None = None
    http_latency_ms: float | None = None
    check_error: str | None = None

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=False, verify=False) as client:
            resp = await client.get(url)
            latency = (time.perf_counter() - start_t) * 1000.0
            http_latency_ms = round(latency, 1)
            http_code = resp.status_code
            if http_code in expected_codes:
                http_status = "up"
            else:
                http_status = "down"
                check_error = f"HTTP {http_code} не входит в ожидаемые ({expected_str})"
    except httpx.ConnectTimeout:
        http_latency_ms = round((time.perf_counter() - start_t) * 1000.0, 1)
        check_error = "Connection Timeout (>4s)"
    except httpx.ConnectError as e:
        http_latency_ms = round((time.perf_counter() - start_t) * 1000.0, 1)
        check_error = f"Connect Error: {str(e)[:100]}"
    except Exception as e:
        http_latency_ms = round((time.perf_counter() - start_t) * 1000.0, 1)
        check_error = f"Request Error: {str(e)[:100]}"

    # Update in DB
    db.update_resource_health(
        resource["id"],
        http_status=http_status,
        http_code=http_code,
        http_latency_ms=http_latency_ms,
        check_error=check_error,
    )

    # Check alert condition if down
    prev_status = resource.get("http_status")
    if http_status == "down" and prev_status != "down":
        alert_key = f"cdn_down:{resource['id']}"
        if db.check_and_update_cooldown(alert_key, cooldown_seconds=3600):
            asyncio.create_task(
                notify_cdn_down(resource, error_msg=check_error or "HTTP Down")
            )

    return {
        "id": resource["id"],
        "domain": domain,
        "http_status": http_status,
        "http_code": http_code,
        "http_latency_ms": http_latency_ms,
        "check_error": check_error,
    }


async def ping_all_resources() -> list[dict[str, Any]]:
    """Ping all CDN resources concurrently."""
    resources = db.get_resources()
    tasks = [ping_single_resource(r) for r in resources]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    clean_results = []
    for res in results:
        if isinstance(res, dict):
            clean_results.append(res)
    return clean_results


# --- Telegram Notification Engine ---

async def send_telegram_raw(
    bot_token: str, chat_id: str, html_message: str
) -> tuple[bool, str | None]:
    """Direct POST to Telegram Bot API (with optional TELEGRAM_PROXY)."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": html_message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    client_kwargs: dict[str, Any] = {"timeout": 8.0}
    if TELEGRAM_PROXY:
        client_kwargs["proxy"] = TELEGRAM_PROXY

    try:
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                return True, None
            else:
                return False, f"Telegram API {resp.status_code}: {resp.text[:150]}"
    except Exception as e:
        return False, f"Ошибка сети Telegram: {str(e)}"


async def broadcast_notification(
    event_type: str,  # 'cdn_down', 'low_balance', 'api_error', 'settlement'
    affected_owner: str,  # 'all', 'misha', 'max', 'split'
    html_message: str,
) -> None:
    """Dispatches a notification to matching registered bots according to triggers and owner filters."""
    bots = db.get_telegram_bots()
    tasks = []

    for bot in bots:
        # Check event trigger
        if event_type == "cdn_down" and not bot.get("notify_cdn_down"):
            continue
        if event_type == "low_balance" and not bot.get("notify_low_balance"):
            continue
        if event_type == "api_error" and not bot.get("notify_api_error"):
            continue
        if event_type == "settlement" and not bot.get("notify_settlement"):
            continue

        # Check owner filter
        bot_filter = bot.get("filter_owner", "all")
        if bot_filter != "all":
            if affected_owner != "all" and affected_owner != "split":
                if bot_filter != affected_owner:
                    continue

        tasks.append(send_telegram_raw(bot["bot_token"], bot["chat_id"], html_message))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def notify_cdn_down(resource: dict[str, Any], error_msg: str) -> None:
    domain = resource["domain"]
    cname = resource.get("cname") or "-"
    consumer = resource.get("consumer", "split")
    msg = (
        f"🚨 <b>CDN ресурс недоступен!</b>\n\n"
        f"🌐 <b>Домен:</b> <code>{domain}</code>\n"
        f"🔗 <b>CNAME:</b> <code>{cname}</code>\n"
        f"👤 <b>Потребитель:</b> {consumer.upper()}\n"
        f"⚠️ <b>Ошибка:</b> {error_msg}\n"
        f"🕒 <i>{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}</i>"
    )
    await broadcast_notification("cdn_down", affected_owner=consumer, html_message=msg)


async def notify_low_balance(account: dict[str, Any]) -> None:
    name = account["name"]
    provider = account["provider"].upper()
    balance = account["balance_rub"]
    payer = account["payer"]
    threshold = account.get("low_balance_threshold", 200.0)

    msg = (
        f"⚠️ <b>Низкий баланс CDN аккаунта!</b>\n\n"
        f"🏢 <b>Аккаунт:</b> {name} ({provider})\n"
        f"💰 <b>Текущий баланс:</b> <code>{balance:,.2f} ₽</code>\n"
        f"🎯 <b>Порог:</b> {threshold:,.2f} ₽\n"
        f"💳 <b>Оплачивает:</b> {payer.capitalize()}\n\n"
        f"<i>Пополните счет во избежание отключения CDN трафика.</i>"
    )
    await broadcast_notification("low_balance", affected_owner=payer, html_message=msg)


async def notify_api_error(account: dict[str, Any], error_msg: str) -> None:
    name = account["name"]
    payer = account["payer"]
    msg = (
        f"❌ <b>Ошибка синхронизации CDN аккаунта</b>\n\n"
        f"🏢 <b>Аккаунт:</b> {name}\n"
        f"⚠️ <b>Ошибка:</b> {error_msg}\n"
        f"👤 <b>Владелец:</b> {payer.capitalize()}\n"
        f"<i>Проверьте API-токен или права доступа в панели провайдера.</i>"
    )
    await broadcast_notification("api_error", affected_owner=payer, html_message=msg)


async def notify_settlement_event(settlement_info: dict[str, Any]) -> None:
    net = settlement_info["net_balance"]
    if net > 0:
        debt_text = f"Макс передал Мише <b>{net:,.2f} ₽</b>"
    elif net < 0:
        debt_text = f"Миша передал Максу <b>{abs(net):,.2f} ₽</b>"
    else:
        debt_text = "Взаиморасчет закрыт по нулям (0.00 ₽)"

    misha_owes = settlement_info["misha_owes_max"]
    max_owes = settlement_info["max_owes_misha"]

    msg = (
        f"✅ <b>Взаимозачет CDN закрыт! («Оплатил»)</b>\n\n"
        f"📊 {debt_text}\n\n"
        f"• Макс → Мише: {max_owes:,.2f} ₽\n"
        f"• Миша → Максу: {misha_owes:,.2f} ₽\n"
        f"🕒 <i>{settlement_info['settled_at']}</i>\n\n"
        f"<i>Счетчики предыдущего периода зафиксированы.</i>"
    )
    await broadcast_notification("settlement", affected_owner="all", html_message=msg)
