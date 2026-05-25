"""Services API — engagements between the firm and a Client.

Service catalog is UAE-focused with sensible defaults (VAT quarterly, CT annual, etc.).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from backend.database.db import get_db
from backend.database.models import Service, Client, User
from backend.services.auth_service import get_current_user, require_permission
from backend.services.permissions import service_type_scope
from backend.api.clients import scope_query as scope_clients

router = APIRouter(prefix="/api/services", tags=["services"])


SERVICE_TYPES = [
    "social_media_management", "seo", "paid_advertising", "content_creation", "brand_strategy",
    "marketing_strategy", "analytics_reporting", "website_development", "marketing_consultation",
]
SERVICE_STATUSES = ["active", "paused", "completed", "cancelled"]
RECURRENCES = ["one_time", "monthly", "quarterly", "annual"]

# Marketing service catalog with defaults to help the frontend pre-fill the form
SERVICE_CATALOG = [
    {"key": "social_media_management", "label": "Social Media Management", "default_recurrence": "monthly",   "typical_fee_aed": 1500},
    {"key": "seo",                     "label": "SEO",                     "default_recurrence": "monthly",   "typical_fee_aed": 2000},
    {"key": "paid_advertising",        "label": "Paid Advertising",        "default_recurrence": "monthly",   "typical_fee_aed": 3500},
    {"key": "content_creation",        "label": "Content Creation",        "default_recurrence": "monthly",   "typical_fee_aed": 2500},
    {"key": "brand_strategy",          "label": "Brand Strategy",          "default_recurrence": "one_time",  "typical_fee_aed": 8000},
    {"key": "marketing_strategy",      "label": "Marketing Strategy",      "default_recurrence": "monthly",   "typical_fee_aed": 5000},
    {"key": "analytics_reporting",     "label": "Analytics & Reporting",   "default_recurrence": "monthly",   "typical_fee_aed": 1800},
    {"key": "website_development",     "label": "Website Development",     "default_recurrence": "one_time",  "typical_fee_aed": 12000},
    {"key": "marketing_consultation",  "label": "Marketing Consultation",  "default_recurrence": "one_time",  "typical_fee_aed": 2000},
]


class ServiceCreate(BaseModel):
    client_id: int
    service_type: str
    status: Optional[str] = "active"
    recurrence: Optional[str] = "one_time"
    assigned_to: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    fee_amount: Optional[float] = 0.0
    fee_currency: Optional[str] = "AED"
    notes: Optional[str] = None


class ServiceUpdate(BaseModel):
    service_type: Optional[str] = None
    status: Optional[str] = None
    recurrence: Optional[str] = None
    assigned_to: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    fee_amount: Optional[float] = None
    fee_currency: Optional[str] = None
    notes: Optional[str] = None


def service_to_dict(s: Service) -> dict:
    return {
        "id": s.id,
        "client_id": s.client_id,
        "client_name": s.client.company_name if s.client else None,
        "service_type": s.service_type,
        "status": s.status,
        "recurrence": s.recurrence,
        "assigned_to": s.assigned_to,
        "assigned_to_name": s.assignee.full_name if s.assignee else None,
        "start_date": s.start_date,
        "end_date": s.end_date,
        "fee_amount": s.fee_amount,
        "fee_currency": s.fee_currency,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _validate_enums(service_type=None, status=None, recurrence=None):
    if service_type is not None and service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid service_type")
    if status is not None and status not in SERVICE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    if recurrence is not None and recurrence not in RECURRENCES:
        raise HTTPException(status_code=400, detail=f"Invalid recurrence")


def _enforce_type_scope(current_user: User, service_type: Optional[str]):
    """For service-scoped roles (social_media_specialist, seo_specialist), block
    operating on service types outside the role's allowed set."""
    scoped = service_type_scope(current_user.role)
    if scoped and service_type is not None and service_type not in scoped:
        raise HTTPException(
            status_code=403,
            detail=f"Your role can only manage these service types: {', '.join(scoped)}",
        )


@router.get("/catalog")
def get_catalog(current_user: User = Depends(get_current_user)):
    """UAE service catalog with default fees and recurrences."""
    return {
        "services": SERVICE_CATALOG,
        "statuses": SERVICE_STATUSES,
        "recurrences": RECURRENCES,
    }


@router.get("")
def list_services(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Constrain to services whose client the user can see
    visible_clients_q = scope_clients(db.query(Client.id), current_user, db)
    visible_ids = [row.id for row in visible_clients_q.all()]
    query = db.query(Service).filter(Service.client_id.in_(visible_ids))

    # Service-scoped roles only see services of their allowed types
    scoped_types = service_type_scope(current_user.role)
    if scoped_types:
        query = query.filter(Service.service_type.in_(scoped_types))

    if client_id is not None:
        query = query.filter(Service.client_id == client_id)
    if status:
        query = query.filter(Service.status == status)
    if service_type:
        query = query.filter(Service.service_type == service_type)

    services = query.order_by(Service.updated_at.desc()).all()
    return [service_to_dict(s) for s in services]


@router.get("/{service_id}")
def get_service(
    service_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(Service).filter(Service.id == service_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    # Check visibility via the parent client
    visible = scope_clients(db.query(Client), current_user, db).filter(Client.id == s.client_id).first()
    if not visible:
        raise HTTPException(status_code=404, detail="Service not found")
    # Service-scoped roles can't see service types outside their scope
    scoped_types = service_type_scope(current_user.role)
    if scoped_types and s.service_type not in scoped_types:
        raise HTTPException(status_code=404, detail="Service not found")
    return service_to_dict(s)


@router.post("")
def create_service(
    req: ServiceCreate,
    current_user: User = Depends(require_permission("services", "create")),
    db: Session = Depends(get_db),
):
    _validate_enums(req.service_type, req.status, req.recurrence)
    _enforce_type_scope(current_user, req.service_type)
    client = scope_clients(db.query(Client), current_user, db).filter(Client.id == req.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    s = Service(
        client_id=req.client_id,
        service_type=req.service_type,
        status=req.status or "active",
        recurrence=req.recurrence or "one_time",
        assigned_to=req.assigned_to or current_user.id,
        start_date=req.start_date,
        end_date=req.end_date,
        fee_amount=req.fee_amount or 0.0,
        fee_currency=req.fee_currency or "AED",
        notes=req.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return service_to_dict(s)


@router.put("/{service_id}")
def update_service(
    service_id: int,
    req: ServiceUpdate,
    current_user: User = Depends(require_permission("services", "update")),
    db: Session = Depends(get_db),
):
    _validate_enums(req.service_type, req.status, req.recurrence)
    s = db.query(Service).filter(Service.id == service_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    # Check visibility via parent client
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == s.client_id).first():
        raise HTTPException(status_code=404, detail="Service not found")
    # Service-scoped roles can't touch out-of-scope types (existing or target)
    _enforce_type_scope(current_user, s.service_type)
    _enforce_type_scope(current_user, req.service_type)

    for field in [
        "service_type", "status", "recurrence", "assigned_to",
        "start_date", "end_date", "fee_amount", "fee_currency", "notes",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(s, field, val)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return service_to_dict(s)


@router.delete("/{service_id}")
def cancel_service(
    service_id: int,
    current_user: User = Depends(require_permission("services", "update")),
    db: Session = Depends(get_db),
):
    s = db.query(Service).filter(Service.id == service_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Service not found")
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == s.client_id).first():
        raise HTTPException(status_code=404, detail="Service not found")
    _enforce_type_scope(current_user, s.service_type)
    s.status = "cancelled"
    s.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
