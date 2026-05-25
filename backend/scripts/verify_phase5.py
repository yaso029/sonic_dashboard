"""Phase 5 billing verification.

Exercises invoices, VAT math, payments, status transitions, recurring generation,
reports/aging and RBAC through the FastAPI app (TestClient + crm_local.db). Stripe
is expected to be UNCONFIGURED here, so the Stripe endpoints must return 503.
Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase5
"""
from datetime import date, timedelta

from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal, engine, Base, run_light_migrations
from backend.database.models import User
from backend.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)
run_light_migrations()
client = TestClient(app)

ADMIN_NAME, ADMIN_PASS = "Yaso", "Yaso@123"
DEMO_PASS = "Demo@123"
DEMO = [("Demo Marketing Specialist", "marketing_specialist"), ("Demo Marketing Analyst", "analyst")]

passed, failed = [], []


def check(name, cond):
    (passed if cond else failed).append(name)
    print(("  PASS " if cond else "  FAIL ") + name)


def login(n, p):
    r = client.post("/api/auth/login", json={"username": n, "password": p})
    return r.json()["access_token"] if r.status_code == 200 else None


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def seed():
    db = SessionLocal()
    try:
        for n, role in DEMO:
            u = db.query(User).filter(User.full_name == n).first()
            if u:
                u.role, u.is_active, u.password_hash = role, True, hash_password(DEMO_PASS)
            else:
                db.add(User(full_name=n, email=f"{role}@demo.crm", password_hash=hash_password(DEMO_PASS),
                            role=role, is_active=True))
        db.commit()
    finally:
        db.close()


def main():
    print("\n=== Phase 5 billing verification ===\n")
    admin = login(ADMIN_NAME, ADMIN_PASS)
    if not admin:
        print("!! admin login failed"); return
    seed()
    acct = login("Demo Marketing Specialist", DEMO_PASS)
    analyst = login("Demo Marketing Analyst", DEMO_PASS)
    acct_id = SessionLocal().query(User).filter(User.full_name == "Demo Marketing Specialist").first().id

    r = client.post("/api/clients", headers=auth(admin),
                    json={"company_name": "Billing Test Co", "trn": "100555555500003", "assigned_accountant_id": acct_id})
    client_id = r.json()["id"]
    check("created test client", r.status_code in (200, 201))

    # --- invoice creation + VAT math -----------------------------------------
    print("\n-- invoice + VAT --")
    r = client.post("/api/invoices", headers=auth(acct), json={
        "client_id": client_id, "vat_rate": 5,
        "line_items": [
            {"description": "Social Media Management", "quantity": 1, "unit_price": 1000},
            {"description": "VAT filing", "quantity": 2, "unit_price": 500},
        ],
    })
    inv = r.json()
    check("marketing_specialist creates invoice", r.status_code in (200, 201))
    check("subtotal = 2000", inv.get("subtotal") == 2000.0)
    check("vat 5% = 100", inv.get("vat_amount") == 100.0)
    check("total = 2100", inv.get("total") == 2100.0)
    check("starts as draft", inv.get("status") == "draft")
    check("invoice number format", str(inv.get("invoice_number", "")).startswith("INV-"))
    inv_id = inv["id"]

    # sequential numbering
    r2 = client.post("/api/invoices", headers=auth(acct), json={
        "client_id": client_id, "line_items": [{"description": "x", "quantity": 1, "unit_price": 10}]})
    check("second invoice has distinct number", r2.json()["invoice_number"] != inv["invoice_number"])

    # --- RBAC -----------------------------------------------------------------
    print("\n-- RBAC --")
    r = client.post("/api/invoices", headers=auth(analyst), json={
        "client_id": client_id, "line_items": [{"description": "x", "quantity": 1, "unit_price": 10}]})
    check("analyst blocked from creating invoice (403)", r.status_code == 403)
    r = client.get("/api/invoices", headers=auth(analyst))
    check("analyst can read invoices (200)", r.status_code == 200)
    r = client.delete(f"/api/invoices/{inv_id}", headers=auth(acct))
    check("marketing_specialist blocked from deleting invoice (403)", r.status_code == 403)

    # --- payment before send blocked -----------------------------------------
    print("\n-- status flow + payments --")
    r = client.post(f"/api/invoices/{inv_id}/payments", headers=auth(acct), json={"amount": 100})
    check("payment on draft blocked (409)", r.status_code == 409)

    r = client.post(f"/api/invoices/{inv_id}/send", headers=auth(acct))
    check("send -> sent", r.json().get("status") == "sent")

    # partial payment
    r = client.post(f"/api/invoices/{inv_id}/payments", headers=auth(acct),
                    json={"amount": 600, "method": "bank_transfer"})
    check("partial payment -> partially_paid", r.json().get("status") == "partially_paid")
    check("balance after partial = 1500", r.json().get("balance") == 1500.0)

    # overpayment rejected
    r = client.post(f"/api/invoices/{inv_id}/payments", headers=auth(acct), json={"amount": 9999})
    check("overpayment rejected (400)", r.status_code == 400)

    # settle remaining
    r = client.post(f"/api/invoices/{inv_id}/payments", headers=auth(acct), json={"amount": 1500})
    check("full payment -> paid", r.json().get("status") == "paid")
    check("balance now 0", r.json().get("balance") == 0.0)

    # void after paid blocked
    r = client.post(f"/api/invoices/{inv_id}/void", headers=auth(acct))
    check("void after payment blocked (409)", r.status_code == 409)

    # --- Stripe unconfigured --------------------------------------------------
    print("\n-- Stripe (unconfigured) --")
    r = client.get("/api/billing/config", headers=auth(acct))
    check("billing config reports stripe disabled", r.json().get("stripe_enabled") is False)
    r = client.post(f"/api/invoices/{r2.json()['id']}/payment-intent", headers=auth(acct))
    check("payment-intent without Stripe -> 503", r.status_code == 503)

    # --- recurring subscriptions ---------------------------------------------
    print("\n-- recurring --")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    r = client.post("/api/subscriptions", headers=auth(acct), json={
        "client_id": client_id, "description": "Monthly retainer", "amount": 1500,
        "interval": "monthly", "next_invoice_date": yesterday})
    check("create subscription", r.status_code in (200, 201))
    sub = r.json()
    r = client.post("/api/subscriptions/generate-due", headers=auth(acct))
    check("generate-due creates >=1 invoice", r.json().get("generated", 0) >= 1)
    # schedule advanced into the future
    r = client.get("/api/subscriptions", headers=auth(acct))
    this_sub = next((s for s in r.json() if s["id"] == sub["id"]), None)
    check("next_invoice_date advanced past today", this_sub and this_sub["next_invoice_date"] > date.today().isoformat())

    # --- reports / aging ------------------------------------------------------
    print("\n-- reports --")
    r = client.get("/api/billing/reports", headers=auth(acct))
    rep = r.json()
    check("reports return totals", r.status_code == 200 and "aging" in rep and "total_collected" in rep)
    check("collected reflects the 2100 paid invoice", rep["total_collected"] >= 2100.0)

    # cleanup
    client.delete(f"/api/clients/{client_id}", headers=auth(admin))

    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
