# API Reference

Base URL (local): **`http://localhost:8000`** · Interactive docs: **`/docs`** ·
OpenAPI JSON: **`/openapi.json`**

All endpoints return JSON. Unless noted as *public* or *portal*, every endpoint
requires a **staff** bearer token:

```
Authorization: Bearer <token from POST /api/auth/login>
```

### Conventions used below
- **Auth** column: `public` (none), `staff` (any active internal user),
  `portal` (client-portal token), or a permission like `clients:update` (enforced
  by `require_permission`), or a role guard like `admin`.
- A permission such as `clients:read` means *the role must have the `read` action
  on the `clients` resource* in the matrix ([RBAC.md](RBAC.md)). On top of that,
  **row scoping** restricts which records are returned/affected — see each module.
- Dates are `YYYY-MM-DD` strings; timestamps are ISO-8601.
- `404` is returned (instead of `403`) when a record exists but is outside the
  caller's visible scope, to avoid leaking existence.

---

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | public | Body `{username, password}`. **`username` is the user's full name** (`ilike`). Returns `{access_token, token_type, user}`. Rate-limited: `429` after `LOGIN_MAX_ATTEMPTS` failures (see [SECURITY.md](SECURITY.md)). |
| GET | `/api/auth/me` | staff | Current user incl. `permissions` map + `service_type_scope`. |
| GET | `/api/auth/me/permissions` | staff | `{role, permissions, service_type_scope}` — drives frontend UI gating. |
| POST | `/api/auth/reset-password` | staff | Body `{current_password, new_password}`. Self-service change; audited. |
| POST | `/api/auth/logout` | staff | Audited; client discards the token (stateless JWT). |

## Users — `/api/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/me` | staff | Current user record. |
| PATCH | `/api/users/me/password` | staff | Body `{password}` (min 4 chars). |
| GET | `/api/users` | admin | List all users. |
| GET | `/api/users/team` | staff | Admin → all accountants/seniors; senior → self + team members; others → empty. |
| POST | `/api/users` | admin | Body `{full_name, email?, password, role, team_leader_id?}`. `role` ∈ [RBAC roles]. Auto-generates a unique email if omitted. Audited. |
| PUT | `/api/users/{id}` | admin | Update name/email/role/team/active. Audited. |
| PATCH | `/api/users/{id}/password` | admin | Body `{password}`. Admin reset. Audited. |
| DELETE | `/api/users/{id}` | admin | Soft-deactivate (`is_active=false`). Cannot deactivate yourself. Audited. |

---

## Clients — `/api/clients`

Row scoping (`scope_query`): admin & auditor see all; senior_accountant sees own +
team's assigned clients; payroll_specialist & tax_consultant see clients having an
in-scope service; everyone else sees own assigned clients.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/clients/meta` | staff | Form catalog: `legal_forms`, `emirates`, `statuses`. |
| GET | `/api/clients` | staff | List (scoped). Query: `status`, `search` (name/contact/email/TRN/licence), `assigned_to`. Includes `service_count` + `open_task_count`. |
| GET | `/api/clients/{id}` | staff | Single client (scoped) with counts. |
| POST | `/api/clients` | `clients:create` | Create. Body = client profile (see below). Defaults `assigned_accountant_id` to the creator. |
| PUT | `/api/clients/{id}` | `clients:update` | Partial update (scoped). Validates `legal_form` + `status`. |
| DELETE | `/api/clients/{id}` | `admin` | **Archive** (sets `status="archived"`; not a hard delete). |

**Client create/update fields:** `company_name` (required on create),
`primary_contact_name`, `primary_email`, `primary_phone`, `trn`,
`ct_registration_number`, `trade_license_number`, `trade_license_emirate`,
`legal_form` (`llc, sole_establishment, fzc, fze, branch, free_zone, offshore,
civil_company, other`), `industry`, `fiscal_year_end_month` (1–12, default 12),
`fiscal_year_end_day` (1–31, default 31), `esr_applicable`,
`assigned_accountant_id`, `lead_id`, `notes`. Update also accepts `status`
(`active, paused, archived`).

## Services — `/api/services`

Visibility flows through the parent client's scope; service-scoped roles are
additionally limited to their `service_type`s.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/services/catalog` | staff | UAE catalog: types with default recurrence + typical fee, plus `statuses`, `recurrences`. |
| GET | `/api/services` | staff | List (scoped). Query: `client_id`, `status`, `service_type`. |
| GET | `/api/services/{id}` | staff | Single (scoped). |
| POST | `/api/services` | `services:create` | Body `{client_id, service_type, status?, recurrence?, assigned_to?, start_date?, end_date?, fee_amount?, fee_currency?, notes?}`. |
| PUT | `/api/services/{id}` | `services:update` | Partial update. |
| DELETE | `/api/services/{id}` | `services:update` | Soft-cancel (`status="cancelled"`). |

