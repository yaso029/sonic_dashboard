"""Phase 4 documents verification.

Exercises the full document lifecycle through the FastAPI app (TestClient, real
crm_local.db + local storage backend): upload, list, signed-url, token download,
access-log, RBAC, and durable delete audit. Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase4
"""
from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal, engine, Base
from backend.database.models import User, DocumentAccessLog
from backend.services.auth_service import hash_password

# Ensure new Phase 4 tables exist (idempotent) — the module-level TestClient does
# not fire the startup hook that normally runs create_all.
Base.metadata.create_all(bind=engine)

client = TestClient(app)

ADMIN_NAME, ADMIN_PASS = "Yaso", "Yaso@123"
DEMO_PASS = "Demo@123"
DEMO_USERS = [
    ("Demo Marketing Specialist", "marketing_specialist"),
    ("Demo Marketing Analyst", "analyst"),
]

PDF_BYTES = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF\n"

passed, failed = [], []


def check(name, condition):
    (passed if condition else failed).append(name)
    print(("  PASS " if condition else "  FAIL ") + name)


def login(full_name, password):
    r = client.post("/api/auth/login", json={"username": full_name, "password": password})
    return r.json()["access_token"] if r.status_code == 200 else None


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def seed():
    db = SessionLocal()
    try:
        for full_name, role in DEMO_USERS:
            u = db.query(User).filter(User.full_name == full_name).first()
            if u:
                u.role, u.is_active, u.password_hash = role, True, hash_password(DEMO_PASS)
            else:
                db.add(User(full_name=full_name, email=f"{role}@demo.crm",
                            password_hash=hash_password(DEMO_PASS), role=role, is_active=True))
        db.commit()
    finally:
        db.close()


def main():
    print("\n=== Phase 4 documents verification ===\n")
    admin = login(ADMIN_NAME, ADMIN_PASS)
    if not admin:
        print("!! admin login failed; abort")
        return
    seed()
    acct = login("Demo Marketing Specialist", DEMO_PASS)
    analyst = login("Demo Marketing Analyst", DEMO_PASS)
    check("logins ok", all([acct, analyst]))

    # A client to attach documents to (assigned to the marketing_specialist so it's visible).
    acct_id = SessionLocal().query(User).filter(User.full_name == "Demo Marketing Specialist").first().id
    r = client.post("/api/clients", headers=auth(admin),
                    json={"company_name": "Docs Test Co", "assigned_accountant_id": acct_id})
    client_id = r.json()["id"]
    check("created test client", r.status_code in (200, 201))

    # --- upload RBAC ----------------------------------------------------------
    print("\n-- upload --")
    files = {"file": ("trade_license.pdf", PDF_BYTES, "application/pdf")}
    r = client.post("/api/documents", headers=auth(acct), files=files,
                    data={"client_id": client_id, "category": "trade_license", "notes": "TL 2026"})
    check("marketing_specialist uploads document", r.status_code in (200, 201))
    doc_id = r.json().get("id") if r.status_code in (200, 201) else None
    check("upload records size", (r.json().get("size_bytes") or 0) == len(PDF_BYTES))

    r = client.post("/api/documents", headers=auth(analyst), files={"file": ("x.pdf", PDF_BYTES, "application/pdf")},
                    data={"client_id": client_id, "category": "other"})
    check("analyst blocked from upload (403)", r.status_code == 403)

    # disallowed content type
    r = client.post("/api/documents", headers=auth(acct), files={"file": ("evil.exe", b"MZ", "application/x-msdownload")},
                    data={"client_id": client_id, "category": "other"})
    check("disallowed content-type rejected (400)", r.status_code == 400)

    # --- list -----------------------------------------------------------------
    print("\n-- list / read --")
    r = client.get(f"/api/documents?client_id={client_id}", headers=auth(acct))
    check("marketing_specialist lists documents", r.status_code == 200 and any(d["id"] == doc_id for d in r.json()))
    r = client.get(f"/api/documents?client_id={client_id}", headers=auth(analyst))
    check("analyst can read documents (200)", r.status_code == 200)

    # --- signed url + token download -----------------------------------------
    print("\n-- signed url + download --")
    r = client.get(f"/api/documents/{doc_id}/signed-url", headers=auth(acct))
    check("signed-url returns url+expiry", r.status_code == 200 and "token=" in r.json().get("url", ""))
    url = r.json()["url"]
    # token download requires NO auth header
    r = client.get(url)
    check("token download returns file bytes", r.status_code == 200 and r.content == PDF_BYTES)
    # tamper with token
    bad = url.rsplit(".", 1)[0] + ".deadbeef"
    r = client.get(bad)
    check("tampered token rejected (403)", r.status_code == 403)

    # --- access log -----------------------------------------------------------
    print("\n-- access log --")
    r = client.get(f"/api/documents/{doc_id}/access-log", headers=auth(admin))
    actions = {e["action"] for e in r.json()} if r.status_code == 200 else set()
    check("admin sees access log with upload/view/download",
          r.status_code == 200 and {"upload", "view", "download"}.issubset(actions))
    r = client.get(f"/api/documents/{doc_id}/access-log", headers=auth(acct))
    check("marketing_specialist blocked from access log (403)", r.status_code == 403)

    # --- delete RBAC + durable audit -----------------------------------------
    print("\n-- delete --")
    r = client.delete(f"/api/documents/{doc_id}", headers=auth(acct))
    check("marketing_specialist blocked from delete (403)", r.status_code == 403)
    r = client.delete(f"/api/documents/{doc_id}", headers=auth(admin))
    check("admin deletes document", r.status_code == 200)
    # delete log row should survive the document deletion
    db = SessionLocal()
    try:
        del_logs = db.query(DocumentAccessLog).filter(
            DocumentAccessLog.document_id == doc_id, DocumentAccessLog.action == "delete"
        ).count()
    finally:
        db.close()
    check("delete is recorded in durable audit log", del_logs >= 1)
    r = client.get(f"/api/documents/{doc_id}", headers=auth(admin))
    check("deleted document now 404", r.status_code == 404)

    # cleanup test client
    client.delete(f"/api/clients/{client_id}", headers=auth(admin))

    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
