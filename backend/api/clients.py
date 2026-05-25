"""Clients API — marketing agency CRM (UAE focused).

Single-firm tool: no firm_id scoping. Role-scoped visibility:
- admin: sees all clients
- marketing_manager: sees own + team's assigned clients
- marketing_specialist: sees own assigned clients
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from backend.database.db import get_db
from backend.database.models import Client, User, Service, Task
from backend.services.auth_service import get_current_user, require_admin, require_permission
from backend.services.permissions import service_type_scope

router = APIRouter(prefix="/api/clients", tags=["clients"])


LEGAL_FORMS = ["llc", "sole_establishment", "fzc", "fze", "branch", "free_zone", "offshore", "civil_company", "other"]
EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"]
CLIENT_STATUSES = ["active", "paused", "archived"]


class ClientCreate(BaseModel):
    company_name: str
    primary_contact_name: Optional[str] = None
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_number: Optional[str] = None
    trade_license_number: Optional[str] = None
    trade_license_emirate: Optional[str] = None
    legal_form: Optional[str] = None
    industry: Optional[str] = None
    fiscal_year_end_month: Optional[int] = 12
    fiscal_year_end_day: Optional[int] = 31
    esr_applicable: Optional[bool] = False
    assigned_accountant_id: Optional[int] = None
    lead_id: Optional[int] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    company_name: Optional[str] = None
    primary_contact_name: Optional[str] = None
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    trn: Optional[str] = None
    ct_registration_number: Optional[str] = None
    trade_license_number: Optional[str] = None
    trade_license_emirate: Optional[str] = None
    legal_form: Optional[str] = None
    industry: Optional[str] = None
    fiscal_year_end_month: Optional[int] = None
    fiscal_year_end_day: Optional[int] = None
    esr_applicable: Optional[bool] = None
    status: Optional[str] = None
    assigned_accountant_id: Optional[int] = None
    notes: Optional[str] = None


def client_to_dict(c: Client, include_counts: bool = False, db: Optional[Session] = None) -> dict:
    data = {
        "id": c.id,
        "company_name": c.company_name,
        "primary_contact_name": c.primary_contact_name,
        "primary_email": c.primary_email,
        "primary_phone": c.primary_phone,
        "trn": c.trn,
        "ct_registration_number": c.ct_registration_number,
        "trade_license_number": c.trade_license_number,
        "trade_license_emirate": c.trade_license_emirate,
        "legal_form": c.legal_form,
        "industry": c.industry,
        "fiscal_year_end_month": c.fiscal_year_end_month,
        "fiscal_year_end_day": c.fiscal_year_end_day,
        "esr_applicable": c.esr_applicable,
        "status": c.status,
        "assigned_accountant_id": c.assigned_accountant_id,
        "assigned_accountant_name": c.assigned_accountant.full_name if c.assigned_accountant else None,
        "lead_id": c.lead_id,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_counts and db is not None:
        data["service_count"] = db.query(Service).filter(Service.client_id == c.id).count()
        data["open_task_count"] = db.query(Task).filter(
            Task.client_id == c.id, Task.status.in_(["todo", "in_progress", "blocked"])
        ).count()
    return data


def scope_query(query, current_user: User, db: Session):
    """Apply role-based scoping to a Client query.

    - admin / analyst: firm-wide visibility
    - marketing_manager: own + team's assigned clients
    - social_media_specialist / seo_specialist: clients that have a service of the
      role's scoped types (see SERVICE_TYPE_SCOPE)
    - marketing_specialist (and any other role): own assigned clients
    """
    role = current_user.role
    if role in ("admin", "analyst"):
        return query
    if role == "marketing_manager":
        team_ids = [u.id for u in db.query(User).filter(User.team_leader_id == current_user.id).all()]
        visible_ids = team_ids + [current_user.id]
        return query.filter(Client.assigned_accountant_id.in_(visible_ids))
    scoped_types = service_type_scope(role)
    if scoped_types:
        client_ids = [
            row[0] for row in db.query(Service.client_id)
            .filter(Service.service_type.in_(scoped_types))
            .distinct().all()
        ]
        return query.filter(Client.id.in_(client_ids))
    return query.filter(Client.assigned_accountant_id == current_user.id)


@router.get("/meta")
def get_meta(current_user: User = Depends(get_current_user)):
    """Catalog data the frontend needs to render the Client form."""
    return {
        "legal_forms": LEGAL_FORMS,
        "emirates": EMIRATES,
        "statuses": CLIENT_STATUSES,
    }


@router.get("")
def list_clients(
    status: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = scope_query(db.query(Client), current_user, db)
    if status:
        query = query.filter(Client.status == status)
    if assigned_to:
        query = query.filter(Client.assigned_accountant_id == assigned_to)
    if search:
        like = f"%{search}%"
        query = query.filter(or_(
            Client.company_name.ilike(like),
            Client.primary_contact_name.ilike(like),
            Client.primary_email.ilike(like),
            Client.trn.ilike(like),
            Client.trade_license_number.ilike(like),
        ))
    clients = query.order_by(Client.updated_at.desc()).all()
    return [client_to_dict(c, include_counts=True, db=db) for c in clients]


@router.get("/{client_id}")
def get_client(
    client_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    client = scope_query(db.query(Client), current_user, db).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client_to_dict(client, include_counts=True, db=db)


@router.post("")
def create_client(
    req: ClientCreate,
    current_user: User = Depends(require_permission("clients", "create")),
    db: Session = Depends(get_db),
):
    if req.legal_form and req.legal_form not in LEGAL_FORMS:
        raise HTTPException(status_code=400, detail=f"Invalid legal_form. Must be one of: {LEGAL_FORMS}")

    assigned = req.assigned_accountant_id or current_user.id
    client = Client(
        company_name=req.company_name,
        primary_contact_name=req.primary_contact_name,
        primary_email=req.primary_email,
        primary_phone=req.primary_phone,
        trn=req.trn,
        ct_registration_number=req.ct_registration_number,
        trade_license_number=req.trade_license_number,
        trade_license_emirate=req.trade_license_emirate,
        legal_form=req.legal_form,
        industry=req.industry,
        fiscal_year_end_month=req.fiscal_year_end_month or 12,
        fiscal_year_end_day=req.fiscal_year_end_day or 31,
        esr_applicable=req.esr_applicable or False,
        assigned_accountant_id=assigned,
        lead_id=req.lead_id,
        notes=req.notes,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client_to_dict(client, include_counts=True, db=db)


@router.put("/{client_id}")
def update_client(
    client_id: int,
    req: ClientUpdate,
    current_user: User = Depends(require_permission("clients", "update")),
    db: Session = Depends(get_db),
):
    client = scope_query(db.query(Client), current_user, db).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if req.legal_form is not None and req.legal_form not in LEGAL_FORMS:
        raise HTTPException(status_code=400, detail=f"Invalid legal_form")
    if req.status is not None and req.status not in CLIENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status")

    for field in [
        "company_name", "primary_contact_name", "primary_email", "primary_phone",
        "trn", "ct_registration_number", "trade_license_number", "trade_license_emirate",
        "legal_form", "industry", "fiscal_year_end_month", "fiscal_year_end_day",
        "esr_applicable", "status", "assigned_accountant_id", "notes",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(client, field, val)
    client.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(client)
    return client_to_dict(client, include_counts=True, db=db)


@router.delete("/{client_id}")
def archive_client(
    client_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.status = "archived"
    client.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
