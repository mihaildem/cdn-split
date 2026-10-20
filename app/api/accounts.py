"""Accounts and CDN resources API endpoints."""

from __future__ import annotations

import asyncio
import time
from typing import Any
from fastapi import APIRouter, HTTPException, status

from app import crypto, db, notifier, providers
from app.api.dashboard import build_dashboard_response
from app.models import (
    AccountCreate,
    AccountUpdate,
    ResourceConsumerUpdate,
    ResourceCreate,
    ResourceUpdate,
)

router = APIRouter(tags=["accounts", "resources"])


# --- Accounts Endpoints ---

@router.get("/api/accounts")
async def list_accounts():
    accounts = db.get_accounts()
    return [crypto.mask_account(acc) for acc in accounts]


@router.post("/api/accounts", status_code=status.HTTP_201_CREATED)
async def create_account_endpoint(payload: AccountCreate):
    acc = db.create_account(payload.model_dump())
    return crypto.mask_account(acc)


@router.get("/api/accounts/{account_id}")
async def get_account_endpoint(account_id: str):
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return crypto.mask_account(acc)


@router.put("/api/accounts/{account_id}")
async def update_account_endpoint(account_id: str, payload: AccountUpdate):
    acc = db.update_account(account_id, payload.model_dump(exclude_unset=True))
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return crypto.mask_account(acc)


@router.delete("/api/accounts/{account_id}")
async def delete_account_endpoint(account_id: str):
    success = db.delete_account(account_id)
    if not success:
        raise HTTPException(status_code=404, detail="Account not found")
    return {"success": True, "id": account_id}


@router.post("/api/accounts/test")
async def test_account_credentials(payload: dict[str, Any]):
    provider_id = payload.get("provider")
    credentials = payload.get("credentials", {})
    if not provider_id:
        raise HTTPException(status_code=400, detail="provider is required")
    return await providers.test_provider_credentials(provider_id, credentials)


@router.post("/api/accounts/{account_id}/sync")
async def sync_single_account(account_id: str):
    acc = db.get_account(account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")

    creds = acc.get("credentials", {})
    res = await providers.test_provider_credentials(acc["provider"], creds)
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if res.success:
        updates = {
            "balance_rub": res.balance_rub,
            "bonus_balance_rub": res.bonus_balance_rub,
            "sync_status": "ok",
            "sync_error": None,
            "last_synced_at": now_str,
        }
        if res.account_identifier:
            updates["account_identifier"] = res.account_identifier
        updated_acc = db.update_account(account_id, updates)

        if res.resources:
            current_res = db.get_resources(account_id)
            existing_domains = {r["domain"]: r for r in current_res}
            for pr in res.resources:
                if pr.domain in existing_domains:
                    db.update_resource(
                        existing_domains[pr.domain]["id"],
                        {"total_gb": pr.total_gb, "cname": pr.cname or existing_domains[pr.domain].get("cname")},
                    )
                else:
                    db.create_resource({
                        "account_id": account_id,
                        "provider_resource_id": pr.provider_resource_id,
                        "domain": pr.domain,
                        "cname": pr.cname,
                        "status": pr.status,
                        "total_gb": pr.total_gb,
                        "consumer": "split",
                    })

        return {"success": True, "account": updated_acc, "discovered_resources": len(res.resources)}
    else:
        db.update_account(
            account_id,
            {"sync_status": "error", "sync_error": res.error, "last_synced_at": now_str},
        )
        return {"success": False, "error": res.error}


# --- CDN Resources Endpoints ---

@router.post("/api/resources", status_code=status.HTTP_201_CREATED)
async def create_resource_endpoint(payload: ResourceCreate):
    acc = db.get_account(payload.account_id)
    if not acc:
        raise HTTPException(status_code=400, detail="Specified account_id does not exist")
    res = db.create_resource(payload.model_dump())
    asyncio.create_task(notifier.ping_single_resource(res))
    return res


@router.put("/api/resources/{resource_id}")
async def update_resource_endpoint(resource_id: str, payload: ResourceUpdate):
    res = db.update_resource(resource_id, payload.model_dump(exclude_unset=True))
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    return res


@router.patch("/api/resources/{resource_id}/consumer")
async def update_resource_consumer_endpoint(
    resource_id: str, payload: ResourceConsumerUpdate
):
    res = db.update_resource_consumer(resource_id, payload.consumer)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")

    return {
        "success": True,
        "resource": res,
        "dashboard": build_dashboard_response(),
    }


@router.delete("/api/resources/{resource_id}")
async def delete_resource_endpoint(resource_id: str):
    success = db.delete_resource(resource_id)
    if not success:
        raise HTTPException(status_code=404, detail="Resource not found")
    return {"success": True, "id": resource_id}


@router.post("/api/resources/{resource_id}/ping")
async def ping_single_resource_endpoint(resource_id: str):
    res = db.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail="Resource not found")
    return await notifier.ping_single_resource(res)
