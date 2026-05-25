# Staff User Guide

This guide is for **internal staff** (accountants, seniors, admins, auditors,
payroll/tax specialists, HR). For the client-facing portal, see
[CLIENT_PORTAL_GUIDE.md](CLIENT_PORTAL_GUIDE.md). What you can see and do depends on
your role — see [RBAC.md](RBAC.md).

---

## Logging in

1. Go to the app URL and you'll land on **`/login`**.
2. Enter your **full name** (not email) and password.
3. You arrive at the **Landing** page (`/`) — a module selector. From here you reach
   CRM, Clients, Billing, Calendar, e-cards, Settings, and (if permitted)
   Partnerships, HR and the Audit Log.

> Too many wrong passwords temporarily locks the login for a few minutes (the lock
> auto-expires). If you're stuck, an admin can clear it (Settings → Security Audit
> Log → unlock) or it clears on the next backend restart.

Change your own password under **Settings**. Admins can reset anyone's password and
create/deactivate users from the **Users** page.

---

## Clients (`/clients`)

The client list shows every company you're allowed to see (admins/auditors: all;
seniors: your team's; accountants: your own). Each row shows status plus a count of
services and open tasks.

- **Search** by company name, contact, email, TRN, or trade-licence number; filter
  by status.
- **Add a client** (needs `clients:create`): fill the company profile. UAE fields
  matter for compliance — **TRN** (15-digit VAT number), **CT registration number**,
  **trade licence** (+ emirate), **legal form**, **fiscal year end** (month/day,
  defaults 31 Dec), and the **ESR** flag. If you don't set an assigned accountant,
  it defaults to you.
- **Open a client** (`/clients/:id`) for the full record with tabs:

### Client detail tabs
| Tab | What it shows |
|-----|---------------|
| **Services** | Engagements for this client — add/edit/cancel. |
| **Tasks** | Work items linked to this client. |
| **Documents** | Uploaded files, with download, (optional) AI analyze, and delete. |
| **Compliance** | The deterministic UAE tax checklist (see below). |

Other actions on the client page: **Portal Access** (manage the client's login
accounts — see the portal guide) and editing the profile.

> **Archiving:** deleting a client (admin only) sets its status to `archived` rather
> than destroying data. Its services/documents/invoices remain for the record.

---

## Services

A *service* is an engagement between the firm and a client. Add one from the
client's Services tab.

- **Type:** `bookkeeping, vat_filing, corporate_tax, payroll, audit, cfo,
  financial_statements, company_formation, tax_consultation`. The catalog suggests a
  default recurrence and a typical AED fee per type — adjust as needed.
- **Recurrence:** `one_time, monthly, quarterly, annual`.
- **Status:** `active, paused, completed, cancelled` (deleting cancels).
- **Fee:** amount + currency (AED default), used to pre-fill invoices.

> **Payroll specialists** only see/manage `payroll` services; **tax consultants**
> only `vat_filing` / `corporate_tax` / `tax_consultation`. Other roles see all
> types.

---

## Tasks (`/api/tasks`, surfaced on client/service pages)

Tasks track work. A task can be linked to a client and/or a service, or stand alone
(internal/admin work).

- Fields: title, description, due date, **priority** (`low/normal/high/urgent`),
  **status** (`todo/in_progress/blocked/done`), assignee.
- Moving a task to **done** stamps its completion time automatically; moving it back
  clears it.
- You see tasks assigned to you, created by you, or attached to a client you can see.
- Senior accountants and admins can delete tasks; others create/update.
- **Portal profile-change requests** from clients arrive as tasks assigned to the
  client's accountant (titled "Portal: profile change request from …").

---

## Documents

Per-client file storage with a full access audit trail.

- **Upload** (`documents:create`) from the client's Documents tab: pick a file,
  choose a **category** (`trade_license, vat_return, ct_return,
  financial_statement, bank_statement, invoice, receipt, contract, passport_eid,
  audit_report, payroll, other`), optionally link a service and add notes.
  Allowed types: PDF, images, Office docs, CSV, text. Max size is the configured cap
  (25 MB by default).
- **Download:** the app mints a short-lived secure link (valid ~5 minutes) — it
  opens in a new tab without re-authenticating.
- **AI Analyze** (only if AI is enabled, see below): summarises the document and
  extracts key fields, caching the result on the document.
- **Delete** (`documents:delete`): removes the file. The deletion itself is recorded
  in the access log, which **survives** the document.
- **Access log:** admins and senior accountants can view who uploaded/viewed/
  downloaded/deleted a document and when.

---

