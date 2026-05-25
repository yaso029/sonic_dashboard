# Security

This document describes the security mechanisms in Sonic CRM: authentication and
the two token domains, the permission model, login rate-limiting/lockout, the
security audit trail, and the signed-URL document download model.

> **Local-safe by design.** Security here is deliberately tuned so the local admin
> can never be permanently locked out and the app always runs offline. Production
> hardening notes are called out at the end.

---

## Authentication

### Staff JWT
- Issued by `POST /api/auth/login` after verifying the password (bcrypt via
  passlib). Staff log in by **full name** (`User.full_name`, case-insensitive),
  not email.
- Token: JWT, **HS256**, signed with `SECRET_KEY`, claim `sub = user.id`,
  **8-hour** expiry (`auth_service.ACCESS_TOKEN_EXPIRE_HOURS`).
- Resolved on each request by `get_current_user`, which decodes the token, **rejects
  any `scope == "portal"` token**, and loads the active user.
- The frontend stores it in `localStorage.token`; on any `401` the axios
  interceptor clears storage and redirects to `/login`.

### Portal JWT (clients)
- Issued by `POST /api/portal/auth/login` after verifying a `ClientUser` password.
  Clients log in by **email**.
- Token: JWT, HS256, same `SECRET_KEY`, claims `sub = client_user.id`,
  `client_id`, **`scope = "portal"`**, **12-hour** expiry.
- Resolved by `get_current_client_user`, which **rejects any token whose scope is
  not `"portal"`**.

### The two security domains
Staff and clients are isolated even though both tokens are signed with the same key:

```
get_current_user           rejects scope == "portal"   → staff endpoints only
get_current_client_user    rejects scope != "portal"   → /api/portal/* only
```

This bidirectional check means a staff token cannot call a portal endpoint and a
portal token cannot call a staff endpoint. On top of that, **every** `/api/portal/*`
handler hard-scopes its query to `current_client_user.client_id`, so one client can
never read or write another client's data. (Verified in `verify_phase6`.)

### Passwords
- Hashed with **bcrypt** (`passlib` `CryptContext`). Plaintext is never stored or
  logged.
- Self-service change: `POST /api/auth/reset-password` (staff, verifies current
  password) / `POST /api/portal/auth/change-password` (portal, min 6 chars).
- Admin reset: `PATCH /api/users/{id}/password`. Portal reset by staff: `PUT
  /api/portal-users/{id}`.
- The seeded admin (`Yaso`) is re-created/repaired on every startup, so the local
  admin account can't be permanently lost.

> The staff self-set password endpoint enforces only a minimal length (4 chars) —
> there is **no enforced password-complexity policy** (a deliberate, lenient choice
> for this single-firm tool). Tighten in production if required.

---

## Authorization

Authorization is the permission matrix + row scoping described in
[RBAC.md](RBAC.md). In short: `require_permission(resource, action)` gates *what a
role may do*, and `scope_query` gates *which rows it may touch*; out-of-scope
records return `404` to avoid leaking their existence.

Portal accounts have **no** RBAC role — their capabilities are fixed by the
`/api/portal/*` endpoints (read-mostly: invoices, documents, status, profile
requests).

---

## Login rate limiting & lockout

Implemented in `backend/services/rate_limit.py`; applied to **both** staff and
portal login endpoints.

- **In-memory** by design: a backend restart clears *all* lockouts. This guarantees
  the local admin can never be permanently locked out.
- Per identifier key `scope:identifier|ip` (e.g. `staff:yaso|127.0.0.1`):
  - failures within a rolling window are counted;
  - reaching `LOGIN_MAX_ATTEMPTS` locks the key for `LOCKOUT_MINUTES`
    (auto-expiring);
  - a success or an admin unlock clears it.
- Lenient defaults (override via env — see [CONFIGURATION.md](CONFIGURATION.md)):

| Setting | Default |
|---------|---------|
| `LOGIN_MAX_ATTEMPTS` | 5 failures |
| `LOGIN_WINDOW_MINUTES` | 5-minute window |
| `LOCKOUT_MINUTES` | 5-minute lock |

- A locked login returns **`429`** with the remaining seconds.

