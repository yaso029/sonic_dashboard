# Client Portal Guide

The **client portal** is a self-service area where a firm's clients can see their
invoices (and pay them), exchange documents, track the status of their services and
tasks, and request profile changes. It lives at **`/portal`** in the frontend and is
served by **`/api/portal/*`** on the backend.

This guide has two parts:
- **For staff** — how to give a client access and manage their accounts.
- **For clients** — how to use the portal.

> **Security model in one line:** portal accounts are a *separate login domain* from
> staff. A portal session can only ever see **its own client's** data and can never
> reach staff endpoints. Details in [SECURITY.md](SECURITY.md).

---

## Part 1 — For staff: managing portal access

Portal accounts are `ClientUser` records tied to a single client. They are **not**
staff users and have no role in the RBAC matrix.

### Who can manage portal accounts
Anyone with **`clients:update`** on a client they can see — i.e. admins, senior
accountants (their team's clients), and accountants (their own clients). Auditors,
payroll and tax specialists cannot (read-only on clients).

### Creating an account
1. Open the client (`/clients/:id`) and click **Portal Access**.
2. In the dialog, add an account: **email**, a **password** (minimum 6 characters),
   and an optional contact name.
3. Share the portal URL and credentials with the client through a secure channel.

(API: `POST /api/clients/{client_id}/portal-users`.)

### Managing accounts
From the same dialog you can:
- **Reset a password** (min 6 chars).
- **Rename** the contact.
- **Enable / disable** an account (`is_active`). Disabling immediately blocks login
  but preserves the record and its history.

(API: `PUT /api/portal-users/{id}`, `DELETE /api/portal-users/{id}` to disable.)

Every create / update / disable is written to the **security audit log**
(`portal_user_created`, `portal_user_updated`, `portal_user_disabled`).

### What a client can and can't do
| Can | Can't |
|-----|-------|
| See **sent** (non-draft) invoices and pay them (if Stripe enabled) | See draft/void invoices |
| List & download the client's documents; upload new ones | See documents of any other client |
| See service statuses and open tasks (title/status/due only) | See internal task descriptions or notes |
| View the company profile; **request** a change | Edit the profile directly |

> **Current limitation:** the portal exposes **all** of a client's documents — there
> is no per-document "internal only" flag yet. Don't attach staff-only working papers
> to a client that has active portal accounts. (Tracked as a known follow-up.)

### Document provenance
When a client uploads a file, the document is tagged `[Client upload]`, `uploaded_by`
is null, and `uploaded_by_portal_user_id` records which portal account did it — so
staff can always tell client uploads from staff uploads.

### Profile change requests
Clients can't edit their own company record. A change request creates a **task** for
the client's assigned accountant (titled "Portal: profile change request from
<email>") containing the client's message. Review it and update the record yourself.

---

## Part 2 — For clients: using the portal

### Signing in
1. Go to the portal URL your accountant gave you (ends in **`/portal`**).
2. Enter your **email** and **password**.
3. Change your password from the profile/settings area after first login (minimum 6
   characters).

Sessions last 12 hours. Repeated wrong passwords temporarily lock sign-in for a few
minutes.

### What you'll see
- **Dashboard** — an overview of your account.
- **Invoices** — your issued invoices with amounts, due dates and status. Open one
  for the line-item detail. If online card payment is enabled, you can pay the
  outstanding balance securely.
- **Documents** — files your accountant has shared, plus anything you've uploaded.
  Download any document, or **upload** new ones (PDF, images, Office files, CSV,
  text; up to the size limit) and tag them with a category.
- **Services** — the services your firm provides you and their status, plus any open
  tasks that involve you (titles and due dates only).
- **Profile** — your company details on file (TRN, CT number, trade licence, fiscal
  year, etc.). To correct anything, use **Request a change** — your accountant
  reviews and applies it.

### Paying an invoice (when enabled)
Open a sent invoice and choose to pay. The portal creates a secure payment for the
outstanding balance. Payments are reconciled against your invoice automatically.
(If online payment isn't enabled for the firm, pay by the method on the invoice and
your accountant will record it.)

---

## Endpoint summary

Client-facing (`/api/portal/*`, portal token required except login):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/portal/auth/login` | Sign in (email + password) |
| GET | `/api/portal/me` | Current account + company |
| POST | `/api/portal/auth/change-password` | Change own password |
| GET | `/api/portal/billing/config` | Is online payment available? |
| GET | `/api/portal/invoices` | Own non-draft invoices |
| GET | `/api/portal/invoices/{id}` | Invoice detail |
| POST | `/api/portal/invoices/{id}/payment-intent` | Start a card payment |
| GET | `/api/portal/documents` | Own documents |
| GET | `/api/portal/documents/{id}/signed-url` | Download link |
| POST | `/api/portal/documents` | Upload a document |
| GET | `/api/portal/services` | Service statuses + open tasks |
| GET | `/api/portal/profile` | Company profile (read-only) |
| POST | `/api/portal/profile/change-request` | Request a profile change |

Staff-facing portal-account management:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/clients/{client_id}/portal-users` | List a client's accounts |
| POST | `/api/clients/{client_id}/portal-users` | Create an account |
| PUT | `/api/portal-users/{id}` | Update name / password / active |
| DELETE | `/api/portal-users/{id}` | Disable an account |

See [API_REFERENCE.md](API_REFERENCE.md) for full request/response details.