`service_type` ∈ `bookkeeping, vat_filing, corporate_tax, payroll, audit, cfo,
financial_statements, company_formation, tax_consultation`. `recurrence` ∈
`one_time, monthly, quarterly, annual`. `status` ∈ `active, paused, completed,
cancelled`.

## Tasks — `/api/tasks`

Visible if assigned to you, created by you, or linked to a client you can see
(admin sees all).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tasks` | staff | List (scoped). Query: `client_id`, `service_id`, `status`, `assigned_to`. Ordered by due date then priority. |
| GET | `/api/tasks/{id}` | staff | Single (scoped). |
| POST | `/api/tasks` | `tasks:create` | Body `{title, description?, client_id?, service_id?, due_date?, priority?, status?, assigned_to?}`. Standalone tasks allowed. |
| PUT | `/api/tasks/{id}` | `tasks:update` | Partial update. Auto-stamps/clears `completed_at` on `status=done`. |
| DELETE | `/api/tasks/{id}` | `tasks:delete` | Hard delete. |

`status` ∈ `todo, in_progress, blocked, done`. `priority` ∈ `low, normal, high, urgent`.

---

## Documents — `/api/documents`

Storage-backend-agnostic; visibility reuses client scoping. See
[SECURITY.md](SECURITY.md) for the signed-URL download model.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/documents/meta` | staff | `categories`, `max_upload_bytes`, `allowed_content_types`. |
| GET | `/api/documents` | `documents:read` | List (scoped). Query: `client_id`, `service_id`, `category`. |
| POST | `/api/documents` | `documents:create` | **multipart**: `file`, `client_id`, `service_id?`, `category?`, `notes?`. Validates type + size. Logs `upload`. |
| GET | `/api/documents/{id}` | `documents:read` | Metadata (scoped). |
| GET | `/api/documents/{id}/signed-url` | `documents:read` | Mints a short-lived (5 min) tokenised download URL. Logs `view`. |
| GET | `/api/documents/{id}/download?token=` | **token** | Streams the file. **No bearer header** — auth is the HMAC token, bound to the doc id + expiry. Logs `download`. |
| DELETE | `/api/documents/{id}` | `documents:delete` | Deletes file + row; logs `delete` first (the log row survives). |
| GET | `/api/documents/{id}/access-log` | admin / senior_accountant | Full access trail for the document. |

`category` ∈ `trade_license, vat_return, ct_return, financial_statement,
bank_statement, invoice, receipt, contract, passport_eid, audit_report, payroll,
other`.

---

## Invoices — `/api/invoices`

UAE VAT invoices. Local amounts are authoritative. Visibility via client scope.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/invoices/meta` | staff | `statuses`, `default_vat_rate` (5.0), `payment_terms_days` (30). |
| GET | `/api/invoices` | `invoices:read` | List (scoped). Query: `client_id`, `status`. |
| GET | `/api/invoices/{id}` | `invoices:read` | Single with line items + payments. `overdue` + `balance` computed. |
| POST | `/api/invoices` | `invoices:create` | Body `{client_id, service_id?, subscription_id?, currency?, issue_date?, due_date?, vat_rate?, notes?, line_items[]}`. ≥1 line item required. Created as `draft`. |
| PUT | `/api/invoices/{id}` | `invoices:update` | **Draft only** (`409` otherwise). Replaces line items; recomputes totals/VAT. |
| POST | `/api/invoices/{id}/send` | `invoices:update` | `draft → sent`; stamps `issue_date`. |
| POST | `/api/invoices/{id}/void` | `invoices:update` | Void (blocked if any payment recorded). |
| POST | `/api/invoices/from-service/{service_id}` | `invoices:create` | Generate a draft invoice from a service's fee. |
| DELETE | `/api/invoices/{id}` | `invoices:delete` | **Draft or void only**. |

Line item: `{description, quantity, unit_price}`. Totals: `subtotal = Σ(qty×price)`,
`vat_amount = subtotal × vat_rate/100`, `total = subtotal + vat`. Statuses:
`draft, sent, partially_paid, paid, void`.

## Payments — `/api/invoices/{id}/…`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/invoices/{id}/payments` | `invoices:update` | Record a **manual** payment `{amount, method?, reference?, paid_at?}`. Invoice must be sent (not draft/void). Cannot exceed balance. Reconciles status. |
| POST | `/api/invoices/{id}/payment-intent` | `invoices:update` | Create a Stripe PaymentIntent for the balance. `503` if Stripe not configured. Returns `{client_secret, payment_intent_id, amount}`. |
| POST | `/api/invoices/{id}/sync-stripe` | `invoices:update` | Poll the PaymentIntent; record the payment if `succeeded` (idempotent). For webhook-less local reconciliation. |