### Admin escape hatch
`POST /api/security/unlock` (admin) clears lockouts — `{identifier}` is a substring
match against keys, or empty to clear everything. Surfaced in the **Audit Log** page.
The action is itself audited (`account_unlocked`).

---

## Security audit trail

`SecurityAuditLog` (table `security_audit_logs`) is an **append-only** record of
security-relevant events, written by `audit_service.record(...)`.

- The recorder opens its **own short-lived session** and **swallows all errors**, so
  a logging failure can never block the action being audited (especially login).
- The table is **not** a cascade child of anything — entries outlive the users they
  reference (`actor_label` keeps a human-readable name even with no FK).

### Event types (`audit_service.EVENT_TYPES`)
`login_success`, `login_failed`, `login_locked`, `logout`,
`user_created`, `user_updated`, `user_deactivated`, `password_reset`,
`portal_user_created`, `portal_user_updated`, `portal_user_disabled`,
`portal_login_success`, `portal_login_failed`, `account_unlocked`.

Each entry stores: event type, actor (id + label), target (type + id), a detail
string, IP address, and timestamp.

### Viewing it
Admins only: `GET /api/security/audit-log` (filter by `event_type`, paginate via
`limit` ≤ 500 / `offset`) and `GET /api/security/audit-log/meta` (event types +
current lockout settings). In the UI: **Settings → User Management → Security Audit
Log** (`/audit-log`, admin route).

---

## Document download security (signed URLs)

Client files are never served from a guessable path and never require putting the
bearer token in a URL.

- `GET /api/documents/{id}/signed-url` (auth + `documents:read`, scoped) mints a
  short-lived **HMAC token**: `base64url({d:<id>, e:<expiry>}).<hmac-sha256>`,
  signed with `SECRET_KEY`, **TTL ~5 minutes**.
- `GET /api/documents/{id}/download?token=…` verifies the token (signature via
  constant-time compare, not expired, **bound to that document id**) and streams the
  file. It needs **no** `Authorization` header, so the link works in a plain
  `<a href>` / new tab.
- The local backend confines paths to `STORAGE_DIR` (path-traversal guard). A future
  S3/Supabase backend would return a real presigned URL from the same `signed-url`
  endpoint.

This same token endpoint serves portal downloads (the portal mints tokens via
`/api/portal/documents/{id}/signed-url`, scoped to the client).

### Document access audit
Every meta view, signed-url issue (`view`), download, upload and delete is recorded
in `DocumentAccessLog`. It is **not** a cascade child of `Document`, so the trail —
including the `delete` event recorded *before* deletion — survives the file being
removed. Admins and senior accountants can read it via
`GET /api/documents/{id}/access-log`.

---

## External integrations & safety rails

- **Stripe is test-mode only.** A live key (`sk_live_…`/`rk_live_…`) is **refused**
  at initialisation, so the system can never move real money. Local invoice amounts
  are authoritative; Stripe IDs are references. The webhook is **signature-verified**
  (`STRIPE_WEBHOOK_SECRET`).
- **AI is opt-in.** Document analysis only runs with `ANTHROPIC_API_KEY`; the system
  prompt instructs the model to extract only what's present ("do not invent values").
- **Cloudinary** is used solely for HR/e-card images, never for client documents.

---

## Production hardening checklist

The defaults favour local development. Before exposing this publicly:

- [ ] Set a strong random **`SECRET_KEY`** (signs JWTs *and* download tokens).
- [ ] Change the seeded **admin password** immediately after first login.
- [ ] Restrict **CORS** — `main.py` uses `allow_origins=["*"]`; scope it to your
      frontend origin(s).
- [ ] Serve everything over **HTTPS** (tokens and downloads ride the URL/headers).
- [ ] Use **persistent, backed-up storage** for documents (the local container FS is
      ephemeral on most PaaS) and a managed **Postgres** with backups.
- [ ] Consider tightening the **password policy** and **lockout** thresholds, and
      review whether the in-memory limiter suits your scale (it's per-process).
- [ ] Decide whether to add a per-document **"internal only"** flag before giving
      clients portal access (today the portal exposes all of a client's documents).
- [ ] Keep the **audit logs** in your backup set — they are append-only forensic
      records.
