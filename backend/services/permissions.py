"""Centralized permission matrix for Phase 3 RBAC.

Single source of truth for what each role can do on each resource. Used by:
- FastAPI dependency `require_permission(resource, action)` (auth_service.py)
- `/api/me/permissions` endpoint (api/auth.py)
- Query scoping helpers in api/clients.py, api/services.py, api/tasks.py

Resources are short identifiers ("clients", "leads", "users", etc.). Actions
are typically "read", "create", "update", "delete", with "assign" for routes
that reassign owners.

Service-scoped roles (social_media_specialist, seo_specialist) additionally only
see services of certain types, controlled by SERVICE_TYPE_SCOPE.
"""
from typing import Optional, Set

# ─── Resources & actions ──────────────────────────────────────────────────────

RESOURCES = (
    "clients", "services", "tasks", "documents", "invoices", "leads", "users",
    "partners", "commissions", "hr", "calendar", "ecards",
    "whatsapp", "email", "notifications", "settings",
    "content", "analytics", "expenses",
)

# ─── Permission matrix ────────────────────────────────────────────────────────
# matrix[role][resource] = set of actions (or "*" string for all)

_ALL = "*"  # shorthand for "all actions on this resource"

PERMISSIONS: dict[str, dict[str, object]] = {
    "admin": {r: _ALL for r in RESOURCES},

    "marketing_manager": {
        "clients":      {"read", "create", "update", "assign"},
        "services":     {"read", "create", "update", "assign"},
        "tasks":        {"read", "create", "update", "delete", "assign"},
        "documents":    {"read", "create", "update", "delete"},
        "invoices":     {"read", "create", "update", "delete"},
        "leads":        {"read", "create", "update", "assign", "convert"},
        "partners":     {"read"},
        "commissions":  {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "whatsapp":     {"read"},
        "email":        {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "marketing_specialist": {
        "clients":      {"read", "create", "update"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read", "create", "update"},
        "leads":        {"read", "create", "update", "convert"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "analyst": {
        # Read-only across the firm. May update tasks they're assigned (workflow).
        "clients":      {"read"},
        "services":     {"read"},
        "tasks":        {"read", "update"},
        "documents":    {"read"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "partners":     {"read"},
        "commissions":  {"read"},
        "calendar":     {"read"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "social_media_specialist": {
        # Same shape as marketing_specialist, but service visibility filtered to
        # "social_media_management" via SERVICE_TYPE_SCOPE below.
        "clients":      {"read"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "seo_specialist": {
        # Service visibility filtered to seo / paid_advertising / marketing_consultation
        "clients":      {"read"},
        "services":     {"read", "create", "update"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    # ── Production / creative roles ─────────────────────────────────────────────
    # Team members who deliver work: they view the firm's data (read), manage their
    # own tasks, and upload deliverables. They also use Team Tasks + Video Studio,
    # which are gated outside this matrix (any authenticated user).
    "wordpress_developer": {
        "clients":      {"read"},
        "services":     {"read"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "graphic_designer": {
        "clients":      {"read"},
        "services":     {"read"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "video_editor": {
        "clients":      {"read"},
        "services":     {"read"},
        "tasks":        {"read", "create", "update"},
        "documents":    {"read", "create"},
        "invoices":     {"read"},
        "leads":        {"read"},
        "calendar":     {"read", "create", "update"},
        "ecards":       {"read"},
        "notifications": {"read"},
        "settings":     {"read"},
    },

    "hr_admin": {
        "hr":           _ALL,
        "ecards":       _ALL,
        "calendar":     {"read", "create", "update"},
        "notifications": {"read"},
        "settings":     {"read"},
    },
}

# Baseline access to the newer marketing modules for every non-admin role so they
# show up by default (admins already get everything via _ALL). Admins can still
# narrow any individual user via the per-user permission override.
for _role, _perms in PERMISSIONS.items():
    if _role == "admin":
        continue
    _perms.setdefault("content", {"read", "create", "update", "delete"})
    _perms.setdefault("analytics", {"read", "create", "update", "delete"})

# Company expenses are sensitive financials: default to managers only (admins get
# everything via _ALL). Grant to any other user individually via their override.
PERMISSIONS["marketing_manager"].setdefault("expenses", {"read", "create", "update", "delete"})

# Roles that only see services of certain types (and their parent clients).
# None or empty means "all service types".
SERVICE_TYPE_SCOPE: dict[str, Optional[list[str]]] = {
    "social_media_specialist": ["social_media_management"],
    "seo_specialist":          ["seo", "paid_advertising", "marketing_consultation"],
}


# ─── API ──────────────────────────────────────────────────────────────────────

def can(role: str, resource: str, action: str) -> bool:
    """Return True if the role is permitted to perform `action` on `resource`."""
    if not role:
        return False
    role_perms = PERMISSIONS.get(role, {})
    actions = role_perms.get(resource)
    if actions is None:
        return False
    if actions == _ALL:
        return True
    return action in actions


def permissions_for(role: str) -> dict[str, list[str]]:
    """Flat permission map for the frontend: { resource: [actions] }.
    Expands the "*" shorthand into the canonical action set."""
    canonical_actions = ["read", "create", "update", "delete", "assign", "convert"]
    out: dict[str, list[str]] = {}
    for resource, actions in PERMISSIONS.get(role, {}).items():
        if actions == _ALL:
            out[resource] = list(canonical_actions)
        else:
            out[resource] = sorted(actions)
    return out


def service_type_scope(role: str) -> Optional[list[str]]:
    """Return the list of service_types this role can see, or None for all."""
    return SERVICE_TYPE_SCOPE.get(role)


# ─── Per-user permission overrides ─────────────────────────────────────────────
# Modules that are open to every role-based user (gated by route, not the matrix).
# A user with a CUSTOM override only gets these if explicitly granted in it.
ALWAYS_ON_MODULES = ("video_studio", "team_tasks")


def effective_permissions(user) -> dict:
    """The permission map actually in force for `user`:
    - admins: always the full matrix (never restricted),
    - users with a custom `permissions` override: exactly that map,
    - everyone else: their role's matrix permissions.
    Role-based users implicitly keep the always-on modules so behaviour is
    unchanged; a custom override must list them explicitly to grant access.
    """
    if getattr(user, "role", None) == "admin":
        perms = permissions_for("admin")
        for m in ALWAYS_ON_MODULES:
            perms.setdefault(m, ["read"])
        return perms
    custom = getattr(user, "permissions", None)
    if custom:
        return {k: sorted(set(v)) for k, v in custom.items() if v}
    perms = permissions_for(getattr(user, "role", "") or "")
    for m in ALWAYS_ON_MODULES:
        perms.setdefault(m, ["read"])
    return perms


def can_user(user, resource: str, action: str) -> bool:
    """Override-aware permission check used by API guards. Admins always pass."""
    if not user:
        return False
    if getattr(user, "role", None) == "admin":
        return True
    actions = effective_permissions(user).get(resource)
    return bool(actions) and action in actions


ALL_ROLES = list(PERMISSIONS.keys())
