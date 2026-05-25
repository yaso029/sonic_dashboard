# Architecture

Sonic CRM is a two-tier application: a **FastAPI** JSON API backed by a SQL
database, and a **React (Vite)** single-page app that consumes it. There is no
server-side rendering and no shared session state — the SPA holds a JWT and calls
the API directly.

```
┌──────────────────────────┐         HTTPS / JSON          ┌──────────────────────────┐
│  React SPA (Vite build)  │  ───────────────────────────▶ │  FastAPI app             │
│                          │   Authorization: Bearer <jwt> │  (backend.main:app)      │
│  api.js     → staff JWT  │                               │                          │
│  portalApi.js → portal   │ ◀───────────────────────────  │  SQLAlchemy 2.0 ORM      │
└──────────────────────────┘         JSON responses        └────────────┬─────────────┘
                                                                         │
                                          ┌──────────────────────────────┼───────────────────────────┐
                                          ▼                              ▼                            ▼
                                   SQLite / Postgres            Local file storage           Optional: Stripe (test),
                                   (crm_local.db / DATABASE_URL) (storage/documents/)         Anthropic, Cloudinary, Meta
```

The guiding constraint throughout is **local-first**: with no environment
configuration at all, the app runs end-to-end on SQLite + the local filesystem
with zero external calls. Every external integration is optional and degrades
gracefully (returns `503`, falls back to manual mode, or is skipped).

---

## Backend

| Concern | Choice |
|---------|--------|
| Web framework | FastAPI 0.111 (`backend/main.py`, `app = FastAPI(title="Sonic CRM API", version="2.0.0")`) |
| ASGI server | uvicorn |
| ORM | SQLAlchemy 2.0 (`DeclarativeBase`) |
| DB (local) | SQLite — `sqlite:///./crm_local.db` |
| DB (prod) | PostgreSQL via `DATABASE_URL` (Railway). `postgres://` is auto-rewritten to `postgresql://`. |
| Auth | JWT, HS256, signed with `SECRET_KEY`. Staff tokens 8 h, portal tokens 12 h. |
| Passwords | passlib + bcrypt |
| Validation | Pydantic 2 request models per router |
| CORS | `allow_origins=["*"]` (tighten in production) |

