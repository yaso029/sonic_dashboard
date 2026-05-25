from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from backend.database.db import get_db
from backend.database.models import Partner
from backend.services.auth_service import require_admin
import csv, io

router = APIRouter(prefix="/api/partners", tags=["partners"])

PARTNER_TYPES = ["Personal Trainer", "Car Dealer", "Interior Designer", "Financial Advisor",
                 "HR Manager", "Hotel Concierge", "Other"]
PARTNER_STATUSES = ["New", "Contacted", "Active Partner", "Not Interested", "Inactive"]


class PartnerRequest(BaseModel):
    full_name: str
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    partner_type: Optional[str] = "Other"
    status: Optional[str] = "New"
    commission_rate: Optional[float] = 0.5
    notes: Optional[str] = None


def partner_to_dict(p: Partner) -> dict:
    return {
        "id": p.id,
        "full_name": p.full_name,
        "whatsapp_number": p.whatsapp_number,
        "email": p.email,
        "company": p.company,
        "partner_type": p.partner_type,
        "status": p.status,
        "commission_rate": p.commission_rate,
        "total_referrals": p.total_referrals,
        "total_deals_closed": p.total_deals_closed,
        "total_commission_earned": p.total_commission_earned,
        "last_contacted_at": p.last_contacted_at.isoformat() if p.last_contacted_at else None,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
def list_partners(
    status: Optional[str] = None,
    partner_type: Optional[str] = None,
    search: Optional[str] = None,
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Partner)
    if status:
        q = q.filter(Partner.status == status)
    if partner_type:
        q = q.filter(Partner.partner_type == partner_type)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Partner.full_name.ilike(like) |
            Partner.whatsapp_number.ilike(like) |
            Partner.email.ilike(like)
        )
    return [partner_to_dict(p) for p in q.order_by(Partner.created_at.desc()).all()]


@router.post("")
def create_partner(req: PartnerRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    p = Partner(**req.dict())
    db.add(p)
    db.commit()
    db.refresh(p)
    return partner_to_dict(p)


@router.put("/{partner_id}")
def update_partner(partner_id: int, req: PartnerRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    p = db.query(Partner).filter(Partner.id == partner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    for k, v in req.dict().items():
        if v is not None:
            setattr(p, k, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return partner_to_dict(p)


@router.delete("/{partner_id}")
def delete_partner(partner_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    p = db.query(Partner).filter(Partner.id == partner_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Partner not found")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/import")
async def import_partners(file: UploadFile = File(...), current_user=Depends(require_admin), db: Session = Depends(get_db)):
    content = await file.read()
    if file.filename.endswith(".csv"):
        if content[:2] in (b'\xff\xfe', b'\xfe\xff'):
            text = content.decode("utf-16")
        else:
            text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text, newline=''))
        rows = list(reader)
    else:
        raise HTTPException(status_code=400, detail="Only CSV supported for partner import")

    created = 0
    for row in rows:
        name = row.get("full_name") or row.get("name") or row.get("Full Name") or ""
        if not name.strip():
            continue
        p = Partner(
            full_name=name.strip(),
            whatsapp_number=(row.get("whatsapp_number") or row.get("phone") or "").strip() or None,
            email=(row.get("email") or "").strip() or None,
            company=(row.get("company") or "").strip() or None,
            partner_type=(row.get("partner_type") or row.get("type") or "Other").strip(),
            status="New",
        )
        db.add(p)
        created += 1
    db.commit()
    return {"ok": True, "created": created}


@router.get("/export")
def export_partners(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    partners = db.query(Partner).order_by(Partner.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Full Name", "WhatsApp", "Email", "Company", "Type", "Status",
                     "Commission Rate", "Total Referrals", "Total Deals", "Total Commission", "Last Contacted"])
    for p in partners:
        writer.writerow([p.id, p.full_name, p.whatsapp_number, p.email, p.company,
                         p.partner_type, p.status, p.commission_rate, p.total_referrals,
                         p.total_deals_closed, p.total_commission_earned,
                         p.last_contacted_at.isoformat() if p.last_contacted_at else ""])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=partners.csv"}
    )
