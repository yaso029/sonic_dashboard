# Configuration

All configuration is via **environment variables**. The template is
[`.env.example`](../.env.example) at the repo root — copy it to `.env` for local
development (`python-dotenv` loads it at startup via `load_dotenv()` in
`backend/main.py`).

> **Everything has a safe local default.** With no `.env` at all, the app runs
> end-to-end on SQLite + the local filesystem with zero external calls. Each
> integration below is opt-in.

| Variable | Default | Used by | Purpose |
|----------|---------|---------|---------|
| `DATABASE_URL` | `sqlite:///./crm_local.db` | `database/db.py` | DB connection. `postgres://` is auto-rewritten to `postgresql://`. |
| `SECRET_KEY` | `change-me…` (dev fallback) | auth + storage tokens | **Signs JWTs and document-download HMAC tokens.** Set a strong value in production. |
| `STORAGE_BACKEND` | `local` | `storage_service.py` | `local` writes to disk. `s3`/`supabase` are reserved (raise `NotImplementedError`). |
| `STORAGE_DIR` | `<cwd>/storage/documents` | `storage_service.py` | Where local document files live (gitignored). |
| `MAX_UPLOAD_BYTES` | `26214400` (25 MB) | documents + portal | Per-file upload cap. |
| `STRIPE_SECRET_KEY` | *(empty)* | `stripe_service.py` | Stripe **test** secret (`sk_test_…`). Empty ⇒ manual billing only. `sk_live_…` is **refused**. |
| `STRIPE_PUBLISHABLE_KEY` | *(empty)* | billing/portal config | Publishable key (`pk_test_…`), sent to the browser. |
| `STRIPE_WEBHOOK_SECRET` | *(empty)* | billing webhook | `whsec_…`; only needed if you run a webhook tunnel. |
| `ANTHROPIC_API_KEY` | *(empty)* | `ai_service.py` | Enables AI document analysis. Empty ⇒ analyze endpoint returns `503`; the tax checklist still works. |
| `AI_MODEL` | `claude-sonnet-4-6` | `ai_service.py` | Claude model for analysis. |
| `LOGIN_MAX_ATTEMPTS` | `5` | `rate_limit.py` | Failed logins (within window) before a temporary lock. |
| `LOCKOUT_MINUTES` | `5` | `rate_limit.py` | How long an account stays locked (auto-expires). |
| `LOGIN_WINDOW_MINUTES` | `5` | `rate_limit.py` | Rolling window over which failures are counted. |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | *(empty)* | `cloudinary_service.py` | **Only** HR photos + e-card images. Client documents do **not** use Cloudinary. |
| `VITE_API_URL` | `http://localhost:8000` | frontend `api.js` / `portalApi.js` | API base the SPA calls. Set at **build time** (Vite inlines `import.meta.env`). |
| `PORT` | (platform) | uvicorn start command | Bound by Railway/nixpacks (`--port $PORT`). |

Legacy partnerships/messaging integrations (Meta WhatsApp tokens, Meta lead-ad
verify token, Zapier webhook secret, SMTP) are read by their respective services
in `backend/services/` and `backend/api/`; set them only if you use those modules.

---

## Core

### `DATABASE_URL`
- **Local:** leave unset → SQLite file `crm_local.db` in the working directory.
- **Production:** a PostgreSQL URL. Railway supplies `postgres://…`, which
  `db.py` rewrites to `postgresql://…` (SQLAlchemy requires the latter). Postgres
  connections use `pool_pre_ping`, `pool_recycle=300`, `pool_size=5`,
  `max_overflow=10`.
- **Do not** point local dev at the production DB — the local schema path runs
  additive SQLite migrations only.

### `SECRET_KEY`
Signs **both** staff/portal JWTs (`auth_service`, HS256) **and** the document
download HMAC tokens (`storage_service`). If you rotate it:
- all existing sessions are invalidated (users must log in again), and
- any outstanding signed download URLs stop working (they're short-lived anyway).

The dev fallback is intentionally obvious so an unconfigured production deploy is
easy to catch. **Always set a strong random value in production.**

---

## Document storage (`STORAGE_*`, `MAX_UPLOAD_BYTES`)

`STORAGE_BACKEND=local` (default) stores files under `STORAGE_DIR`, date-sharded as
`YYYY/MM/<uuid><ext>`. The directory is created on first use and is **gitignored**.

`s3` and `supabase` are documented extension points: the factory `get_storage()`
raises `NotImplementedError` for them until you implement a `Storage` subclass
(`save`/`open`/`delete`/`exists`) and return it. The API layer never touches the
backend directly, so swapping is env-only once implemented.

Allowed upload content types (PDF, common images, Office docs, CSV, text) and the
size cap are enforced on every upload (staff and portal). See
`storage_service.ALLOWED_CONTENT_TYPES`.

---

## Stripe (`STRIPE_*`) — optional, **test mode only**

Billing works fully **without** Stripe (manual payment recording). Set a **test**
secret key to enable card payments.

- A **live** key (`sk_live_…` / `rk_live_…`) is **refused** at init
  (`StripeLiveKeyRefused`) so this app can never move real money.
- Endpoints needing Stripe return `503` when it's unconfigured
  (`/payment-intent`, `/sync-stripe`, the webhook).
- Local amounts are authoritative; Stripe IDs are stored only as references.
- The webhook (`STRIPE_WEBHOOK_SECRET`) is optional — `POST
  /api/invoices/{id}/sync-stripe` reconciles by polling, so you don't need a
  public URL in dev.

> ⚠️ The `stripe` package is imported at module load by `stripe_service.py`, which
> `main.py` imports at startup. It **must be installed** even if you don't use
> Stripe. See [DEPLOYMENT.md](DEPLOYMENT.md#dependencies) — confirm `stripe` is in
> the deployment `requirements.txt`.

---

## AI (`ANTHROPIC_API_KEY`, `AI_MODEL`) — optional

The deterministic UAE tax checklist (`tax_rules.py`) needs **no** key and is always
available. The Claude document-analysis endpoint
(`POST /api/documents/{id}/analyze`) requires `ANTHROPIC_API_KEY`; without it the
endpoint returns `503` and the rest of the app is unaffected. `AI_MODEL` defaults
to `claude-sonnet-4-6` (Opus/Haiku also valid). The `anthropic` package is imported
**lazily** inside the analysis call, so it's not a startup dependency.

---

## Login rate limiting (`LOGIN_*`, `LOCKOUT_MINUTES`)

The limiter is **in-memory** (`rate_limit.py`): a backend restart clears all
lockouts, so it can never permanently lock out the local admin. Lenient defaults (5
attempts / 5-minute window / 5-minute lock) apply to both staff and portal logins.
See [SECURITY.md](SECURITY.md).

---

## Frontend (`VITE_API_URL`)

Vite inlines `import.meta.env.VITE_API_URL` at **build time**, so it must be set
before `npm run build` (or `vite build`) for production. For local dev it defaults
to `http://localhost:8000`. Both axios clients (`api.js`, `portalApi.js`) read the
same base.

To point a production build at the deployed API:

```powershell
cd frontend
$env:VITE_API_URL = "https://api.your-domain.example"
npm run build   # emits ./dist
```

---

## CORS

`backend/main.py` currently sets `allow_origins=["*"]`. For production, restrict
this to your frontend origin(s).
