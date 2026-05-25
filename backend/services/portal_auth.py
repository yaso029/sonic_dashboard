"""Phase 6 — client portal authentication (separate security domain).

Portal accounts (ClientUser) are distinct from internal staff users. Their JWTs
carry scope="portal" and are only accepted by /api/portal/* endpoints. The staff
dependency (auth_service.get_current_user) rejects scope="portal" tokens, so a
portal token can never reach a staff endpoint, and vice-versa.
"""
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import ClientUser
from backend.services.auth_service import SECRET_KEY, ALGORITHM

PORTAL_SCOPE = "portal"
PORTAL_TOKEN_EXPIRE_HOURS = 12

# tokenUrl points at the portal login so the OpenAPI docs wire up correctly.
portal_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/portal/auth/login", auto_error=True)


def create_portal_token(client_user_id: int, client_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=PORTAL_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(client_user_id),
        "client_id": client_id,
        "scope": PORTAL_SCOPE,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_client_user(
    token: str = Depends(portal_oauth2),
    db: Session = Depends(get_db),
) -> ClientUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid portal credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # A staff token (no/!=portal scope) must NOT be usable on portal endpoints.
        if payload.get("scope") != PORTAL_SCOPE:
            raise credentials_exception
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    cu = db.query(ClientUser).filter(
        ClientUser.id == int(user_id), ClientUser.is_active == True
    ).first()
    if not cu:
        raise credentials_exception
    return cu
