# Data Model

All models live in a single module: **`backend/database/models.py`**, mapped with
SQLAlchemy 2.0 (`DeclarativeBase` from `backend/database/db.py`). The local
database is SQLite (`crm_local.db`); production uses PostgreSQL via `DATABASE_URL`.

Tables are auto-created on startup (`Base.metadata.create_all`). Single-firm tool:
**no `firm_id` / tenancy column anywhere**.

---

## Table overview

### Accounting domain (the core)

| Table | Model | Purpose |
|-------|-------|---------|
| `clients` | `Client` | Client company + UAE tax/licensing profile |
| `services` | `Service` | Engagements (bookkeeping, VAT, CT, payroll, …) per client |
| `tasks` | `Task` | Work items, optionally linked to a client/service |
| `documents` | `Document` | Client files (metadata; bytes live in storage) |
| `document_access_logs` | `DocumentAccessLog` | Append-only access trail for documents |
| `invoices` | `Invoice` | UAE VAT invoices |
| `invoice_line_items` | `InvoiceLineItem` | Invoice lines |
| `payments` | `Payment` | Payments against invoices |
| `subscriptions` | `Subscription` | Recurring retainers that generate invoices |
| `client_users` | `ClientUser` | Client-portal login accounts (separate security domain) |
| `security_audit_logs` | `SecurityAuditLog` | Append-only security-event trail |

### Core / retained

| Table | Model | Purpose |
|-------|-------|---------|
| `users` | `User` | Internal staff accounts + roles |
| `push_subscriptions` | `PushSubscription` | Web-push endpoints |
| `ecards` | `ECard` | Digital business cards |
| `leads` | `Lead` | Inquiry-stage CRM records (convert → `Client`) |
| `activities` | `Activity` | Lead activity log |
| `notifications` | `Notification` | In-app notifications |
| `customers` | `Customer` | Generic contacts for Meta CAPI sync |
| `sync_logs` | `SyncLog` | Customer-sync run log |
| `partners` | `Partner` | B2B referral partners |
| `outreach_messages` / `incoming_replies` | … | WhatsApp/email outreach + replies |
| `whatsapp_templates` / `email_templates` | … | Messaging templates |
| `commissions` | `Commission` | Partner commissions |
| `employees` / `employee_documents` | `Employee` / `EmployeeDocument` | HR records |
| `referral_applications` | `ReferralApplication` | Public referral form submissions |
| `calendar_events` | `CalendarEvent` | Company calendar |

---

## Relationships (accounting domain)

```
                          ┌──────────┐
                          │  users   │ (staff)
                          └────┬─────┘
              assigned_accountant │ created_by / assigned_to / uploaded_by / recorded_by
                          ┌──────▼───────┐
            lead_id ──────│   clients    │──────────────────────────────┐
        (Lead source)     └──┬───┬───┬───┬──────────────┬───────────────┤
                             │   │   │   │              │               │
                  services ◀─┘   │   │   └─▶ documents  └─▶ invoices     └─▶ subscriptions
                     │           │   │          │              │  │
                tasks ◀──────────┘   │     access_logs    line_items payments
                     ▲               │     (no cascade)
       service_id ───┘               └─▶ client_users (portal)  ─┐
                                                                 │ uploaded_by_portal_user_id
                                                  documents ◀────┘
```

### `Client` (`clients`)
The hub of the accounting domain.

- **Identity:** `company_name` (required), `primary_contact_name`, `primary_email`,
  `primary_phone`.
- **UAE tax/licensing:** `trn` (15-digit VAT TRN), `ct_registration_number`,
  `trade_license_number`, `trade_license_emirate`.
- **Entity profile:** `legal_form`, `industry`, `fiscal_year_end_month` (1–12,
  default 12), `fiscal_year_end_day` (1–31, default 31), `esr_applicable`.
- **CRM:** `status` (`active/paused/archived`), `assigned_accountant_id` → `users`,
  `lead_id` → `leads` (conversion source), `notes`, `stripe_customer_id`.
- **Children (cascade delete):** `services`, `documents`, `invoices`,
  `subscriptions`. `tasks` is **not** cascade (tasks may be standalone).

### `Service` (`services`)
`client_id` (req) → `clients`. `service_type` ∈ `bookkeeping, vat_filing,
corporate_tax, payroll, audit, cfo, financial_statements, company_formation,
tax_consultation`. `status` ∈ `active/paused/completed/cancelled`. `recurrence` ∈
`one_time/monthly/quarterly/annual`. Plus `assigned_to`, `start_date`, `end_date`,
`fee_amount`, `fee_currency` (AED). Has many `tasks`.

### `Task` (`tasks`)
`client_id?` + `service_id?` both nullable (standalone tasks allowed). `title`
(req), `description`, `due_date`, `priority` (`low/normal/high/urgent`), `status`
(`todo/in_progress/blocked/done`), `assigned_to`, `created_by`, `completed_at`
(auto-stamped on `done`).

