"""Phase 6 client-portal verification.

Focuses on the security boundary: portal tokens must not reach staff endpoints
(and vice-versa), and a portal user must only ever see their own client's data.
Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase6
"""
from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal, engine, Base, run_light_migrations
from backend.database.models import User, Task, ClientUser
from backend.services.auth_service import hash_password

TEST_PORTAL_EMAIL = "owner@portalcoa.test"


def _clear_test_portal_user():
    """Idempotency: remove any leftover test portal account from a prior run."""
    db = SessionLocal()
    try:
        for cu in db.query(ClientUser).filter(ClientUser.email == TEST_PORTAL_EMAIL).all():
            db.delete(cu)
        db.commit()
    finally:
        db.close()

Base.metadata.create_all(bind=engine)
run_light_migrations()
client = TestClient(app)

ADMIN_NAME, ADMIN_PASS = "Yaso", "Yaso@123"

passed, failed = [], []


def check(name, cond):
    (passed if cond else failed).append(name)
    print(("  PASS " if cond else "  FAIL ") + name)


def login(n, p):
    r = client.post("/api/auth/login", json={"username": n, "password": p})
    return r.json()["access_token"] if r.status_code == 200 else None


def portal_login(email, pw):
    r = client.post("/api/portal/auth/login", json={"email": email, "password": pw})
    return r.json()["access_token"] if r.status_code == 200 else None


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def main():
    print("\n=== Phase 6 client portal verification ===\n")
    admin = login(ADMIN_NAME, ADMIN_PASS)
    if not admin:
        print("!! admin login failed"); return
    _clear_test_portal_user()

    # Two clients to test isolation
    cidA = client.post("/api/clients", headers=auth(admin), json={"company_name": "Portal Co A", "trn": "100111111100003"}).json()["id"]
    cidB = client.post("/api/clients", headers=auth(admin), json={"company_name": "Portal Co B"}).json()["id"]
    # Invoice for A (sent) and B
    invA = client.post("/api/invoices", headers=auth(admin), json={"client_id": cidA, "line_items": [{"description": "Social Media Management", "quantity": 1, "unit_price": 500}]}).json()
    client.post(f"/api/invoices/{invA['id']}/send", headers=auth(admin))
    invB = client.post("/api/invoices", headers=auth(admin), json={"client_id": cidB, "line_items": [{"description": "VAT", "quantity": 1, "unit_price": 300}]}).json()
    client.post(f"/api/invoices/{invB['id']}/send", headers=auth(admin))

    # --- staff creates portal account for A -----------------------------------
    print("-- portal account management --")
    r = client.post(f"/api/clients/{cidA}/portal-users", headers=auth(admin),
                    json={"email": "owner@portalcoa.test", "password": "portalpw1", "full_name": "Owner A"})
    check("staff creates portal account", r.status_code in (200, 201))
    r = client.post(f"/api/clients/{cidA}/portal-users", headers=auth(admin),
                    json={"email": "owner@portalcoa.test", "password": "x"})
    check("short password rejected (400)", r.status_code == 400)
    r = client.post(f"/api/clients/{cidA}/portal-users", headers=auth(admin),
                    json={"email": "owner@portalcoa.test", "password": "another1"})
    check("duplicate email rejected (409)", r.status_code == 409)

    # --- portal login ---------------------------------------------------------
    print("\n-- portal login + token isolation --")
    ptok = portal_login("owner@portalcoa.test", "portalpw1")
    check("portal login succeeds", ptok is not None)
    check("bad portal password rejected", portal_login("owner@portalcoa.test", "wrong") is None)

    # cross-domain token isolation
    r = client.get("/api/clients", headers=auth(ptok))
    check("portal token REJECTED by staff endpoint (401)", r.status_code == 401)
    r = client.get("/api/portal/me", headers=auth(admin))
    check("staff token REJECTED by portal endpoint (401)", r.status_code == 401)

    # --- data scoping ---------------------------------------------------------
    print("\n-- data scoping --")
    r = client.get("/api/portal/me", headers=auth(ptok))
    check("portal /me returns own client", r.status_code == 200 and r.json()["client_id"] == cidA)

    r = client.get("/api/portal/invoices", headers=auth(ptok))
    inv_ids = [i["id"] for i in r.json()]
    check("portal sees own client's invoice", invA["id"] in inv_ids)
    check("portal does NOT see other client's invoice", invB["id"] not in inv_ids)

    r = client.get(f"/api/portal/invoices/{invB['id']}", headers=auth(ptok))
    check("portal blocked from other client's invoice (404)", r.status_code == 404)

    # draft invoice hidden
    draftA = client.post("/api/invoices", headers=auth(admin), json={"client_id": cidA, "line_items": [{"description": "draft", "quantity": 1, "unit_price": 1}]}).json()
    r = client.get(f"/api/portal/invoices/{draftA['id']}", headers=auth(ptok))
    check("portal cannot see draft invoice (404)", r.status_code == 404)

    # --- documents (upload provenance) ---------------------------------------
    print("\n-- portal document upload --")
    r = client.post("/api/portal/documents", headers=auth(ptok),
                    files={"file": ("statement.pdf", b"%PDF-1.4 test", "application/pdf")},
                    data={"category": "bank_statement"})
    check("portal uploads document", r.status_code in (200, 201))
    # staff sees it on client A with portal provenance
    docs = client.get(f"/api/documents?client_id={cidA}", headers=auth(admin)).json()
    check("staff sees portal-uploaded doc", any(d["file_name"] == "statement.pdf" for d in docs))

    # --- services status ------------------------------------------------------
    print("\n-- services + profile --")
    r = client.get("/api/portal/services", headers=auth(ptok))
    check("portal services endpoint ok", r.status_code == 200 and "services" in r.json())

    r = client.get("/api/portal/profile", headers=auth(ptok))
    check("portal profile shows TRN", r.status_code == 200 and r.json().get("trn") == "100111111100003")

    # change request creates a task
    r = client.post("/api/portal/profile/change-request", headers=auth(ptok), json={"message": "Update our phone number"})
    task_id = r.json().get("task_id")
    check("change-request creates a task", r.status_code == 200 and task_id is not None)
    db = SessionLocal()
    try:
        t = db.query(Task).filter(Task.id == task_id).first()
        check("task is linked to the client", t is not None and t.client_id == cidA)
    finally:
        db.close()

    # --- deactivation ---------------------------------------------------------
    print("\n-- deactivation --")
    pu = client.get(f"/api/clients/{cidA}/portal-users", headers=auth(admin)).json()[0]
    client.put(f"/api/portal-users/{pu['id']}", headers=auth(admin), json={"is_active": False})
    check("disabled account cannot log in", portal_login("owner@portalcoa.test", "portalpw1") is None)

    # cleanup
    _clear_test_portal_user()
    client.delete(f"/api/clients/{cidA}", headers=auth(admin))
    client.delete(f"/api/clients/{cidB}", headers=auth(admin))

    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
