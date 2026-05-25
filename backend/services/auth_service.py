from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.database.db import get_db
from backend.database.models import User
from backend.services.permissions import can
import os

SECRET_KEY = os.environ.get("SECRET_KEY", "sonic-crm-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Client-portal tokens (scope="portal") must never authenticate against
        # staff endpoints — they live in a separate security domain.
        if payload.get("scope") == "portal":
            raise credentials_exception
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id), User.is_active == True).first()
    if not user:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_admin_or_marketing_manager(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "marketing_manager"):
        raise HTTPException(status_code=403, detail="Admin or Marketing Manager access required")
    return current_user


def require_hr_access(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "hr_admin"):
        raise HTTPException(status_code=403, detail="HR access required")
    return current_user


# ─── Phase 3: per-role guards ──────────────────────────────────────────────────

def require_analyst(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "analyst"):
        raise HTTPException(status_code=403, detail="Marketing Analyst access required")
    return current_user


def require_social_media_specialist(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "social_media_specialist"):
        raise HTTPException(status_code=403, detail="Social Media Specialist access required")
    return current_user


def require_seo_specialist(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "seo_specialist"):
        raise HTTPException(status_code=403, detail="SEO Specialist access required")
    return current_user


# ─── Phase 3: generic permission-matrix guard ──────────────────────────────────

def require_permission(resource: str, action: str):
    """FastAPI dependency factory backed by the permission matrix.

    Usage:
        @router.post("", dependencies=[Depends(require_permission("clients", "create"))])
    or to also receive the user:
        current_user: User = Depends(require_permission("clients", "create"))
    """
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if not can(current_user.role, resource, action):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: cannot {action} {resource}",
            )
        return current_user
    return checker
