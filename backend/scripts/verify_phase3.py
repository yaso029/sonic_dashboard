"""Phase 3 RBAC verification.

Seeds one demo user per role (idempotent) and asserts the permission matrix is
actually enforced end-to-end through the FastAPI app (via TestClient, hitting the
real crm_local.db). Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase3
"""
from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal
from backend.database.models import User
from backend.services.auth_service import hash_password

client = TestClient(app)

# Admin seed credentials (login is by full_name).
ADMIN_NAME = "Yaso"
ADMIN_PASS = "Yaso@123"

DEMO_USERS = [
    ("Demo Marketing Specialist",  "marketing_specialist"),
    ("Demo Senior",      "marketing_manager"),
    ("Demo Marketing Analyst",     "analyst"),
    ("Demo Content Creation",     "social_media_specialist"),
    ("Demo Tax",         "seo_specialist"),
]
DEMO_PASS = "Demo@123"

passed, failed = [], []


def check(name, condition):
    (passed if condition else failed).append(name)
    print(("  PASS " if condition else "  FAIL ") + name)


def login(full_name, password):
    r = client.post("/api/auth/login", json={"username": full_name, "password": password})
    if r.status_code != 200:
        return None
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def seed_demo_users():
    """Create the per-role demo users directly in the DB (idempotent)."""
    db = SessionLocal()
    try:
        for full_name, role in DEMO_USERS:
            existing = db.query(User).filter(User.full_name == full_name).first()
            if existing:
                existing.role = role
                existing.is_active = True
                existing.password_hash = hash_password(DEMO_PASS)
            else:
                db.add(User(
                    full_name=full_name,
                    email=f"{role}@demo.crm",
                    password_hash=hash_password(DEMO_PASS),
                    role=role,
                    is_active=True,
                ))
        db.commit()
    finally:
        db.close()


def main():
    print("\n=== Phase 3 RBAC verification ===\n")

    admin_token = login(ADMIN_NAME, ADMIN_PASS)
    if not admin_token:
        print("!! Could not log in as admin (Yaso). Aborting.")
        return
    print(f"Admin login OK ({ADMIN_NAME})")

    seed_demo_users()
    print("Demo users seeded.\n")

    tokens = {}
    for full_name, role in DEMO_USERS:
        t = login(full_name, DEMO_PASS)
        check(f"login as {role}", t is not None)
        tokens[role] = t

    # --- /me/permissions shape -------------------------------------------------
    print("\n-- /api/auth/me/permissions --")
    r = client.get("/api/auth/me/permissions", headers=auth(tokens["analyst"]))
    check("analyst permissions endpoint 200", r.status_code == 200)
    perms = r.json().get("permissions", {})
    check("analyst clients read-only", perms.get("clients") == ["read"])
    r = client.get("/api/auth/me/permissions", headers=auth(tokens["social_media_specialist"]))
    check("content_creation service_type_scope == [content_creation]",
          r.json().get("service_type_scope") == ["content_creation"])

    # --- clients: create allowed for marketing_specialist, denied for analyst ------------
    print("\n-- clients RBAC --")
    r = client.post("/api/clients", headers=auth(tokens["marketing_specialist"]),
                    json={"company_name": "RBAC Test Co"})
    check("marketing_specialist can create client (201/200)", r.status_code in (200, 201))
    test_client_id = r.json().get("id") if r.status_code in (200, 201) else None

    r = client.post("/api/clients", headers=auth(tokens["analyst"]),
                    json={"company_name": "Marketing Analyst Should Fail"})
    check("analyst blocked from creating client (403)", r.status_code == 403)

    r = client.get("/api/clients", headers=auth(tokens["analyst"]))
    check("analyst can list clients (read, 200)", r.status_code == 200)

    # --- services: type scoping ------------------------------------------------
    print("\n-- services type-scoping --")
    if test_client_id:
        # social_media_specialist may create a content_creation service...
        r = client.post("/api/services", headers=auth(tokens["social_media_specialist"]),
                        json={"client_id": test_client_id, "service_type": "content_creation"})
        # NOTE: content_creation sees clients only via scope; this client has no content_creation svc yet,
        # so it may be 404 (not visible) rather than created. Accept 200/201/404.
        check("content_creation create content_creation-type not 403", r.status_code != 403)

        # ...but NOT a seo service (outside scope -> 403)
        r = client.post("/api/services", headers=auth(tokens["social_media_specialist"]),
                        json={"client_id": test_client_id, "service_type": "seo"})
        check("content_creation blocked from seo service (403)", r.status_code == 403)

        # seo_specialist may NOT create content_creation
        r = client.post("/api/services", headers=auth(tokens["seo_specialist"]),
                        json={"client_id": test_client_id, "service_type": "content_creation"})
        check("seo_specialist blocked from content_creation service (403)", r.status_code == 403)

    # --- tasks: delete only for senior/admin -----------------------------------
    print("\n-- tasks RBAC --")
    r = client.post("/api/tasks", headers=auth(tokens["marketing_specialist"]),
                    json={"title": "RBAC task"})
    check("marketing_specialist can create task", r.status_code in (200, 201))
    task_id = r.json().get("id") if r.status_code in (200, 201) else None
    if task_id:
        r = client.delete(f"/api/tasks/{task_id}", headers=auth(tokens["marketing_specialist"]))
        check("marketing_specialist blocked from deleting task (403)", r.status_code == 403)
        r = client.delete(f"/api/tasks/{task_id}", headers=auth(admin_token))
        check("admin can delete task", r.status_code == 200)

    # --- invalid role rejected -------------------------------------------------
    print("\n-- user role validation --")
    r = client.post("/api/users", headers=auth(admin_token),
                    json={"full_name": "Bad Role", "password": "x", "role": "wizard"})
    check("invalid role rejected (400)", r.status_code == 400)

    # cleanup the throwaway client
    if test_client_id:
        client.delete(f"/api/clients/{test_client_id}", headers=auth(admin_token))

    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
