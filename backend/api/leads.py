from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from backend.database.db import get_db
from backend.database.models import User, Lead, Activity, Client
from backend.services.auth_service import get_current_user, require_admin, require_admin_or_marketing_manager, require_permission
from backend.services import meta_capi_service
from backend.services.notification_service import notify_admins, notify_user

router = APIRouter(prefix="/api/leads", tags=["leads"])


# Marketing-firm pipeline stages
LEAD_STAGES = [
    "inquiry",
    "discovery_call",
    "documents_requested",
    "documents_received",
    "in_progress",
    "review",
    "completed",
    "monthly_retainer",
    "lost",
]


class CreateLeadRequest(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    estimated_value: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


class UpdateLeadRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    estimated_value: Optional[str] = None
    notes: Optional[str] = None
    stage: Optional[str] = None
    assigned_to: Optional[int] = None


class StageUpdateRequest(BaseModel):
    stage: str


class AssignRequest(BaseModel):
    user_id: int


class ActivityRequest(BaseModel):
    type: str
    content: str


def activity_to_dict(a: Activity):
    return {
        "id": a.id,
        "lead_id": a.lead_id,
        "user_id": a.user_id,
        "user_name": a.user.full_name if a.user else None,
        "type": a.type,
        "content": a.content,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def lead_to_dict(lead: Lead, include_activities: bool = False):
    data = {
        "id": lead.id,
        "full_name": lead.full_name,
        "phone": lead.phone,
        "email": lead.email,
        "company": lead.company,
        "source": lead.source,
        "estimated_value": lead.estimated_value,
        "notes": lead.notes,
        "stage": lead.stage,
        "assigned_to": lead.assigned_to,
        "assigned_to_name": lead.assignee.full_name if lead.assignee else None,
        "created_by": lead.created_by,
        "created_by_name": lead.creator.full_name if lead.creator else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }
    if include_activities:
        data["activities"] = [activity_to_dict(a) for a in sorted(lead.activities, key=lambda x: x.created_at, reverse=True)]
    return data


def get_leads_query(current_user: User, db: Session):
    query = db.query(Lead)
    if current_user.role == "admin":
        return query
    elif current_user.role == "marketing_manager":
        team_ids = [u.id for u in db.query(User).filter(User.team_leader_id == current_user.id).all()]
        visible_ids = team_ids + [current_user.id]
        return query.filter(
            (Lead.assigned_to.in_(visible_ids)) | (Lead.created_by == current_user.id)
        )
    else:
        return query.filter(Lead.assigned_to == current_user.id)


@router.get("")
def list_leads(
    stage: Optional[str] = None,
    search: Optional[str] = None,
    assigned_to: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = get_leads_query(current_user, db)
    if stage:
        query = query.filter(Lead.stage == stage)
    if assigned_to:
        query = query.filter(Lead.assigned_to == assigned_to)
    if search:
        like = f"%{search}%"
        query = query.filter(
            Lead.full_name.ilike(like) | Lead.phone.ilike(like) | Lead.email.ilike(like)
        )
    leads = query.order_by(Lead.updated_at.desc()).all()
    return [lead_to_dict(l) for l in leads]


@router.get("/kanban")
def kanban_board(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = get_leads_query(current_user, db)
    leads = query.order_by(Lead.updated_at.desc()).all()
    board = {stage: [] for stage in LEAD_STAGES}
    for lead in leads:
        stage = lead.stage if lead.stage in board else "inquiry"
        board[stage].append(lead_to_dict(lead))
    return board


@router.get("/{lead_id}")
def get_lead(lead_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = get_leads_query(current_user, db)
    lead = query.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead_to_dict(lead, include_activities=True)


@router.post("")
def create_lead(req: CreateLeadRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    assigned = req.assigned_to or current_user.id
    lead = Lead(
        full_name=req.full_name,
        phone=req.phone,
        email=req.email,
        company=req.company,
        source=req.source,
        estimated_value=req.estimated_value,
        notes=req.notes,
        stage="inquiry",
        assigned_to=assigned,
        created_by=current_user.id,
    )
    db.add(lead)
    db.flush()
    activity = Activity(
        lead_id=lead.id,
        user_id=current_user.id,
        type="note",
        content=f"Lead created by {current_user.full_name}",
    )
    db.add(activity)
    msg = f"🆕 New inquiry: {lead.full_name} (from {lead.source or 'unknown'}) — added by {current_user.full_name}"
    notify_admins(db, msg, lead_id=lead.id, exclude_id=current_user.id)
    if assigned != current_user.id:
        notify_user(db, assigned, f"📋 A new inquiry has been assigned to you: {lead.full_name}", lead_id=lead.id, exclude_id=current_user.id)
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@router.put("/{lead_id}")
def update_lead(lead_id: int, req: UpdateLeadRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = get_leads_query(current_user, db)
    lead = query.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    fields = ["full_name", "phone", "email", "company", "source", "estimated_value", "notes", "stage", "assigned_to"]
    for field in fields:
        val = getattr(req, field)
        if val is not None:
            setattr(lead, field, val)
    lead.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@router.patch("/{lead_id}/stage")
async def update_stage(lead_id: int, req: StageUpdateRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.stage not in LEAD_STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    query = get_leads_query(current_user, db)
    lead = query.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    old_stage = lead.stage
    lead.stage = req.stage
    lead.updated_at = datetime.utcnow()
    activity = Activity(
        lead_id=lead.id,
        user_id=current_user.id,
        type="stage_change",
        content=f"Stage changed from '{old_stage}' to '{req.stage}'",
    )
    db.add(activity)
    stage_label = req.stage.replace("_", " ").title()
    msg = f"🔄 {lead.full_name} moved to '{stage_label}' by {current_user.full_name}"
    notify_admins(db, msg, lead_id=lead.id, exclude_id=current_user.id)
    if lead.assigned_to:
        notify_user(db, lead.assigned_to, msg, lead_id=lead.id, exclude_id=current_user.id)
    db.commit()
    db.refresh(lead)
    lead_snapshot = {"stage": lead.stage, "phone": lead.phone, "email": lead.email}
    print(f"[STAGE] lead {lead_id} moved to {req.stage}, queuing CAPI task", flush=True)
    background_tasks.add_task(meta_capi_service.send_stage_event, lead_snapshot)
    return lead_to_dict(lead)


@router.patch("/{lead_id}/assign")
def assign_lead(lead_id: int, req: AssignRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    marketing_specialist = db.query(User).filter(User.id == req.user_id, User.is_active == True).first()
    if not marketing_specialist:
        raise HTTPException(status_code=404, detail="User not found")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    old_assignee = lead.assignee.full_name if lead.assignee else "unassigned"
    lead.assigned_to = req.user_id
    lead.updated_at = datetime.utcnow()
    activity = Activity(
        lead_id=lead.id,
        user_id=current_user.id,
        type="note",
        content=f"Lead reassigned from {old_assignee} to {marketing_specialist.full_name}",
    )
    db.add(activity)
    notify_user(db, req.user_id, f"📋 Inquiry assigned to you: {lead.full_name} (was: {old_assignee})", lead_id=lead.id, exclude_id=current_user.id)
    notify_admins(db, f"👤 {lead.full_name} reassigned from {old_assignee} → {marketing_specialist.full_name} by {current_user.full_name}", lead_id=lead.id, exclude_id=current_user.id)
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@router.post("/{lead_id}/activities")
def add_activity(lead_id: int, req: ActivityRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = get_leads_query(current_user, db)
    lead = query.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    valid_types = ["call", "email", "meeting", "note", "whatsapp", "document_request", "document_received"]
    if req.type not in valid_types:
        raise HTTPException(status_code=400, detail="Invalid activity type")
    activity = Activity(
        lead_id=lead_id,
        user_id=current_user.id,
        type=req.type,
        content=req.content,
    )
    db.add(activity)
    lead.updated_at = datetime.utcnow()
    type_label = req.type.replace("_", " ").title()
    msg = f"📝 {type_label} logged on {lead.full_name} by {current_user.full_name}"
    notify_admins(db, msg, lead_id=lead_id, exclude_id=current_user.id)
    if lead.assigned_to:
        notify_user(db, lead.assigned_to, msg, lead_id=lead_id, exclude_id=current_user.id)
    db.commit()
    db.refresh(activity)
    return activity_to_dict(activity)


@router.get("/{lead_id}/activities")
def get_activities(lead_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = get_leads_query(current_user, db)
    lead = query.filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    activities = sorted(lead.activities, key=lambda x: x.created_at, reverse=True)
    return [activity_to_dict(a) for a in activities]


class BulkActionRequest(BaseModel):
    lead_ids: List[int]
    action: str  # "stage" or "assign"
    stage: Optional[str] = None
    assigned_to: Optional[int] = None


@router.post("/bulk")
def bulk_action(req: BulkActionRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not req.lead_ids:
        raise HTTPException(status_code=400, detail="No leads selected")

    accessible = get_leads_query(current_user, db)
    leads = accessible.filter(Lead.id.in_(req.lead_ids)).all()

    if not leads:
        raise HTTPException(status_code=404, detail="No accessible leads found")

    updated = 0
    for lead in leads:
        if req.action == "stage" and req.stage:
            if req.stage not in LEAD_STAGES:
                raise HTTPException(status_code=400, detail="Invalid stage")
            old_stage = lead.stage
            lead.stage = req.stage
            lead.updated_at = datetime.utcnow()
            db.add(Activity(lead_id=lead.id, user_id=current_user.id, type="stage_change",
                content=f"Stage changed from '{old_stage}' to '{req.stage}' (bulk action)"))
            updated += 1
        elif req.action == "assign" and req.assigned_to:
            lead.assigned_to = req.assigned_to
            lead.updated_at = datetime.utcnow()
            db.add(Activity(lead_id=lead.id, user_id=current_user.id, type="note",
                content=f"Lead reassigned via bulk action by {current_user.full_name}"))
            updated += 1

    db.commit()
    return {"ok": True, "updated": updated}


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.delete(lead)
    db.commit()
    return {"ok": True}


# ─── Lead → Client conversion ─────────────────────────────────────────────────

class ConvertLeadRequest(BaseModel):
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
    final_stage: Optional[str] = "monthly_retainer"  # "monthly_retainer" or "completed"


@router.post("/{lead_id}/convert")
def convert_lead_to_client(
    lead_id: int,
    req: ConvertLeadRequest,
    current_user: User = Depends(require_permission("leads", "convert")),
    db: Session = Depends(get_db),
):
    """Promote a Lead to a Client. Pre-fills contact info from the Lead and
    creates a Client record linked via lead_id. Moves the Lead to the
    selected won stage (default: monthly_retainer)."""
    lead = get_leads_query(current_user, db).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if req.final_stage not in ("monthly_retainer", "completed"):
        raise HTTPException(status_code=400, detail="final_stage must be 'monthly_retainer' or 'completed'")

    # Reuse existing client if this lead was already converted
    existing = db.query(Client).filter(Client.lead_id == lead.id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Lead already converted to client #{existing.id}")

    client = Client(
        company_name=req.company_name,
        primary_contact_name=req.primary_contact_name or lead.full_name,
        primary_email=req.primary_email or lead.email,
        primary_phone=req.primary_phone or lead.phone,
        trn=req.trn,
        ct_registration_number=req.ct_registration_number,
        trade_license_number=req.trade_license_number,
        trade_license_emirate=req.trade_license_emirate,
        legal_form=req.legal_form,
        industry=req.industry,
        fiscal_year_end_month=req.fiscal_year_end_month or 12,
        fiscal_year_end_day=req.fiscal_year_end_day or 31,
        esr_applicable=req.esr_applicable or False,
        assigned_accountant_id=req.assigned_accountant_id or lead.assigned_to or current_user.id,
        lead_id=lead.id,
        notes=lead.notes,
    )
    db.add(client)

    old_stage = lead.stage
    lead.stage = req.final_stage
    lead.updated_at = datetime.utcnow()
    db.flush()

    db.add(Activity(
        lead_id=lead.id,
        user_id=current_user.id,
        type="note",
        content=f"Converted to Client #{client.id} ({client.company_name}). Stage moved from '{old_stage}' to '{req.final_stage}'.",
    ))
    notify_admins(
        db,
        f"🎉 Lead converted: {lead.full_name} → Client {client.company_name} by {current_user.full_name}",
        lead_id=lead.id,
        exclude_id=current_user.id,
    )
    db.commit()
    db.refresh(client)
    return {
        "ok": True,
        "client_id": client.id,
        "lead_id": lead.id,
        "lead_stage": lead.stage,
    }
