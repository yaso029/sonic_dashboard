from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db, Base
from backend.database.models import User
from backend.services.auth_service import get_current_user, require_admin, hash_password
from backend.services.permissions import ALL_ROLES
from backend.services import audit_service
import re

PRIMARY_ADMIN_EMAIL = "yaso@sonic.com"  # seeded admin — never deletable

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    full_name: str
    email: str  # required — used to email the employee their assigned tasks
    password: str
    role: str
    team_leader_id: Optional[int] = None
    permissions: Optional[dict] = None  # custom module access override (None => role default)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Resources a custom override may reference (matrix resources + the route-gated
# modules) and the actions allowed per resource.
from backend.services.permissions import RESOURCES, ALWAYS_ON_MODULES
_ALLOWED_PERM_KEYS = set(RESOURCES) | set(ALWAYS_ON_MODULES)
_ALLOWED_ACTIONS = {"read", "create", "update", "delete", "assign", "convert"}


def clean_permissions(perms):
    """Validate/sanitise a permission override: keep only known resources and
    actions, drop empties. Returns a clean dict, or None if nothing usable."""
    if not isinstance(perms, dict):
        return None
    out = {}
    for resource, actions in perms.items():
        if resource not in _ALLOWED_PERM_KEYS or not isinstance(actions, (list, tuple)):
            continue
        kept = sorted({a for a in actions if a in _ALLOWED_ACTIONS})
        if kept:
            out[resource] = kept
    return out or None


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    team_leader_id: Optional[int] = None
    is_active: Optional[bool] = None
    permissions: Optional[dict] = None  # send {} to clear (revert to role default)


class UpdatePasswordRequest(BaseModel):
    password: str


def user_to_dict(u: User):
    return {
        "id": u.id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role,
        "team_leader_id": u.team_leader_id,
        "team_leader_name": u.team_leader.full_name if u.team_leader else None,
        "is_active": u.is_active,
        "permissions": u.permissions or None,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def generate_email(name: str) -> str:
    slug = re.sub(r'[^a-z0-9]', '', name.lower().replace(' ', ''))
    return f"{slug}@sonic.crm"


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_to_dict(current_user)


@router.patch("/me/password")
def change_own_password(req: UpdatePasswordRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password too short")
    current_user.password_hash = hash_password(req.password)
    db.commit()
    return {"ok": True}


@router.get("")
def list_users(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [user_to_dict(u) for u in users]


@router.get("/team")
def get_my_team(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "admin":
        members = db.query(User).filter(
            User.role.in_(["marketing_specialist", "marketing_manager"]), User.is_active == True
        ).order_by(User.role, User.full_name).all()
    elif current_user.role == "marketing_manager":
        members = db.query(User).filter(
            User.team_leader_id == current_user.id, User.is_active == True
        ).all()
        members = [current_user] + members
    else:
        members = []
    return [user_to_dict(b) for b in members]


@router.post("")
def create_user(req: CreateUserRequest, request: Request, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if req.role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(ALL_ROLES)}")
    email = (req.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    user = User(
        full_name=req.full_name,
        email=email,
        password_hash=hash_password(req.password),
        role=req.role,
        team_leader_id=req.team_leader_id,
        permissions=clean_permissions(req.permissions),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit_service.record("user_created", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="user", target_id=user.id, detail=f"{user.full_name} ({user.role})",
                         ip_address=audit_service.client_ip(request))
    return user_to_dict(user)


@router.put("/{user_id}")
def update_user(user_id: int, req: UpdateUserRequest, request: Request, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.full_name is not None:
        user.full_name = req.full_name
    if req.email is not None:
        user.email = req.email
    if req.role is not None:
        if req.role not in ALL_ROLES:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(ALL_ROLES)}")
        user.role = req.role
    if req.team_leader_id is not None:
        user.team_leader_id = req.team_leader_id
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.permissions is not None:
        user.permissions = clean_permissions(req.permissions)  # {} clears -> None (role default)
    db.commit()
    db.refresh(user)
    audit_service.record("user_updated", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="user", target_id=user.id, detail=f"Updated {user.full_name}",
                         ip_address=audit_service.client_ip(request))
    return user_to_dict(user)


@router.patch("/{user_id}/password")
def reset_password(user_id: int, req: UpdatePasswordRequest, request: Request, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(req.password)
    db.commit()
    audit_service.record("password_reset", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="user", target_id=user.id, detail=f"Admin reset password for {user.full_name}",
                         ip_address=audit_service.client_ip(request))
    return {"ok": True}


@router.delete("/{user_id}")
def deactivate_user(user_id: int, request: Request, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    db.commit()
    audit_service.record("user_deactivated", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="user", target_id=user.id, detail=f"Deactivated {user.full_name}",
                         ip_address=audit_service.client_ip(request))
    return {"ok": True}


def _purge_user_references(db: Session, user_id: int):
    """Clean every reference to a user before a hard delete.

    Discovers all FK columns pointing at users.id via SQLAlchemy metadata, then:
    - nullable FK  → set NULL (keeps the leads/clients/tasks but un-assigns them)
    - NOT NULL FK  → delete the row (e.g. the user's own notifications / push subs)
    Generic by design, so future tables referencing users are handled automatically.
    """
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            for fk in col.foreign_keys:
                ref = fk.column
                if ref.table.name == "users" and ref.name == "id":
                    if col.nullable:
                        db.execute(
                            text(f'UPDATE "{table.name}" SET "{col.name}" = NULL WHERE "{col.name}" = :uid'),
                            {"uid": user_id},
                        )
                    else:
                        db.execute(
                            text(f'DELETE FROM "{table.name}" WHERE "{col.name}" = :uid'),
                            {"uid": user_id},
                        )


@router.delete("/{user_id}/permanent")
def delete_user_permanently(user_id: int, request: Request, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Permanently remove an employee. Their assigned leads/clients/tasks are kept
    but un-assigned; their personal notifications/push subscriptions are removed."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if (user.email or "").lower() == PRIMARY_ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="The primary admin account cannot be deleted")
    if user.role == "admin" and db.query(User).filter(User.role == "admin", User.id != user.id).count() == 0:
        raise HTTPException(status_code=400, detail="Cannot delete the only admin account")

    label = f"{user.full_name} ({user.email})"
    _purge_user_references(db, user_id)
    db.delete(user)
    db.commit()
    audit_service.record("user_deleted", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         target_type="user", target_id=user_id, detail=f"Permanently deleted {label}",
                         ip_address=audit_service.client_ip(request))
    return {"ok": True}