### Startup sequence (`@app.on_event("startup")`)
1. `Base.metadata.create_all(bind=engine)` — creates any missing tables.
2. `run_light_migrations()` — idempotent additive `ALTER TABLE … ADD COLUMN` for
   SQLite dev DBs (Postgres is expected to use real migrations). See
   [DATA_MODEL.md](DATA_MODEL.md#light-migrations).
3. `seed_admin()` — creates/repairs the `Yaso` admin (so the local admin is never
   permanently lost or locked out).
4. `start_scheduler()` — background customer→Meta sync scheduler.

### Layering
```
backend/
├── main.py          # composition root: includes every router, wires startup/shutdown
├── api/             # HTTP layer — one router per resource; thin, validation + scoping
├── services/        # domain/infrastructure logic, framework-agnostic where possible
└── database/
    ├── db.py        # engine/session/Base + run_light_migrations()
    └── models.py    # all ORM models in one module
```

Routers depend on services; services depend on models. The dependency that ties it
together is FastAPI's `Depends`:
- `get_db` yields a request-scoped `Session`.
- `get_current_user` / `get_current_client_user` resolve the caller from the JWT.
- `require_permission(resource, action)` is a guard **factory** backed by the
  permission matrix (see [RBAC.md](RBAC.md)).

### Key services (`backend/services/`)
| Service | Responsibility |
|---------|----------------|
| `auth_service.py` | JWT encode/decode, password hash/verify, `get_current_user`, role guards, `require_permission` factory |
| `portal_auth.py` | Portal JWT (`scope="portal"`), `get_current_client_user` — the separate client security domain |
| `permissions.py` | The single source of truth for RBAC: `PERMISSIONS` matrix, `can()`, `permissions_for()`, `service_type_scope()` |
| `storage_service.py` | Pluggable document storage (`LocalStorage` today; S3/Supabase reserved) + HMAC signed-download tokens |
| `stripe_service.py` | Optional Stripe **test-mode** client; refuses live keys; PaymentIntents + webhook verification |
| `ai_service.py` | Optional Anthropic Claude document analysis (vision/PDF/text → structured JSON) |
| `tax_rules.py` | Deterministic, network-free UAE compliance checklist generator |
| `audit_service.py` | Append-only security-event logging on its own session (never blocks the audited action) |
| `rate_limit.py` | In-memory login attempt limiter / temporary lockout |
| `notification_service.py` | In-app notifications + optional web-push (`pywebpush`, lazily imported) |
| `email_service.py`, `whatsapp_service.py`, `cloudinary_service.py`, `meta_capi_service.py`, `sync_scheduler.py`, `ai_reply_service.py` | Retained partnerships/HR/CRM integrations |

---

## The two security domains

This is the most important architectural boundary in the system. **Staff** and
**clients** authenticate against completely separate token domains:

| | Staff (internal) | Client portal |
|---|---|---|
| Account table | `users` | `client_users` |
| Login | `POST /api/auth/login` (by full name) | `POST /api/portal/auth/login` (by email) |
| Token mint | `auth_service.create_access_token` | `portal_auth.create_portal_token` |
| Token claim | *(no scope)* | `scope="portal"` + `client_id` |
| Token TTL | 8 hours | 12 hours |
| Dependency | `get_current_user` | `get_current_client_user` |
| Reaches | `/api/*` staff endpoints | `/api/portal/*` only |

The cross-domain rejection is explicit and bidirectional:
- `get_current_user` **rejects** any token with `scope == "portal"`.
- `get_current_client_user` **rejects** any token whose scope is not `"portal"`.

So a portal token can never call a staff endpoint and vice-versa, even though both
are signed with the same `SECRET_KEY`. Every `/api/portal/*` endpoint additionally
hard-scopes its query to `current_client_user.client_id`, so one client can never
see another client's data. See [SECURITY.md](SECURITY.md).

---

## Request flow (example: staff updates a client)

```
PUT /api/clients/42                Authorization: Bearer <staff jwt>
        │
        ├─ get_db ……………………… opens a Session
        ├─ require_permission("clients","update")
        │       └─ get_current_user → decodes JWT, loads active User, rejects portal scope
        │       └─ can(role,"clients","update") → 403 if not permitted
        ├─ scope_query(...) ……… restricts the row set to clients this user may see
        │                        (admin/auditor: all; senior: own+team; accountant: own;
        │                         payroll/tax: clients having an in-scope service)
        ├─ validate enums (legal_form, status)
        └─ commit → return client_to_dict(...)
```

Two scoping mechanisms work together:
1. **Permission matrix** (`can`) — *may this role perform this action on this
   resource type at all?*
2. **Row scoping** (`scope_query` in `api/clients.py`, reused by services, tasks,
   documents, invoices, subscriptions, billing) — *which specific rows can this
   user see?*

Service-scoped roles (`payroll_specialist`, `tax_consultant`) add a third filter:
they only see services of certain `service_type`s, and the parent clients of
those services. See [RBAC.md](RBAC.md).

---

## Frontend

| Concern | Choice |
|---------|--------|
| Framework | React 19 |
| Build/dev | Vite 8 |
| Routing | React Router 7 (`src/App.jsx`) |
| Styling | Tailwind CSS v4 (CSS-first, `@theme` tokens in `src/index.css`; no `tailwind.config.js`). Older screens still use inline styles — see `frontend/MIGRATION_TAILWIND.md`. |
| HTTP | axios — two instances: `api.js` (staff `token`) and `portalApi.js` (`portal_token`) |
| Charts | Recharts |
| Drag & drop | `@hello-pangea/dnd` (lead Kanban) |
| Toasts | `react-hot-toast` |
| QR codes | `qrcode.react` (e-cards) |

### Routing structure (`src/App.jsx`)
- **Public** (no auth): `/referral`, `/card/:slug`
- **Client portal** (portal token): `/portal/*` → self-contained `PortalApp`
- **Staff** (staff token, role-gated via `<PrivateRoute roles={[…]}>`):
  - `/` Landing (module selector)
  - `/crm` (+ `kanban`, `leads`, `leads/:id`, `referral-partners`, `customers`[admin])
  - `/clients`, `/clients/:id`
  - `/billing`, `/billing/:id`
  - `/partnerships/*` (admin), `/agents`, `/calendar`, `/hr/*` (admin+hr_admin),
    `/ecards`, `/settings`, `/audit-log` (admin)

### Auth context
- `AuthContext.jsx` holds the staff user + token (`localStorage.token`/`user`).
  `api.js` attaches the bearer token and, on any `401`, clears storage and
  redirects to `/login`.
- `PortalAuthContext.jsx` is the analogous provider for the portal app, using a
  separate `portal_token` key so the two sessions never collide.

---

## Data & files

- **Database** — all models live in `backend/database/models.py`. See
  [DATA_MODEL.md](DATA_MODEL.md).
- **Uploaded client documents** — never stored in the DB. The DB row keeps an
  opaque `stored_key`; bytes live in the storage backend (`storage/documents/`
  locally, date-sharded `YYYY/MM/<uuid><ext>`). Downloads use short-lived HMAC
  tokens so a plain `<a href>` works without a bearer header.
- **Invoice amounts** are the local source of truth; Stripe IDs are only stored as
  references. Stripe never holds authoritative balances.

---

## Design principles (why it's built this way)

1. **Local-first / offline-by-default.** No env vars required to run. External
   services are opt-in and degrade gracefully.
2. **Single firm.** No `firm_id`, no tenancy. Simpler queries, simpler scoping.
3. **One source of truth for permissions.** The matrix in `permissions.py` drives
   the backend guards, the `/api/auth/me/permissions` endpoint, and frontend
   button-hiding alike.
4. **Durable audit trails.** Document access logs and security audit logs are
   append-only and intentionally *not* cascade children, so they survive deletion
   of the things they describe.
5. **UAE specificity in the domain, not the framework.** 5% VAT, TRN, CT, ESR,
   AED, FTA deadlines are encoded in the accounting models and `tax_rules.py`.
