"""Phase 9 — admin security endpoints: audit-log viewer + lockout reset."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import SecurityAuditLog, User
from backend.services.auth_service import require_admin
from backend.services import audit_service, rate_limit

router = APIRouter(prefix="/api/security", tags=["security"])


@router.get("/audit-log/meta")
def audit_meta(current_user: User = Depends(require_admin)):
    return {
        "event_types": audit_service.EVENT_TYPES,
        "lockout": {
            "max_attempts": rate_limit.LOGIN_MAX_ATTEMPTS,
            "lockout_seconds": rate_limit.LOCKOUT_SECONDS,
            "window_seconds": rate_limit.WINDOW_SECONDS,
        },
    }


@router.get("/audit-log")
def audit_log(
    event_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(SecurityAuditLog)
    if event_type:
        q = q.filter(SecurityAuditLog.event_type == event_type)
    total = q.count()
    limit = max(1, min(limit, 500))
    rows = q.order_by(SecurityAuditLog.created_at.desc()).offset(max(0, offset)).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "actor_user_id": r.actor_user_id,
                "actor_label": r.actor_label,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "detail": r.detail,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


class UnlockRequest(BaseModel):
    identifier: str = ""  # substring match against lockout keys; empty = clear all


@router.post("/unlock")
def unlock(
    req: UnlockRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clear login lockouts (admin escape hatch). The limiter is in-memory, so a
    backend restart also clears everything."""
    cleared = rate_limit.unlock(req.identifier)
    audit_service.record("account_unlocked", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         detail=f"Cleared {cleared} lockout key(s) matching '{req.identifier or '*'}'",
                         ip_address=audit_service.client_ip(request))
    return {"ok": True, "cleared": cleared}
