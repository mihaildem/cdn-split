"""Tests for Section 14 REST API endpoints."""

import pytest
from fastapi.testclient import TestClient

from app import db, main


@pytest.fixture(autouse=True)
def clean_db():
    db.init_db()
    with db.get_connection() as conn:
        conn.execute("DELETE FROM cdn_resources")
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM settlements")
        conn.execute("DELETE FROM telegram_bots")
        conn.execute("DELETE FROM notification_cooldowns")
        conn.execute("DELETE FROM participants")
        conn.execute("DELETE FROM transfers")
        conn.execute("DELETE FROM account_payer_history")
        conn.execute("DELETE FROM resource_consumer_history")
        conn.execute("DELETE FROM traffic_daily")
        conn.execute("DELETE FROM audit_log")
        conn.commit()
    db.seed_default_participants()
    yield


def test_api_overview_endpoint():
    client = TestClient(main.app)
    acc = db.create_account({"provider": "selectel", "name": "Overview Acc", "payer": "misha"})
    db.create_resource({"account_id": acc["id"], "domain": "cdn.test.ru", "consumer": "split"})

    resp = client.get("/api/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert "debt" in data
    assert "attention" in data
    assert "accounts" in data
    assert len(data["accounts"]) == 1
    assert "traffic_14d" in data["accounts"][0]["resources"][0]
    assert len(data["accounts"][0]["resources"][0]["traffic_14d"]) == 14


def test_api_accounts_validate():
    client = TestClient(main.app)
    # Valid call mock with timeweb
    resp = client.post("/api/accounts/validate", json={"provider": "timeweb", "credentials": {"api_token": "valid_token"}})
    assert resp.status_code == 200
    data = resp.json()
    assert "key_accepted" in data
    assert "resources_read" in data
    assert "balance_access" in data


def test_api_payer_and_consumer_update_and_breakdown():
    client = TestClient(main.app)
    acc = db.create_account({"provider": "selectel", "name": "Test Acc", "payer": "misha", "price_per_gb": 2.0, "free_tier_gb": 10.0})
    res = db.create_resource({"account_id": acc["id"], "domain": "cdn.example.org", "consumer": "unassigned", "total_gb": 30.0})

    # 1. Update payer
    put_payer = client.put(f"/api/accounts/{acc['id']}/payer", json={"memberId": "max"})
    assert put_payer.status_code == 200
    assert put_payer.json()["payer"] == "max"

    # 2. Update consumer (retroactive from unassigned)
    put_cons = client.put(f"/api/resources/{res['id']}/consumer", json={"consumer": "misha"})
    assert put_cons.status_code == 200
    assert put_cons.json()["resource"]["consumer"] == "misha"

    # 3. Cost breakdown
    breakdown = client.get(f"/api/resources/{res['id']}/cost-breakdown")
    assert breakdown.status_code == 200
    b_data = breakdown.json()
    assert b_data["domain"] == "cdn.example.org"
    assert "formula" in b_data
    assert b_data["cost_kop"] > 0


def test_api_manual_usage():
    client = TestClient(main.app)
    acc = db.create_account({"provider": "selectel", "name": "Manual Acc", "payer": "misha"})
    res = db.create_resource({"account_id": acc["id"], "domain": "manual.cdn.ru", "consumer": "split"})

    resp = client.post(
        f"/api/accounts/{acc['id']}/manual-usage",
        json={"balance_rub": 450.0, "resources": [{"resource_id": res["id"], "gb": 15.0}]},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    updated_res = db.get_resource(res["id"])
    assert updated_res["is_manual"] == 1
    assert updated_res["total_gb"] == 15.0


def test_transfers_workflow_and_csv_export():
    client = TestClient(main.app)

    # 1. Create pending transfer
    tr_resp = client.post("/api/transfers", json={"from_member": "max", "to_member": "misha", "amount_kop": 31700})
    assert tr_resp.status_code == 201
    t_id = tr_resp.json()["id"]
    assert tr_resp.json()["status"] == "pending"

    # 2. Confirm transfer
    conf_resp = client.post(f"/api/transfers/{t_id}/confirm")
    assert conf_resp.status_code == 200
    assert conf_resp.json()["status"] == "confirmed"

    # 3. History
    hist = client.get("/api/history").json()
    assert len(hist["transfers"]) == 1
    assert len(hist["audit_log"]) >= 2

    # 4. CSV export
    csv_resp = client.get("/api/history.csv")
    assert csv_resp.status_code == 200
    assert "max;misha;317.00;confirmed" in csv_resp.text

    # 5. Cancel latest confirmed transfer (soft undo)
    cancel_resp = client.post(f"/api/transfers/{t_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"
