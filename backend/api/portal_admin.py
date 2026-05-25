"""Staff-facing management of client portal accounts (ClientUser).

Gated by `clients:update` + client visibility, so a staff member can only manage
portal logins for clients they can already see/edit.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.database.db import get_db
from backend.database.models import ClientUser, Client, User
from backend.services.auth_service import get_current_user, require_permission, hash_password
from backend.services import audit_service
from backend.api.clients import scope_query as scope_clients

router = APIRouter(tags=["portal-admin"])


class PortalUserCreate(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None


class PortalUserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None


def portal_user_to_dict(cu: ClientUser) -> dict:
    return {
        "id": cu.id,
        "client_id": cu.client_id,
        "email": cu.email,
        "full_name": cu.full_name,
        "is_active": cu.is_active,
        "last_login_at": cu.last_login_at.isoformat() if cu.last_login_at else None,
        "created_at": cu.created_at.isoformat() if cu.created_at else None,
    }


def _require_visible_client(db: Session, current_user: User, client_id: int) -> Client:
    c = scope_clients(db.query(Client), current_user, db).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.get("/api/clients/{client_id}/portal-users")
def list_portal_users(
    client_id: int,
    current_user: User = Depends(require_permission("clients", "update")),
    db: Session = Depends(get_db),
):
    _require_visible_client(db, current_user, client_id)
    rows = db.query(ClientUser).filter(ClientUser.client_id == client_id).order_by(ClientUser.created_at.desc()).all()
    return [portal_user_to_dict(c) for c in rows]


@router.post("/api/clients/{client_id}/portal-users")
def create_portal_user(
    client_id: int,
    req: PortalUserCreate,
    request: Request,
    current_user: User = Depends(require_permission("clients", "update")),
    db: Session = Depends(get_db),
):
    _require_visible_client(db, current_user, client_id)
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if db.query(ClientUser).filter(ClientUser.email == email).first():
        raise HTTPException(status_code=409, detail="A portal account with this email already exists")
    cu = ClientUser(
        client_id=client_id,
        email=email,
        password_hash=hash_password(req.password),
        full_name=req.full_name,
        created_by=current_user.id,
    )
    db.add(cu)
    db.commit()
    db.refresh(cu)
    audit_service.record("portal_user_created", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="portal_user", target_id=cu.id, detail=f"{email} for client #{client_id}",
                         ip_address=audit_service.client_ip(request))
    return portal_user_to_dict(cu)


def _get_visible_portal_user(db: Session, current_user: User, portal_user_id: int) -> ClientUser:
    cu = db.query(ClientUser).filter(ClientUser.id == portal_user_id).first()
    if not cu:
        raise HTTPException(status_code=404, detail="Portal user not found")
    _require_visible_client(db, current_user, cu.client_id)
    return cu


@router.put("/api/portal-users/{portal_user_id}")
def update_portal_user(
    portal_user_id: int,
    req: PortalUserUpdate,
    request: Request,
    current_user: User = Depends(require_permission("clients", "update")),
    db: Session = Depends(get_db),
):
    cu = _get_visible_portal_user(db, current_user, portal_user_id)
    changes = []
    if req.full_name is not None:
        cu.full_name = req.full_name; changes.append("name")
    if req.is_active is not None:
        cu.is_active = req.is_active; changes.append("enabled" if req.is_active else "disabled")
    if req.password is not None:
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        cu.password_hash = hash_password(req.password); changes.append("password")
    db.commit()
    db.refresh(cu)
    event = "portal_user_disabled" if req.is_active is False else "portal_user_updated"
    audit_service.record(event, actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="portal_user", target_id=cu.id,
                         detail=f"{cu.email}: {', '.join(changes) or 'no change'}",
                         ip_address=audit_service.client_ip(request))
    return portal_user_to_dict(cu)


@router.delete("/api/portal-users/{portal_user_id}")
def deactivate_portal_user(
    portal_user_id: int,
    request: Request,
    current_user: User = Depends(require_permission("clients", "update")),
    db: Session = Depends(get_db),
):
    cu = _get_visible_portal_user(db, current_user, portal_user_id)
    cu.is_active = False
    db.commit()
    audit_service.record("portal_user_disabled", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="portal_user", target_id=cu.id, detail=f"Disabled {cu.email}",
                         ip_address=audit_service.client_ip(request))
    return {"ok": True}
