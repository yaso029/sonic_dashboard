# Role-Based Access Control (RBAC)

Access control has **three layers** that compose:

1. **Permission matrix** — *may this role do this action on this resource type?*
   Source of truth: `backend/services/permissions.py`.
2. **Row scoping** — *which specific records can this user see/touch?* Implemented
   by `scope_query()` in `backend/api/clients.py` and reused by services, tasks,
   documents, invoices, subscriptions and billing.
3. **Service-type scoping** — for `payroll_specialist` and `tax_consultant`, an
   extra filter limiting which `service_type`s (and their parent clients) are
   visible.

The matrix is the single source of truth: it drives the backend guard
`require_permission`, the `GET /api/auth/me/permissions` endpoint, and the
frontend's permission-based button-hiding (`usePermissions` hook) — all from the
same data.

---

## Roles

| Role | Intent |
|------|--------|
| `admin` | Full access to everything. The seeded `Yaso` account. |
| `senior_accountant` | Manages own + team's clients; can assign and delete tasks; full billing/documents. |
| `accountant` | Day-to-day client/service/task work on **own** assigned clients. |
| `auditor` | **Firm-wide read-only.** May update tasks assigned to them (workflow). |
| `payroll_specialist` | Like accountant but scoped to **payroll** services only. |
| `tax_consultant` | Like accountant but scoped to **vat_filing / corporate_tax / tax_consultation** services. |
| `hr_admin` | HR + e-cards only; no accounting access. |

`ALL_ROLES` = the keys of the `PERMISSIONS` matrix (used to validate role
assignment in `POST/PUT /api/users`).

> **Migration note:** these roles replaced the original real-estate roles —
> `broker → accountant`, `team_leader → senior_accountant`; `admin` kept;
> `auditor`, `payroll_specialist`, `tax_consultant` added.

---

## Permission matrix

Resources: `clients, services, tasks, documents, invoices, leads, users, partners,
commissions, hr, calendar, ecards, whatsapp, email, notifications, settings`.
Actions: `read, create, update, delete`, plus `assign` (reassign owner) and
`convert` (lead → client). `✱` = all actions.

| Resource | admin | senior_accountant | accountant | auditor | payroll_specialist | tax_consultant | hr_admin |
|----------|:-----:|:-----------------:|:----------:|:-------:|:------------------:|:--------------:|:--------:|
| clients | ✱ | r c u **assign** | r c u | r | r | r | — |
| services | ✱ | r c u **assign** | r c u | r | r c u | r c u | — |
| tasks | ✱ | r c u **d** **assign** | r c u | r u | r c u | r c u | — |
| documents | ✱ | r c u d | r c | r | r c | r c | — |
| invoices | ✱ | r c u d | r c u | r | r | r | — |
| leads | ✱ | r c u assign **convert** | r c u **convert** | r | r | r | — |
| users | ✱ | — | — | — | — | — | — |
| partners | ✱ | r | — | r | — | — | — |
| commissions | ✱ | r | — | r | — | — | — |
| hr | ✱ | — | — | — | — | — | ✱ |
| calendar | ✱ | r c u | r c u | r | r c u | r c u | r c u |
| ecards | ✱ | r | r | r | r | r | ✱ |
| whatsapp | ✱ | r | — | r | — | — | — |
| email | ✱ | r | — | — | — | — | — |
| notifications | ✱ | r | r | r | r | r | r |
| settings | ✱ | r | r | r | r | r | r |

(Blank = no access. `subscriptions` and `billing` reuse the `invoices`
permission. `documents` access-log and a document with no client are further
restricted to admin/senior — see [API_REFERENCE.md](API_REFERENCE.md).)

---

## Service-type scoping

`SERVICE_TYPE_SCOPE` (in `permissions.py`) limits service-scoped roles:

| Role | Allowed `service_type`s |
|------|-------------------------|
| `payroll_specialist` | `payroll` |
| `tax_consultant` | `vat_filing`, `corporate_tax`, `tax_consultation` |
| *(all others)* | all types |

Enforced in two places:
- **Visibility** — in `services.list/get` and `clients.scope_query`, these roles
  only see services of their allowed types and the clients that have such a
  service.
- **Mutation** — `_enforce_type_scope()` in `api/services.py` blocks creating or
  editing a service whose type is outside the role's set (`403`), checking both
  the existing type and the requested target type.

---

## Row scoping (`scope_query`)

`backend/api/clients.py::scope_query(query, user, db)` is the canonical client
visibility filter, reused everywhere client-linked data is listed:

| Role | Sees clients… |
|------|---------------|
| `admin`, `auditor` | all (firm-wide) |
| `senior_accountant` | assigned to self **or** to any team member (`team_leader_id == self.id`) |
| `payroll_specialist`, `tax_consultant` | any client that has a service of the role's allowed types |
| everyone else (`accountant`, …) | assigned to self (`assigned_accountant_id == self.id`) |

Downstream modules derive their scope from this:
- **services / documents / invoices / subscriptions / billing** — restrict to the
  set of client IDs `scope_query` returns.
- **tasks** — a user sees tasks assigned to them, created by them, **or** linked
  to a client they can see (admin sees all).

Because out-of-scope records return **`404`** (not `403`), the API never reveals
the existence of records a user shouldn't see.

---

## How to enforce permissions in code

### Guard an endpoint with the matrix
```python
from backend.services.auth_service import require_permission

@router.post("")
def create_client(
    req: ClientCreate,
    current_user: User = Depends(require_permission("clients", "create")),
    db: Session = Depends(get_db),
):
    ...
```
`require_permission(resource, action)` returns a dependency that calls
`can(role, resource, action)` and raises `403` if denied. Use it as
`Depends(...)` to also receive the `current_user`.

### Role guards (coarser)
`require_admin`, `require_admin_or_senior_accountant`, `require_hr_access`,
`require_auditor`, `require_payroll_specialist`, `require_tax_consultant` —
convenience dependencies in `auth_service.py` for endpoints that gate on role
rather than resource/action.

### Scope the rows
```python
from backend.api.clients import scope_query as scope_clients

visible_ids = [r.id for r in scope_clients(db.query(Client.id), current_user, db).all()]
query = db.query(Service).filter(Service.client_id.in_(visible_ids))
```

### Check on the frontend
The SPA fetches `GET /api/auth/me/permissions` → `{ role, permissions:
{resource:[actions]}, service_type_scope }` and the `usePermissions` hook exposes
`can(resource, action)` to hide buttons the user can't use. **This is UX only** —
the backend matrix is authoritative.

---

## Changing permissions

Edit **only** `backend/services/permissions.py`:
- Add/remove an action in `PERMISSIONS[role][resource]`.
- Add a new role by adding a top-level key (and its resource map). It becomes a
  valid value for `User.role` automatically (via `ALL_ROLES`).
- Add a new resource by adding it to `RESOURCES` and to each role's map.
- Adjust service scoping in `SERVICE_TYPE_SCOPE`.

No endpoint code changes are needed for permission tweaks — guards read the matrix
live. After changing it, re-run `verify_phase3` to confirm the matrix still
behaves as expected.
