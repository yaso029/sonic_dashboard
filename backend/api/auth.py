from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.database.db import get_db
from backend.database.models import User
from backend.services.auth_service import (
    verify_password, create_access_token, get_current_user, hash_password
)
from backend.services.permissions import permissions_for, service_type_scope, effective_permissions
from backend.services import audit_service, rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ResetPasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = audit_service.client_ip(request)
    key = rate_limit.make_key("staff", req.username, ip)

    locked = rate_limit.check_locked(key)
    if locked:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {locked} seconds.",
        )

    user = db.query(User).filter(
        User.full_name.ilike(req.username), User.is_active == True
    ).first()
    if not user or not verify_password(req.password, user.password_hash):
        lock_secs = rate_limit.record_failure(key)
        audit_service.record(
            "login_failed", actor_label=req.username, ip_address=ip,
            detail="Invalid username or password",
        )
        if lock_secs:
            audit_service.record(
                "login_locked", actor_label=req.username, ip_address=ip,
                detail=f"Locked for {lock_secs}s after repeated failures",
            )
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in {lock_secs} seconds.",
            )
        raise HTTPException(status_code=401, detail="Invalid username or password")

    rate_limit.record_success(key)
    audit_service.record(
        "login_success", actor_user_id=user.id, actor_label=user.full_name, ip_address=ip,
    )
    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        }
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
        "team_leader_id": current_user.team_leader_id,
        "permissions": effective_permissions(current_user),
        "service_type_scope": service_type_scope(current_user.role),
    }


@router.get("/me/permissions")
def my_permissions(current_user: User = Depends(get_current_user)):
    """Flat permission map for the frontend: { resource: [actions] }.
    Override-aware (custom per-user permissions win over the role default).
    Drives permission-based UI hiding (see usePermissions hook)."""
    return {
        "role": current_user.role,
        "permissions": effective_permissions(current_user),
        "service_type_scope": service_type_scope(current_user.role),
        "custom": bool(current_user.permissions),
    }


@router.post("/reset-password")
def reset_password(
    req: ResetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    audit_service.record("password_reset", actor_user_id=current_user.id,
                         actor_label=current_user.full_name, target_type="user",
                         target_id=current_user.id, detail="Self-service password change")
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, current_user: User = Depends(get_current_user)):
    audit_service.record("logout", actor_user_id=current_user.id, actor_label=current_user.full_name,
                         ip_address=audit_service.client_ip(request))
    return {"ok": True}
