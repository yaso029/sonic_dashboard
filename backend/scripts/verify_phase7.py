"""Phase 7 AI + compliance verification.

The deterministic tax checklist must work fully offline. AI document analysis must
degrade gracefully (503) when ANTHROPIC_API_KEY is unset — which is the expected
local state. Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase7
"""
from datetime import date

from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal, engine, Base, run_light_migrations
from backend.database.models import User
from backend.services.auth_service import hash_password
from backend.services import ai_service, tax_rules

Base.metadata.create_all(bind=engine)
run_light_migrations()
client = TestClient(app)

ADMIN_NAME, ADMIN_PASS = "Yaso", "Yaso@123"
DEMO_PASS = "Demo@123"

passed, failed = [], []


def check(name, cond):
    (passed if cond else failed).append(name)
    print(("  PASS " if cond else "  FAIL ") + name)


def login(n, p):
    r = client.post("/api/auth/login", json={"username": n, "password": p})
    return r.json()["access_token"] if r.status_code == 200 else None


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def seed_auditor():
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.full_name == "Demo Marketing Analyst").first()
        if u:
            u.role, u.is_active, u.password_hash = "analyst", True, hash_password(DEMO_PASS)
        else:
            db.add(User(full_name="Demo Marketing Analyst", email="analyst@demo.crm",
                        password_hash=hash_password(DEMO_PASS), role="analyst", is_active=True))
        db.commit()
    finally:
        db.close()


def main():
    print("\n=== Phase 7 AI + compliance verification ===\n")
    admin = login(ADMIN_NAME, ADMIN_PASS)
    if not admin:
        print("!! admin login failed"); return
    seed_auditor()
    analyst = login("Demo Marketing Analyst", DEMO_PASS)

    # client with TRN but no CT registration, ESR applicable
    cid = client.post("/api/clients", headers=auth(admin), json={
        "company_name": "AI Test Co", "trn": "100222222200003",
        "esr_applicable": True, "trade_license_number": "CN-9001", "trade_license_emirate": "Dubai",
    }).json()["id"]

    # --- ai config ------------------------------------------------------------
    print("-- ai config --")
    r = client.get("/api/ai/config", headers=auth(admin))
    check("ai config endpoint 200", r.status_code == 200)
    check("ai reports disabled (no key)", r.json().get("ai_enabled") is False)

    # --- deterministic tax checklist ------------------------------------------
    print("\n-- tax checklist (deterministic) --")
    r = client.get(f"/api/clients/{cid}/tax-checklist", headers=auth(admin))
    check("checklist endpoint 200", r.status_code == 200)
    data = r.json()
    keys = {i["key"] for i in data["items"]}
    check("VAT registered item present (TRN on file)",
          any(i["key"] == "vat_registration" and i["status"] == "ok" for i in data["items"]))
    check("VAT return deadline computed", any(i["key"] == "vat_return" and i["due_date"] for i in data["items"]))
    check("CT registration flagged action_needed (no CT number)",
          any(i["key"] == "ct_registration" and i["status"] == "action_needed" for i in data["items"]))
    check("CT return deadline computed", any(i["key"] == "ct_return" and i["due_date"] for i in data["items"]))
    check("ESR items present (esr_applicable)", "esr_notification" in keys and "esr_report" in keys)
    check("trade licence reminder present", "trade_license" in keys)
    check("disclaimer included", bool(data.get("disclaimer")))

    # CT deadline correctness: FY end Dec 31 + 9 months, next >= today
    ct = next(i for i in data["items"] if i["key"] == "ct_return")
    check("CT deadline is a future-ish date >= today", ct["due_date"] >= date.today().isoformat())

    # analyst (read-only) can view checklist
    r = client.get(f"/api/clients/{cid}/tax-checklist", headers=auth(analyst))
    check("analyst can read checklist", r.status_code == 200)

    # --- AI document analysis graceful degradation ----------------------------
    print("\n-- AI analyze (unconfigured) --")
    r = client.post("/api/documents", headers=auth(admin),
                    files={"file": ("license.pdf", b"%PDF-1.4 test license", "application/pdf")},
                    data={"client_id": cid, "category": "trade_license"})
    doc_id = r.json()["id"]
    r = client.post(f"/api/documents/{doc_id}/analyze", headers=auth(admin))
    check("analyze without AI key -> 503", r.status_code == 503)

    # checklist for a client with no TRN/CT recommends registration
    cid2 = client.post("/api/clients", headers=auth(admin), json={"company_name": "Bare Co"}).json()["id"]
    r = client.get(f"/api/clients/{cid2}/tax-checklist", headers=auth(admin))
    check("no-TRN client gets VAT registration recommendation",
          any(i["key"] == "vat_registration" and i["status"] == "action_needed" for i in r.json()["items"]))

    # unit: ai_service helpers
    print("\n-- ai_service unit --")
    check("ai_service not configured locally", ai_service.is_configured() is False)
    check("can_analyze pdf true / docx false",
          ai_service.can_analyze("application/pdf") and not ai_service.can_analyze("application/zip"))

    # cleanup
    client.delete(f"/api/clients/{cid}", headers=auth(admin))
    client.delete(f"/api/clients/{cid2}", headers=auth(admin))

    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