`method` ∈ `cash, bank_transfer, card, cheque, stripe, other`.

## Subscriptions — `/api/subscriptions`

Recurring retainers that materialise invoices.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/subscriptions/meta` | `invoices:read` | `intervals`, `statuses`. |
| GET | `/api/subscriptions` | `invoices:read` | List (scoped). Query: `client_id`, `status`. |
| POST | `/api/subscriptions` | `invoices:create` | Body `{client_id, service_id?, description?, amount, currency?, interval, status?, next_invoice_date?}`. |
| PUT | `/api/subscriptions/{id}` | `invoices:update` | Partial update. |
| DELETE | `/api/subscriptions/{id}` | `invoices:delete` | Soft-cancel. |
| POST | `/api/subscriptions/generate-due` | `invoices:create` | Create invoices for every active sub with `next_invoice_date ≤ today` (scoped), then advance each schedule. Returns `{generated, invoices[]}`. |

`interval` ∈ `monthly, quarterly, annual`. `status` ∈ `active, paused, cancelled`.

## Billing — `/api/billing`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/billing/config` | staff | `{stripe_enabled, publishable_key, currency_default}`. |
| POST | `/api/billing/stripe/webhook` | public (signature-verified) | Handles `payment_intent.succeeded`. Requires `STRIPE_WEBHOOK_SECRET`. Optional — `/sync-stripe` covers local setups. |
| GET | `/api/billing/reports` | `invoices:read` | Revenue summary + AR aging buckets `current / 1_30 / 31_60 / 61_90 / 90_plus`, `vat_collected`, `status_counts` (scoped). |

---

## AI & Compliance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai/config` | staff | `{ai_enabled, model, analyzable_content_types}`. |
| GET | `/api/clients/{id}/tax-checklist` | `clients:read` | Deterministic UAE compliance checklist (VAT, CT, ESR, audit, trade licence) + deadlines + disclaimer. **Always available** (no AI). |
| POST | `/api/documents/{id}/analyze` | `documents:read` | Claude analysis of a stored doc → cached `{summary, suggested_category, extracted}`. `503` without `ANTHROPIC_API_KEY`; `400` for unsupported types. |

---

## Security (admin) — `/api/security`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/security/audit-log/meta` | admin | `event_types` + lockout settings. |
| GET | `/api/security/audit-log` | admin | Paged audit log. Query: `event_type`, `limit` (≤500), `offset`. |
| POST | `/api/security/unlock` | admin | Body `{identifier}` (substring; empty = all). Clears login lockouts. Audited. |

---

## Client Portal — `/api/portal`

