from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db
from backend.database.models import ReferralApplication

router = APIRouter(prefix="/referral", tags=["referral-public"])


class ReferralFormData(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None
    job: Optional[str] = None
    nationality: Optional[str] = None
    language: Optional[str] = 'en'
    agreed_to_terms: Optional[bool] = False


@router.post("/form/save")
def save_referral_form(payload: ReferralFormData, db: Session = Depends(get_db)):
    app = ReferralApplication(
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        job=payload.job,
        nationality=payload.nationality,
        language=payload.language or 'en',
        agreed_to_terms=payload.agreed_to_terms or False,
        status='interested',
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return {"application_id": app.id}
