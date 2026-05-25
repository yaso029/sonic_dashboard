from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db
from backend.database.models import ReferralApplication, User
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/referral-applications", tags=["referral-applications"])

NATIONALITY_LABELS = {
    'AE': 'UAE', 'SA': 'Saudi Arabia', 'KW': 'Kuwait', 'QA': 'Qatar', 'BH': 'Bahrain',
    'OM': 'Oman', 'EG': 'Egypt', 'LB': 'Lebanon', 'JO': 'Jordan', 'SY': 'Syria',
    'IQ': 'Iraq', 'PS': 'Palestine', 'IN': 'India', 'PK': 'Pakistan', 'BD': 'Bangladesh',
    'PH': 'Philippines', 'CN': 'China', 'GB': 'United Kingdom', 'FR': 'France',
    'DE': 'Germany', 'RU': 'Russia', 'UA': 'Ukraine', 'US': 'United States',
    'CA': 'Canada', 'AU': 'Australia', 'NG': 'Nigeria', 'TR': 'Turkey', 'IR': 'Iran',
    'KZ': 'Kazakhstan', 'UZ': 'Uzbekistan', 'OTHER': 'Other',
}


def app_to_dict(a: ReferralApplication) -> dict:
    return {
        "id": a.id,
        "full_name": a.full_name,
        "phone": a.phone,
        "email": a.email,
        "job": a.job,
        "nationality": a.nationality,
        "nationality_label": NATIONALITY_LABELS.get(a.nationality or '', a.nationality or ''),
        "language": a.language,
        "agreed_to_terms": a.agreed_to_terms,
        "status": a.status,
        "assigned_to": a.assigned_to,
        "assigned_to_name": a.assigned_user.full_name if a.assigned_user else None,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("")
def list_applications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == 'admin':
        apps = db.query(ReferralApplication).order_by(ReferralApplication.created_at.desc()).all()
    else:
        apps = db.query(ReferralApplication).filter(
            ReferralApplication.assigned_to == current_user.id
        ).order_by(ReferralApplication.created_at.desc()).all()
    return [app_to_dict(a) for a in apps]


class UpdatePayload(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


@router.patch("/{app_id}")
def update_application(
    app_id: int,
    payload: UpdatePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app = db.query(ReferralApplication).filter(ReferralApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role != 'admin' and app.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if payload.status is not None:
        app.status = payload.status
    if payload.notes is not None:
        app.notes = payload.notes
    if payload.assigned_to is not None and current_user.role == 'admin':
        app.assigned_to = payload.assigned_to
    db.commit()
    db.refresh(app)
    return app_to_dict(app)