## Compliance checklist (Compliance tab)

Each client has a **deterministic** UAE compliance checklist, generated from their
profile and services — **no AI, no network**, always available. It covers:

- **VAT** — registered (if a TRN is on file) and the next quarterly return deadline
  (28th of the month after the tax period); or a registration recommendation
  (mandatory above AED 375,000 taxable supplies, voluntary above AED 187,500) when
  no TRN is set.
- **Corporate Tax (9%)** — registration status (via the CT number) and the return
  deadline (9 months after the financial year-end).
- **ESR** — notification (6 months) and report (12 months) reminders **if** the ESR
  flag is set (with a note that ESR was repealed for FYs ending after 31 Dec 2022 —
  verify applicability).
- **Financial statements** — when the client has an `audit` or
  `financial_statements` service.
- **Trade licence** — annual renewal reminder when a licence number is on file.

Items are tagged `ok / upcoming / action_needed / info` with due dates. Every
checklist carries a **disclaimer**: these are workflow reminders, *not* tax or legal
advice — always confirm the client's assigned tax periods with the FTA.

---

## Billing (`/billing`)

UAE VAT invoicing, payments, recurring retainers, and reports. Visibility follows
client scope; auditors, payroll and tax roles are **read-only** here.

### Invoices
- **Create** (`invoices:create`): pick a client, add line items
  (description / quantity / unit price). VAT (5% default) and totals are computed
  live. Invoices start as **draft**.
- **Edit** is allowed **only while draft**. Replacing line items recomputes totals.
- **Send** moves draft → sent and stamps the issue date. Default payment terms are
  30 days.
- **Void** is allowed only if no payment has been recorded.
- **Delete** is allowed only for draft or void invoices.
- **From a service:** generate a draft invoice straight from a service's fee.
- Invoice numbers are sequential per year: `INV-2026-0001`.

### Payments
On a *sent* invoice, **record a payment** (`cash, bank_transfer, card, cheque,
stripe, other`) with amount, reference and date. The invoice reconciles to
`partially_paid` or `paid` automatically; you can't overpay the balance.

If Stripe (test mode) is enabled, you can also create a card **PaymentIntent** and
later **Sync** to pull the result in — no webhook needed locally.

### Subscriptions (retainers)
Set up a recurring charge (`monthly/quarterly/annual`) with a net amount and a
`next_invoice_date`. Use **Generate due** to create invoices for everything due up
to today; each subscription's schedule then advances by its interval.

### Reports
The billing report shows total invoiced/collected/outstanding, VAT collected, and an
**AR aging** breakdown (current / 1–30 / 31–60 / 61–90 / 90+ days past due) — scoped
to the clients you can see.

---

## AI document analysis (optional)

If an Anthropic key is configured, an **✨ Analyze** button appears on supported
documents (PDF, images, text). It returns a short summary, a suggested category, and
extracted fields (e.g. for a trade licence: company name, licence number, emirate,
expiry), which are cached on the document. If AI isn't configured, the button is
hidden and the rest of the app is unaffected. AI output is assistive — **always
verify** before relying on it.

---

## CRM, leads & conversion (`/crm`)

The retained CRM handles inquiry-stage **leads** before they become clients:

- **Dashboard** (`/crm`): KPIs and recent activity.
- **Pipeline** (`/crm/kanban`): drag leads across stages.
- **Leads** (`/crm/leads`): list, search, add, bulk-import from Excel; open a lead
  for its activity log.
- **Convert** a qualified lead into a **Client** (`POST /api/leads/{id}/convert`) —
  this is the bridge into the accounting domain. The new client keeps a `lead_id`
  back-reference.

Auditor / payroll / tax roles have read-only leads access.

---

## Other modules

- **Calendar** (`/calendar`): company events (create/approve where permitted).
- **HR** (`/hr`, admin + hr_admin): employees and their documents, plus e-cards.
- **E-business cards** (`/ecards`): create a digital card; share its public link
  (`/card/:slug`) or QR code.
- **Partnerships** (`/partnerships`, admin only): B2B referral partners, WhatsApp/
  email outreach, templates, replies, commissions, and public referral applications.
- **Settings** (`/settings`): your profile/password; admins also reach **User
  Management** and the **Security Audit Log**.

---

## Tips

- If a button you'd expect is missing, your role probably lacks that permission —
  the UI hides actions you can't perform (the backend enforces it regardless).
- "Not found" on a record that should exist usually means it's outside your visible
  scope (the API returns `404` rather than revealing it).
- Sessions last 8 hours; you'll be returned to `/login` when the token expires.
