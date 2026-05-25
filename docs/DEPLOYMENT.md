# Deployment & Operations

The app ships as two deployables: a **FastAPI backend** (one process) and a
**static frontend bundle** (Vite build output). They are decoupled — the SPA only
needs to know the API URL (`VITE_API_URL`).

---

## Dependencies

The backend's deployment dependencies are in the **root `requirements.txt`** (this
is what Railway/nixpacks installs — see `nixpacks.toml`). `backend/requirements.txt`
is a partial list and is **not** the one used by the production build.

> ⚠️ **Critical:** `backend/services/stripe_service.py` does `import stripe` at
> module top, and `main.py` imports it at startup. **`stripe` must be in the
> deployment `requirements.txt`** or the app crashes on boot — even if you never
> use Stripe. Likewise, web-push needs `pywebpush` (imported lazily, so its absence
> only disables push, not boot), and AI analysis needs a recent `anthropic`.
>
> The runtime venv has been verified with: `stripe==15.1.0`, `pywebpush==1.14.1`,
> `anthropic==0.103.1`, `reportlab==4.5.1`. Ensure the root `requirements.txt`
> pins are consistent with these before deploying. (Phase 10 aligned the root
> `requirements.txt` to include `stripe` and `pywebpush` and bump `anthropic`.)

To reproduce the working environment exactly:

```powershell
.\.venv\Scripts\python.exe -m pip freeze > requirements.lock.txt
```

---

## Local development

See [README.md](README.md#quickstart-local-development) for the full quickstart.
Summary:

```powershell
# backend (repo root)
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# frontend
cd frontend; npm install; npm run dev
```

The backend auto-creates tables, runs light migrations, seeds the admin, and
starts the sync scheduler on startup. No manual DB step is required for SQLite.

---

## Production — backend (Railway / nixpacks)

The repo is configured for Railway:

**`railway.json`**
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "uvicorn backend.main:app --host 0.0.0.0 --port $PORT" }
}
```

**`nixpacks.toml`**
```toml
[phases.build]
cmds = ["pip install -r requirements.txt"]

[start]
cmd = "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"
```

### Steps
1. Provision a **PostgreSQL** instance (Railway plugin) and note its connection
   URL.
2. Set environment variables on the service (see [CONFIGURATION.md](CONFIGURATION.md)):
   - `DATABASE_URL` — the Postgres URL (`postgres://` is auto-rewritten).
   - `SECRET_KEY` — a strong random value (**required** for production).
   - Optional: `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` (test mode),
     `ANTHROPIC_API_KEY`, `MAX_UPLOAD_BYTES`, `LOGIN_*`.
3. Deploy (push to the connected branch). Railway builds with nixpacks and runs the
   start command. The app binds `$PORT`.
4. On first boot it creates tables and seeds the `Yaso` admin. **Immediately log in
   and change the admin password**, then create real staff users via the Users page.

### Storage on Railway (important)
The default `STORAGE_BACKEND=local` writes uploaded documents to the container
filesystem, which is **ephemeral** — files are lost on redeploy/restart. For a
durable production deployment either:
- attach a persistent volume and point `STORAGE_DIR` at it, **or**
- implement the reserved `s3`/`supabase` backend in `storage_service.py` and set
  `STORAGE_BACKEND` accordingly (the API layer needs no changes).

### Database migrations on Postgres
`run_light_migrations()` is **SQLite-only** and is a no-op on Postgres. When you
add columns to existing tables, manage Postgres schema changes with a real tool
(e.g. Alembic) or a one-off `ALTER TABLE`. New tables are created automatically by
`Base.metadata.create_all` on startup.

---

## Production — frontend (static bundle)

```powershell
cd frontend
$env:VITE_API_URL = "https://your-api-host.example"   # build-time inlined
npm ci
npm run build        # emits ./dist
```

Deploy the `dist/` folder to any static host (Netlify, Cloudflare Pages, S3+CDN,
Nginx, …). Because it's a SPA using React Router, configure the host to **fall back
to `index.html`** for unknown paths (so deep links like `/clients/42` and
`/portal/...` resolve).

`VITE_API_URL` is baked in at build time — to change the API URL you must rebuild.

---

## Operations runbook

### Backups
- **Database:** the only stateful store for records. SQLite → copy `crm_local.db`
  while the app is stopped (or use `.backup`). Postgres → `pg_dump` on a schedule.
- **Documents:** back up `STORAGE_DIR` (or your S3/Supabase bucket). Document rows
  reference files by `stored_key`; a DB restore is incomplete without the matching
  files.
- **Audit trails:** `security_audit_logs` and `document_access_logs` are
  append-only — include them in DB backups; they are your forensic record.

### Reset a locked-out account
Login lockouts are **in-memory** — restarting the backend clears all of them.
Without a restart, an admin can clear them via `POST /api/security/unlock`
(`{identifier}` substring, or empty to clear all) or the **Audit Log** page. The
seeded admin is re-seeded every boot and effectively un-lockable. See
[SECURITY.md](SECURITY.md).

### Rotate `SECRET_KEY`
Invalidates all active sessions and outstanding signed download URLs. Schedule for
a low-traffic window; users simply re-log in.

### Enable card payments later
Set `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` (test keys) and restart. No data
migration needed — `Client.stripe_customer_id` is created lazily on first charge.

### Health check
`GET /` → `{"status": "Sonic CRM API running", "version": "2.0.0"}`. Use it as the
platform health probe.

### Logs
uvicorn logs to stdout (captured by the platform). `audit_service` swallows its own
errors so logging failures never block auth; check the security audit log in-app for
the security-event trail rather than stdout.

---

## Verifying a deployment

After deploy, smoke-test:
1. `GET /` returns the health JSON.
2. `GET /docs` renders the OpenAPI UI.
3. `POST /api/auth/login` with `Yaso` / `Yaso@123` returns a token (then change the
   password).
4. `GET /api/billing/config` → `stripe_enabled` reflects your env.
5. `GET /api/ai/config` → `ai_enabled` reflects your env.

Backend regression scripts (run against a throwaway/local DB, **not** production):

```powershell
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase3   # RBAC (18)
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase4   # documents (17)
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase5   # billing (26)
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase6   # portal (19)
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase7   # AI/compliance (16)
.\.venv\Scripts\python.exe -m backend.scripts.verify_phase9   # security (15)
```
