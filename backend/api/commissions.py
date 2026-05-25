from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from backend.database.db import get_db
from backend.database.models import Commission, Partner
from backend.services.auth_service import require_admin

router = APIRouter(prefix="/api/commissions", tags=["commissions"])


class CommissionRequest(BaseModel):
    partner_id: int
    lead_id: Optional[int] = None
    referred_client_name: Optional[str] = None
    deal_value: Optional[float] = 0.0
    commission_rate: Optional[float] = 0.5
    notes: Optional[str] = None


class CommissionUpdateRequest(BaseModel):
    referred_client_name: Optional[str] = None
    deal_value: Optional[float] = None
    commission_rate: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


def commission_to_dict(c: Commission) -> dict:
    return {
        "id": c.id,
        "partner_id": c.partner_id,
        "partner_name": c.partner.full_name if c.partner else None,
        "lead_id": c.lead_id,
        "referred_client_name": c.referred_client_name,
        "deal_value": c.deal_value,
        "commission_rate": c.commission_rate,
        "commission_amount": c.commission_amount,
        "status": c.status,
        "paid_at": c.paid_at.isoformat() if c.paid_at else None,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("")
def list_commissions(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    commissions = db.query(Commission).order_by(Commission.created_at.desc()).all()
    return [commission_to_dict(c) for c in commissions]


@router.post("")
def create_commission(req: CommissionRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    partner = db.query(Partner).filter(Partner.id == req.partner_id).first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    amount = (req.deal_value or 0) * (req.commission_rate or 0) / 100
    c = Commission(
        partner_id=req.partner_id,
        lead_id=req.lead_id,
        referred_client_name=req.referred_client_name,
        deal_value=req.deal_value or 0,
        commission_rate=req.commission_rate or 0.5,
        commission_amount=amount,
        notes=req.notes,
    )
    db.add(c)
    partner.total_referrals = (partner.total_referrals or 0) + 1
    db.commit()
    db.refresh(c)
    return commission_to_dict(c)


@router.put("/{commission_id}")
def update_commission(commission_id: int, req: CommissionUpdateRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Commission).filter(Commission.id == commission_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Commission not found")
    if req.referred_client_name is not None:
        c.referred_client_name = req.referred_client_name
    if req.deal_value is not None:
        c.deal_value = req.deal_value
    if req.commission_rate is not None:
        c.commission_rate = req.commission_rate
    if req.notes is not None:
        c.notes = req.notes
    if req.status is not None:
        c.status = req.status
    c.commission_amount = (c.deal_value or 0) * (c.commission_rate or 0) / 100
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return commission_to_dict(c)


@router.put("/{commission_id}/paid")
def mark_paid(commission_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    c = db.query(Commission).filter(Commission.id == commission_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Commission not found")
    c.status = "paid"
    c.paid_at = datetime.utcnow()
    c.updated_at = datetime.utcnow()

    partner = db.query(Partner).filter(Partner.id == c.partner_id).first()
    if partner:
        partner.total_deals_closed = (partner.total_deals_closed or 0) + 1
        partner.total_commission_earned = (partner.total_commission_earned or 0) + (c.commission_amount or 0)
    db.commit()
    db.refresh(c)
    return commission_to_dict(c)
