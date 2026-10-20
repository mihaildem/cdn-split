"""Unit and integration tests for CDN Splitwise & Resource Dashboard."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

# Configure temporary data directory for tests before importing app modules
test_dir = tempfile.mkdtemp()
os.environ["DATA_DIR"] = test_dir

from app import db, main, models
from app.billing import calculate_account_billing, calculate_splitwise_overview


@pytest.fixture(autouse=True)
def clean_db():
    """Reset database tables before each test."""
    db.init_db()
    with db.get_connection() as conn:
        conn.execute("DELETE FROM cdn_resources")
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM settlements")
        conn.execute("DELETE FROM telegram_bots")
        conn.execute("DELETE FROM notification_cooldowns")
        conn.commit()
    yield


# ================= Pure Billing Engine Tests =================

def test_free_tier_under_limit():
    """When total traffic is within free tier, billable traffic and cost are 0."""
    account = {
        "id": "acc_1",
        "provider": "selectel",
        "name": "Selectel Test",
        "payer": "misha",
        "free_tier_gb": 100.0,
        "price_per_gb": 1.50,
        "package_cost_rub": 0.0,
        "bonus_balance_rub": 0.0,
        "balance_rub": 1000.0,
        "ignore_bonus": False,
    }
    resources = [
        {"id": "res_1", "domain": "cdn1.test.ru", "total_gb": 30.0, "consumer": "misha"},
        {"id": "res_2", "domain": "cdn2.test.ru", "total_gb": 40.0, "consumer": "max"},
    ]

    summary = calculate_account_billing(account, resources)
    assert summary.total_traffic_gb == 70.0
    assert summary.free_tier_used_gb == 70.0
    assert summary.billable_traffic_gb == 0.0
    assert summary.real_cost_rub == 0.0
    assert summary.unsettled_cost_rub == 0.0

    assert summary.resources[0].current_cumulative_cost == 0.0
    assert summary.resources[1].current_cumulative_cost == 0.0


def test_free_tier_over_limit_proportional():
    """When traffic exceeds free tier, cost is proportionally distributed by traffic share."""
    account = {
        "id": "acc_1",
        "provider": "selectel",
        "name": "Selectel Test",
        "payer": "misha",
        "free_tier_gb": 100.0,
        "price_per_gb": 1.50,
        "package_cost_rub": 0.0,
        "bonus_balance_rub": 0.0,
        "balance_rub": 500.0,
        "ignore_bonus": False,
    }
    resources = [
        {"id": "res_1", "domain": "cdn1.test.ru", "total_gb": 50.0, "consumer": "misha"},
        {"id": "res_2", "domain": "cdn2.test.ru", "total_gb": 100.0, "consumer": "max"},
    ]

    # Total traffic = 150 GB. Free = 100 GB. Billable = 50 GB.
    # Total cost = 50 * 1.50 = 75.00 ₽.
    # res_1 share = 50 / 150 = 1/3 -> 25.00 ₽
    # res_2 share = 100 / 150 = 2/3 -> 50.00 ₽
    summary = calculate_account_billing(account, resources)
    assert summary.total_traffic_gb == 150.0
    assert summary.free_tier_used_gb == 100.0
    assert summary.billable_traffic_gb == 50.0
    assert summary.real_cost_rub == 75.00

    r1 = summary.resources[0]
    r2 = summary.resources[1]
    assert r1.current_cumulative_cost == 25.00
    assert r2.current_cumulative_cost == 50.00
    assert r1.free_allocated_gb == pytest.approx(33.33, abs=0.02)
    assert r2.free_allocated_gb == pytest.approx(66.67, abs=0.02)


def test_ignore_bonus_logic():
    """If ignore_bonus is True, bonus balance reduces or eliminates billable cash cost."""
    account = {
        "id": "acc_bonus",
        "provider": "selectel",
        "name": "Bonus Test",
        "payer": "misha",
        "free_tier_gb": 0.0,
        "price_per_gb": 2.00,
        "package_cost_rub": 0.0,
        "bonus_balance_rub": 200.0,
        "balance_rub": 500.0,
        "ignore_bonus": True,
    }
    resources = [
        {"id": "r1", "domain": "a.test.com", "total_gb": 50.0, "consumer": "max"},
    ]

    # 50 GB * 2.00 ₽ = 100.00 ₽ gross cost.
    # Bonus balance is 200 ₽ >= 100 ₽ -> Real cost is 0.0 ₽!
    summary = calculate_account_billing(account, resources)
    assert summary.gross_cost_rub == 100.0
    assert summary.bonus_spend_rub == 100.0
    assert summary.real_cost_rub == 0.0
    assert summary.resources[0].current_cumulative_cost == 0.0

    # Partial bonus coverage
    account["bonus_balance_rub"] = 40.0
    summary_partial = calculate_account_billing(account, resources)
    assert summary_partial.gross_cost_rub == 100.0
    assert summary_partial.bonus_spend_rub == 40.0
    assert summary_partial.real_cost_rub == 60.0
    assert summary_partial.resources[0].current_cumulative_cost == 60.0


def test_splitwise_mutual_offset():
    """Verify Splitwise debt calculations between Misha and Max."""
    # Account 1: Payer Misha
    # - res_1: Consumer Max, Cost 100 ₽ -> Max owes Misha 100 ₽
    # - res_2: Consumer Split (50/50), Cost 60 ₽ -> Max owes Misha 30 ₽
    # Subtotal Max owes Misha = 130 ₽
    acc1 = {
        "id": "acc1",
        "provider": "selectel",
        "name": "Acc1",
        "payer": "misha",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.0,
        "package_cost_rub": 0.0,
        "bonus_balance_rub": 0.0,
        "balance_rub": 500.0,
        "ignore_bonus": False,
    }
    res_acc1 = [
        {"id": "r1", "domain": "max.com", "total_gb": 100.0, "consumer": "max"},
        {"id": "r2", "domain": "split.com", "total_gb": 60.0, "consumer": "split"},
    ]
    summary1 = calculate_account_billing(acc1, res_acc1)

    # Account 2: Payer Max
    # - res_3: Consumer Misha, Cost 50 ₽ -> Misha owes Max 50 ₽
    # Subtotal Misha owes Max = 50 ₽
    acc2 = {
        "id": "acc2",
        "provider": "vk",
        "name": "Acc2",
        "payer": "max",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.0,
        "package_cost_rub": 0.0,
        "bonus_balance_rub": 0.0,
        "balance_rub": 500.0,
        "ignore_bonus": False,
    }
    res_acc2 = [
        {"id": "r3", "domain": "misha.com", "total_gb": 50.0, "consumer": "misha"},
    ]
    summary2 = calculate_account_billing(acc2, res_acc2)

    overview = calculate_splitwise_overview([summary1, summary2])
    assert overview.max_owes_misha == 130.00
    assert overview.misha_owes_max == 50.00
    assert overview.net_balance == 80.00
    assert overview.direction == "max_owes_misha"
    assert "Макс должен Мише 80 ₽" in overview.summary_text

    # Verify Splitwise Invariant: Net == Misha Paid - Misha Consumed
    # Misha paid = 100 + 60 = 160 ₽
    # Misha consumed = 30 (split) + 50 (res_3) = 80 ₽
    # 160 - 80 = 80 ₽!
    assert overview.misha_paid_total == 160.00
    assert overview.misha_consumed_total == 80.00
    assert round(overview.misha_paid_total - overview.misha_consumed_total, 2) == overview.net_balance


# ================= Watermark Settle & Undo Tests =================

def test_watermark_settle_and_undo():
    """Verify 'Оплатил' (Settle) and 'Отменить' (Undo) lifecycle."""
    acc = db.create_account({
        "id": "acc_settle",
        "provider": "selectel",
        "name": "Settle Test",
        "payer": "misha",
        "free_tier_gb": 0.0,
        "price_per_gb": 2.0,
    })
    res = db.create_resource({
        "id": "res_settle",
        "account_id": acc["id"],
        "domain": "test.settle.com",
        "consumer": "max",
        "total_gb": 50.0,  # 50 * 2 = 100 ₽
    })

    client = TestClient(main.app)

    # 1. Before settle: Max owes Misha 100 ₽
    d1 = client.get("/api/dashboard").json()
    assert d1["splitwise"]["net_balance"] == 100.0
    assert d1["accounts"][0]["resources"][0]["unsettled_cost"] == 100.0

    # 2. Settle Up ("Оплатил")
    settle_resp = client.post("/api/settle", json={"note": "Test payment"}).json()
    assert settle_resp["success"] is True
    assert settle_resp["settlement"]["net_balance"] == 100.0

    # 3. After settle: watermarks advanced, net balance is 0.0 ₽
    d2 = client.get("/api/dashboard").json()
    assert d2["splitwise"]["net_balance"] == 0.0
    assert d2["splitwise"]["direction"] == "settled"
    assert d2["accounts"][0]["resources"][0]["unsettled_cost"] == 0.0
    assert d2["accounts"][0]["resources"][0]["paid_watermark_gb"] == 50.0
    assert d2["accounts"][0]["resources"][0]["paid_watermark_cost"] == 100.0

    # 4. Undo Settlement ("Отменить")
    undo_resp = client.post("/api/settlements/undo").json()
    assert undo_resp["success"] is True

    # 5. After undo: watermarks restored, net balance is 100.0 ₽ again
    d3 = client.get("/api/dashboard").json()
    assert d3["splitwise"]["net_balance"] == 100.0
    assert d3["splitwise"]["direction"] == "max_owes_misha"
    assert d3["accounts"][0]["resources"][0]["unsettled_cost"] == 100.0


# ================= FastAPI Endpoints Tests =================

def test_api_providers_metadata():
    """Verify /api/providers returns all 6 providers with fields and help."""
    client = TestClient(main.app)
    resp = client.get("/api/providers")
    assert resp.status_code == 200
    providers_list = resp.json()
    ids = [p["id"] for p in providers_list]
    for required_id in ["yandex", "selectel", "vk", "mts", "timeweb", "beget"]:
        assert required_id in ids

    # Check Selectel has help instructions
    selectel = next(p for p in providers_list if p["id"] == "selectel")
    assert "my.selectel.ru" in selectel["help"]["portal_url"]
    assert len(selectel["help"]["steps"]) > 0


def test_api_account_crud_and_instant_consumer_toggle():
    """Verify creating account, resource, and 1-tap consumer toggle."""
    client = TestClient(main.app)

    # 1. Create Account
    acc_payload = {
        "provider": "timeweb",
        "name": "Timeweb Prod",
        "payer": "max",
        "free_tier_gb": 0.0,
        "price_per_gb": 1.60,
    }
    acc_resp = client.post("/api/accounts", json=acc_payload)
    assert acc_resp.status_code == 201
    acc_id = acc_resp.json()["id"]

    # 2. Create Resource
    res_payload = {
        "account_id": acc_id,
        "domain": "app.timeweb.com",
        "consumer": "split",
        "total_gb": 100.0,  # 100 * 1.60 = 160 ₽. Split -> Misha owes Max 80 ₽
    }
    res_resp = client.post("/api/resources", json=res_payload)
    assert res_resp.status_code == 201
    res_id = res_resp.json()["id"]

    # Verify initial dashboard
    dash = client.get("/api/dashboard").json()
    assert dash["splitwise"]["misha_owes_max"] == 80.0
    assert dash["splitwise"]["direction"] == "misha_owes_max"

    # 3. Instant 1-tap toggle: change consumer to "misha" (100%)
    patch_resp = client.patch(
        f"/api/resources/{res_id}/consumer",
        json={"consumer": "misha"},
    )
    assert patch_resp.status_code == 200
    patch_data = patch_resp.json()
    assert patch_data["resource"]["consumer"] == "misha"
    # Misha now owes Max full 160 ₽
    assert patch_data["dashboard"]["splitwise"]["misha_owes_max"] == 160.0

    # 4. Instant 1-tap toggle: change consumer to "max" (0% owed by Misha)
    patch_resp2 = client.patch(
        f"/api/resources/{res_id}/consumer",
        json={"consumer": "max"},
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["dashboard"]["splitwise"]["misha_owes_max"] == 0.0
    assert patch_resp2.json()["dashboard"]["splitwise"]["direction"] == "settled"


def test_telegram_bot_crud():
    """Verify Telegram multi-bot API endpoints."""
    client = TestClient(main.app)

    bot_payload = {
        "name": "DevOps Alerts",
        "bot_token": "123456789:ABCdefGhIJKlmNoPQRstuVWxyz",
        "chat_id": "-100987654321",
        "filter_owner": "misha",
        "notify_cdn_down": True,
        "notify_low_balance": True,
    }
    resp = client.post("/api/telegram", json=bot_payload)
    assert resp.status_code == 201
    bot_id = resp.json()["id"]

    # List bots
    list_resp = client.get("/api/telegram").json()
    assert len(list_resp) == 1
    assert list_resp[0]["id"] == bot_id
    assert "..." in list_resp[0]["bot_token_masked"]

    # Delete bot
    del_resp = client.delete(f"/api/telegram/{bot_id}")
    assert del_resp.status_code == 200
    assert len(client.get("/api/telegram").json()) == 0


def test_demo_reset_endpoint():
    """Verify demo reset seeds realistic data."""
    client = TestClient(main.app)
    resp = client.post("/api/demo/reset")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert len(data["dashboard"]["accounts"]) >= 4
    assert data["dashboard"]["splitwise"]["total_resources_count"] >= 5
