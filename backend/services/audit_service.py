"""Phase 9 — security audit logging.

record() is deliberately defensive: it opens its own short-lived session and
swallows any error, so a logging failure can NEVER block the action being
audited (especially login). Append-only; entries outlive referenced users.
"""
from typing import Optional

from backend.database.db import SessionLocal
from backend.database.models import SecurityAuditLog


def client_ip(request) -> Optional[str]:
    try:
        return request.client.host if request and request.client else None
    except Exception:
        return None


def record(
    event_type: str,
    *,
    actor_user_id: Optional[int] = None,
    actor_label: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    detail: Optional[str] = None,
    ip_address: Optional[str] = None,
):
    """Write one audit entry on its own session. Errors are swallowed."""
    db = SessionLocal()
    try:
        db.add(SecurityAuditLog(
            event_type=event_type,
            actor_user_id=actor_user_id,
            actor_label=(actor_label or "")[:200] or None,
            target_type=target_type,
            target_id=target_id,
            detail=(detail or "")[:500] or None,
            ip_address=ip_address,
        ))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


EVENT_TYPES = [
    "login_success", "login_failed", "login_locked", "logout",
    "user_created", "user_updated", "user_deactivated", "password_reset",
    "portal_user_created", "portal_user_updated", "portal_user_disabled",
    "portal_login_success", "portal_login_failed", "account_unlocked",
]