### `Document` (`documents`)
`client_id?` (indexed) + `service_id?` + `uploaded_by?` (staff) /
`uploaded_by_portal_user_id?` (portal — provenance). `file_name` (original),
`stored_key` (opaque key resolved by the storage backend — **bytes are not in the
DB**), `content_type`, `size_bytes`, `category`, `notes`. Phase-7 AI cache:
`ai_summary`, `ai_extracted` (JSON), `ai_analyzed_at`.

### `DocumentAccessLog` (`document_access_logs`)
`document_id` (indexed) + `user_id?`, `action` (`upload/view/download/delete`),
`ip_address`, `created_at`. **Intentionally not a cascade child of `Document`** —
there is no ORM relationship from `Document`, so deleting a document leaves its
access trail (including the `delete` event) intact.

### `Invoice` (`invoices`)
`invoice_number` (unique, `INV-YYYY-NNNN`, sequential per calendar year),
`client_id` (req) → `clients`, optional `service_id` / `subscription_id`.
`status` (`draft/sent/partially_paid/paid/void`), `currency` (AED), `issue_date`,
`due_date`, `subtotal`, `vat_rate` (default 5.0), `vat_amount`, `total`,
`amount_paid`, `notes`, Stripe id references, `created_by`. Children (cascade):
`line_items`, `payments`.

> **VAT/total are derived:** `subtotal = Σ(quantity × unit_price)`,
> `vat_amount = subtotal × vat_rate/100`, `total = subtotal + vat_amount`,
> recomputed from line items on create/edit (`recompute_totals`).

### `InvoiceLineItem` (`invoice_line_items`)
`invoice_id` → `invoices`, `description`, `quantity`, `unit_price`, `line_total`.

### `Payment` (`payments`)
`invoice_id` (indexed) → `invoices`, `amount`, `currency`, `method`
(`cash/bank_transfer/card/cheque/stripe/other`), `reference`, `paid_at`,
`stripe_payment_intent_id`, `recorded_by`. Recording a payment updates the
invoice's `amount_paid` and reconciles its status.

### `Subscription` (`subscriptions`)
`client_id` (indexed) → `clients`, optional `service_id`, `description`, `amount`
(net; VAT added at invoice time), `currency`, `interval`
(`monthly/quarterly/annual`), `status` (`active/paused/cancelled`),
`next_invoice_date`, `last_invoiced_date`, `stripe_subscription_id`. The
`generate-due` endpoint materialises an invoice and advances `next_invoice_date`
by the interval (clamping the day to the month length, avoiding drift).

### `ClientUser` (`client_users`)
Portal login. `client_id` (indexed) → `clients`, `email` (unique, indexed),
`password_hash`, `full_name`, `is_active`, `last_login_at`, `created_by` (staff
who invited). **Distinct from `users`** — see [SECURITY.md](SECURITY.md).

### `SecurityAuditLog` (`security_audit_logs`)
Append-only. `event_type` (indexed), `actor_user_id?`, `actor_label` (email/name
even with no FK), `target_type`, `target_id`, `detail`, `ip_address`, `created_at`
(indexed). No cascade — entries outlive the users they reference. Event types are
enumerated in `audit_service.EVENT_TYPES`.

### `User` (`users`)
`full_name` (login identifier), `email` (unique), `password_hash`, `role`
(default `accountant`), `team_leader_id?` (self-FK → senior_accountant),
`is_active`, `created_at`. Roles enumerated in `permissions.ALL_ROLES` — see
[RBAC.md](RBAC.md).

---

## Light migrations

`Base.metadata.create_all` creates **missing tables** but never `ALTER`s an
existing one. Columns added to a model after its table already exists are
backfilled by **`run_light_migrations()`** (`backend/database/db.py`), called on
every startup. It is **idempotent and SQLite-only** (Postgres deployments are
expected to use real migrations, e.g. Alembic).

Currently backfilled:

| Table | Column | Type | Added in |
|-------|--------|------|----------|
| `clients` | `stripe_customer_id` | `VARCHAR(80)` | Billing |
| `documents` | `uploaded_by_portal_user_id` | `INTEGER` | Portal |
| `documents` | `ai_summary` | `TEXT` | AI |
| `documents` | `ai_extracted` | `JSON` | AI |
| `documents` | `ai_analyzed_at` | `DATETIME` | AI |

> **Adding a new column to an existing model?** Add it to the model **and** to the
> `wanted` dict in `run_light_migrations()` so existing local DBs pick it up
> without a wipe. New tables need no entry — `create_all` handles them.

> **Note for verify scripts / tools that import the app without uvicorn:** a
> module-level `TestClient` does **not** fire the `startup` event, so such scripts
> must call `Base.metadata.create_all` (and `run_light_migrations`) themselves.

---

## Conventions

- **IDs:** integer autoincrement PKs.
- **Timestamps:** `created_at` / `updated_at` are `DateTime` (UTC, `datetime.utcnow`).
- **Domain dates** (due dates, issue dates, fiscal day/month) are stored as
  `YYYY-MM-DD` **strings** for simplicity/portability.
- **Soft delete:** clients archive, services/subscriptions cancel, users
  deactivate, portal users disable — only documents, invoices (draft/void) and
  tasks are hard-deleted.
- **Money:** floats in major units (AED), rounded to 2 dp on write. Stripe minor
  units (fils) are converted only at the Stripe boundary.
