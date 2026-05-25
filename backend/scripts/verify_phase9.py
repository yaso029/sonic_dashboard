"""Phase 9 security verification — audit logging + login rate limiting/lockout.

The limiter is in-memory and per-process, so each run starts clean. We use a
throwaway username for the lockout test so the real admin is never locked out.
Run from the repo root:

    .venv/Scripts/python.exe -m backend.scripts.verify_phase9
"""
from fastapi.testclient import TestClient
from backend.main import app
from backend.database.db import SessionLocal, engine, Base, run_light_migrations
from backend.database.models import User
from backend.services.auth_service import hash_password
from backend.services import rate_limit

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
    return client.post("/api/auth/login", json={"username": n, "password": p})


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def seed_accountant():
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.full_name == "Demo Marketing Specialist").first()
        if u:
            u.role, u.is_active, u.password_hash = "marketing_specialist", True, hash_password(DEMO_PASS)
        else:
            db.add(User(full_name="Demo Marketing Specialist", email="marketing_specialist@demo.crm",
                        password_hash=hash_password(DEMO_PASS), role="marketing_specialist", is_active=True))
        db.commit()
    finally:
        db.close()


def main():
    print("\n=== Phase 9 security verification ===\n")
    rate_limit.unlock("")  # ensure a clean limiter
    seed_accountant()

    r = login(ADMIN_NAME, ADMIN_PASS)
    admin = r.json()["access_token"] if r.status_code == 200 else None
    check("admin login succeeds", admin is not None)
    acct = login("Demo Marketing Specialist", DEMO_PASS).json().get("access_token")

    # --- audit: login_success recorded ---------------------------------------
    print("\n-- audit logging --")
    r = client.get("/api/security/audit-log", headers=auth(admin), params={"event_type": "login_success", "limit": 20})
    check("login_success event recorded", r.status_code == 200 and any(e["actor_label"] == "Yaso" for e in r.json()["items"]))

    # non-admin cannot read the audit log
    r = client.get("/api/security/audit-log", headers=auth(acct))
    check("non-admin blocked from audit log (403)", r.status_code == 403)

    # --- audit on user changes -----------------------------------------------
    r = client.post("/api/users", headers=auth(admin), json={"full_name": "Audit Probe", "password": "probe123", "role": "marketing_specialist"})
    probe_id = r.json().get("id")
    client.delete(f"/api/users/{probe_id}", headers=auth(admin))
    r = client.get("/api/security/audit-log", headers=auth(admin), params={"event_type": "user_created", "limit": 50})
    check("user_created event recorded", any(e["target_id"] == probe_id for e in r.json()["items"]))
    r = client.get("/api/security/audit-log", headers=auth(admin), params={"event_type": "user_deactivated", "limit": 50})
    check("user_deactivated event recorded", any(e["target_id"] == probe_id for e in r.json()["items"]))

    # --- failed login recorded -----------------------------------------------
    print("\n-- failed login + lockout --")
    r = login("ghost_user", "wrong")
    check("bad login returns 401", r.status_code == 401)
    r = client.get("/api/security/audit-log", headers=auth(admin), params={"event_type": "login_failed", "limit": 50})
    check("login_failed event recorded", any(e["actor_label"] == "ghost_user" for e in r.json()["items"]))

    # --- lockout after N failures (throwaway username) -----------------------
    statuses = [login("lockme", "nope").status_code for _ in range(rate_limit.LOGIN_MAX_ATTEMPTS)]
    check(f"attempts before lock are 401", statuses[:-1] == [401] * (rate_limit.LOGIN_MAX_ATTEMPTS - 1))
    check("final attempt triggers 429 lockout", statuses[-1] == 429)
    check("subsequent attempt still 429 while locked", login("lockme", "nope").status_code == 429)
    r = client.get("/api/security/audit-log", headers=auth(admin), params={"event_type": "login_locked", "limit": 20})
    check("login_locked event recorded", any(e["actor_label"] == "lockme" for e in r.json()["items"]))

    # --- admin unlock ---------------------------------------------------------
    print("\n-- unlock --")
    r = client.post("/api/security/unlock", headers=auth(admin), json={"identifier": "lockme"})
    check("admin unlock clears the lockout", r.status_code == 200 and r.json()["cleared"] >= 1)
    check("after unlock, login is 401 again (not 429)", login("lockme", "nope").status_code == 401)

    # --- success clears counter ----------------------------------------------
    print("\n-- success resets counter --")
    for _ in range(3):
        login("Demo Marketing Specialist", "wrongpw")  # 3 failures (< threshold)
    ok = login("Demo Marketing Specialist", DEMO_PASS)
    check("valid login succeeds after a few failures", ok.status_code == 200)
    # counter cleared -> a single new failure is 401, not an immediate lock
    check("counter reset after success", login("Demo Marketing Specialist", "wrongpw").status_code == 401)

    rate_limit.unlock("")  # leave limiter clean
    print(f"\n=== {len(passed)} passed, {len(failed)} failed ===")
    if failed:
        print("FAILED:", failed)


if __name__ == "__main__":
    main()
