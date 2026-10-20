"""Telegram multi-bot API endpoints."""

from __future__ import annotations

import time
from fastapi import APIRouter, HTTPException, status

from app import crypto, db, notifier
from app.models import TelegramBotCreate, TelegramBotUpdate

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.get("")
async def list_telegram_bots():
    bots = db.get_telegram_bots()
    safe_bots = []
    for b in bots:
        tok = b.get("bot_token", "")
        masked_tok = crypto.mask_secret_value(tok)
        b_copy = dict(b)
        b_copy["bot_token"] = masked_tok
        b_copy["bot_token_masked"] = masked_tok
        safe_bots.append(b_copy)
    return safe_bots


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_telegram_bot_endpoint(payload: TelegramBotCreate):
    bot = db.create_telegram_bot(payload.model_dump())
    bot_copy = dict(bot)
    bot_copy["bot_token"] = crypto.mask_secret_value(bot.get("bot_token", ""))
    bot_copy["bot_token_masked"] = bot_copy["bot_token"]
    return bot_copy


@router.put("/{bot_id}")
async def update_telegram_bot_endpoint(bot_id: str, payload: TelegramBotUpdate):
    bot = db.update_telegram_bot(bot_id, payload.model_dump(exclude_unset=True))
    if not bot:
        raise HTTPException(status_code=404, detail="Telegram bot not found")
    bot_copy = dict(bot)
    bot_copy["bot_token"] = crypto.mask_secret_value(bot.get("bot_token", ""))
    bot_copy["bot_token_masked"] = bot_copy["bot_token"]
    return bot_copy


@router.delete("/{bot_id}")
async def delete_telegram_bot_endpoint(bot_id: str):
    success = db.delete_telegram_bot(bot_id)
    if not success:
        raise HTTPException(status_code=404, detail="Telegram bot not found")
    return {"success": True, "id": bot_id}


@router.post("/{bot_id}/test")
async def test_telegram_bot_endpoint(bot_id: str):
    bot = db.get_telegram_bot(bot_id)
    if not bot:
        raise HTTPException(status_code=404, detail="Telegram bot not found")

    test_msg = (
        f"🤖 <b>Тестовое уведомление CDN Splitwise</b>\n\n"
        f"Успешное подключение бота: <b>{bot['name']}</b>\n"
        f"Фильтр владельца: <code>{bot['filter_owner'].upper()}</code>\n"
        f"🕒 <i>{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}</i>\n\n"
        f"Все уведомления по CDN и биллингу настроены корректно!"
    )
    ok, error = await notifier.send_telegram_raw(
        bot["bot_token"], bot["chat_id"], test_msg
    )
    if not ok:
        return {"success": False, "error": error}
    return {"success": True, "message": "Тестовое сообщение успешно отправлено в Telegram"}