**Separate security domain.** All endpoints except login require a portal token
(`scope="portal"`) and are hard-scoped to the account's `client_id`. See
[CLIENT_PORTAL_GUIDE.md](CLIENT_PORTAL_GUIDE.md).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/portal/auth/login` | public | Body `{email, password}`. Returns portal token + `{user, client}`. Rate-limited. |
| GET | `/api/portal/me` | portal | Current portal account + company. |
| POST | `/api/portal/auth/change-password` | portal | `{current_password, new_password}` (min 6). |
| GET | `/api/portal/billing/config` | portal | Stripe availability + publishable key. |
| GET | `/api/portal/invoices` | portal | Own non-draft invoices. |
| GET | `/api/portal/invoices/{id}` | portal | Own invoice (non-draft) with detail. |
| POST | `/api/portal/invoices/{id}/payment-intent` | portal | Pay own invoice via Stripe. `503` if disabled. |
| GET | `/api/portal/documents` | portal | Own client's documents. |
| GET | `/api/portal/documents/meta` | portal | Upload constraints. |
| GET | `/api/portal/documents/{id}/signed-url` | portal | Download URL for an own document. |
| POST | `/api/portal/documents` | portal | **multipart** upload `{file, category?, notes?}`; tagged `[Client upload]`, provenance recorded. |
| GET | `/api/portal/services` | portal | Own services + simplified open tasks (`title/status/due` only — no internal notes). |
| GET | `/api/portal/profile` | portal | Read-only company profile. |
| POST | `/api/portal/profile/change-request` | portal | `{message}` → creates a task for the assigned accountant (does not mutate the record). |

## Portal admin (staff) — manage client portal accounts

Gated by `clients:update` + client visibility.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/clients/{client_id}/portal-users` | `clients:update` | List portal accounts for a client. |
| POST | `/api/clients/{client_id}/portal-users` | `clients:update` | Create `{email, password (≥6), full_name?}`. Audited. |
| PUT | `/api/portal-users/{id}` | `clients:update` | Update name / password / `is_active`. Audited. |
| DELETE | `/api/portal-users/{id}` | `clients:update` | Disable (`is_active=false`). Audited. |

---

## Retained CRM / partnerships / HR modules

These predate the accounting refactor and are kept. Endpoint inventory (request
bodies in source under `backend/api/`):

### Leads — `/api/leads`
`GET /` · `GET /kanban` · `GET /{id}` · `POST /` · `PUT /{id}` ·
`PATCH /{id}/stage` · `PATCH /{id}/assign` · `POST /{id}/activities` ·
`GET /{id}/activities` · `POST /bulk` · `DELETE /{id}` ·
`POST /{id}/convert` (lead → client). Import: `POST /api/leads/import/preview`,
`POST /api/leads/import`.

### Dashboard — `/api/dashboard`
`GET /stats` · `GET /admin`.

### Notifications — `/api/notifications`
`GET /` · `GET /unread-count` · `PATCH /{id}/read` · `PATCH /read-all` ·
`GET /vapid-public-key` · `POST /push-subscribe` · `DELETE /push-unsubscribe`.

### Customers / Meta sync — `/api/customers`
`GET /dashboard` · `GET /` · `POST /import` · `POST /{id}/sync` ·
`POST /sync-selected` · `DELETE /{id}`.

### Partnerships — `/api/partners`, `/api/partnerships`, `/api/commissions`
Partners: `GET /` · `POST /` · `PUT /{id}` · `DELETE /{id}` · `POST /import` ·
`GET /export`. Dashboard: `GET /api/partnerships/dashboard`. Commissions:
`GET /` · `POST /` · `PUT /{id}` · `PUT /{id}/paid`.

### Messaging — `/api/whatsapp`, `/api/email`
WhatsApp: send, templates (CRUD + submit/check-status/status), `sent`, `replies`,
`replies/{id}/action`, `subscribe-phone`, and the Meta `webhook` (GET verify /
POST receive). Email: `daily-count`, `send`, templates CRUD, `sent`.

### Referral applications
Public: `POST /referral/form/save`. Staff: `GET /api/referral-applications`,
`PATCH /api/referral-applications/{id}`.

### HR — `/api/hr` (admin + hr_admin)
Employees CRUD, `employees/{id}/photo`, `employees/{id}/documents` (+ delete).

### Calendar — `/api/calendar`
Events list/pending/create/update/image/approve/reject/delete.

### E-cards — `/api/ecards`
`GET /public/{slug}` (public) + CRUD + `{id}/photo`.

### Webhooks — `/api/webhook`
`POST /zapier` (header `X-Webhook-Secret`), Meta lead ads `GET/POST /meta-leads`.

---

## Common error responses

| Status | Meaning |
|--------|---------|
| `400` | Validation error (bad enum, empty file, amount ≤ 0, etc.) |
| `401` | Missing/invalid/expired token, or wrong token domain (portal↔staff) |
| `403` | Permission denied by the matrix, or restricted sub-resource |
| `404` | Not found **or** outside your visible scope |
| `409` | State conflict (e.g. editing a non-draft invoice, voiding a paid one) |
| `410` | Underlying stored file no longer exists |
| `413` | Upload exceeds `MAX_UPLOAD_BYTES` |
| `429` | Login rate-limited / temporarily locked |
| `502` | Upstream (Stripe/Anthropic) error |
| `503` | Optional integration not configured (Stripe / AI) |
