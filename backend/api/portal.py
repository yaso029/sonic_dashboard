"""Client-facing portal API (Phase 6).

Every endpoint (except login) requires a portal-scoped token and is hard-scoped to
the authenticated account's own client_id — a portal user can never see another
client's data. Read-mostly: invoices (+ pay), documents (list/download/upload),
service/task status, company profile (+ change request).
"""
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    ClientUser, Client, Invoice, Document, Service, Task, User,
)
from backend.services.auth_service import verify_password, hash_password
from backend.services.portal_auth import create_portal_token, get_current_client_user
from backend.services import storage_service as storage
from backend.services import stripe_service
from backend.services import audit_service, rate_limit
from backend.api.invoices import invoice_to_dict, _round
from backend.api.documents import doc_to_dict, DOCUMENT_CATEGORIES, _log_access

router = APIRouter(prefix="/api/portal", tags=["portal"])


# ─── Auth ─────────────────────────────────────────────────────────────────────

class PortalLogin(BaseModel):
    email: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


@router.post("/auth/login")
def portal_login(req: PortalLogin, request: Request, db: Session = Depends(get_db)):
    email = (req.email or "").strip().lower()
    ip = audit_service.client_ip(request)
    key = rate_limit.make_key("portal", email, ip)

    locked = rate_limit.check_locked(key)
    if locked:
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {locked} seconds.")

    cu = db.query(ClientUser).filter(ClientUser.email == email, ClientUser.is_active == True).first()
    if not cu or not verify_password(req.password, cu.password_hash):
        lock_secs = rate_limit.record_failure(key)
        audit_service.record("portal_login_failed", actor_label=email, ip_address=ip)
        if lock_secs:
            audit_service.record("login_locked", actor_label=email, ip_address=ip,
                                 detail=f"Portal account locked for {lock_secs}s")
            raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {lock_secs} seconds.")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    rate_limit.record_success(key)
    cu.last_login_at = datetime.utcnow()
    db.commit()
    audit_service.record("portal_login_success", actor_label=cu.email, ip_address=ip,
                         target_type="client", target_id=cu.client_id)
    token = create_portal_token(cu.id, cu.client_id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": cu.id, "email": cu.email, "full_name": cu.full_name},
        "client": {"id": cu.client.id, "company_name": cu.client.company_name} if cu.client else None,
    }


@router.get("/me")
def portal_me(cu: ClientUser = Depends(get_current_client_user)):
    return {
        "id": cu.id,
        "email": cu.email,
        "full_name": cu.full_name,
        "client_id": cu.client_id,
        "company_name": cu.client.company_name if cu.client else None,
    }


@router.post("/auth/change-password")
def portal_change_password(
    req: ChangePassword,
    cu: ClientUser = Depends(get_current_client_user),
    db: Session = Depends(get_db),
):
    if not verify_password(req.current_password, cu.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    cu.password_hash = hash_password(req.new_password)
    db.commit()
    return {"ok": True}


# ─── Invoices ─────────────────────────────────────────────────────────────────

def _own_invoice(db: Session, cu: ClientUser, invoice_id: int) -> Invoice:
    inv = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.client_id == cu.client_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.get("/billing/config")
def portal_billing_config(cu: ClientUser = Depends(get_current_client_user)):
    import os
    return {
        "stripe_enabled": stripe_service.is_configured(),
        "publishable_key": os.environ.get("STRIPE_PUBLISHABLE_KEY", "") if stripe_service.is_configured() else "",
    }


@router.get("/invoices")
def portal_invoices(cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    rows = db.query(Invoice).filter(
        Invoice.client_id == cu.client_id, Invoice.status != "draft",
    ).order_by(Invoice.created_at.desc()).all()
    return [invoice_to_dict(i, with_items=False) for i in rows]


@router.get("/invoices/{invoice_id}")
def portal_invoice(invoice_id: int, cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    inv = _own_invoice(db, cu, invoice_id)
    if inv.status == "draft":
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice_to_dict(inv)


@router.post("/invoices/{invoice_id}/payment-intent")
def portal_payment_intent(invoice_id: int, cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Online payment is not available")
    inv = _own_invoice(db, cu, invoice_id)
    if inv.status in ("draft", "void", "paid"):
        raise HTTPException(status_code=409, detail=f"Cannot pay a {inv.status} invoice")
    balance = _round((inv.total or 0) - (inv.amount_paid or 0))
    if balance <= 0:
        raise HTTPException(status_code=409, detail="Nothing left to pay")
    client = db.query(Client).filter(Client.id == inv.client_id).first()
    try:
        customer_id = stripe_service.ensure_customer(client)
        if client.stripe_customer_id != customer_id:
            client.stripe_customer_id = customer_id
            db.commit()
        pi = stripe_service.create_payment_intent(
            stripe_service.to_minor_units(balance), inv.currency, customer_id,
            metadata={"invoice_id": str(inv.id), "invoice_number": inv.invoice_number, "via": "portal"},
        )
    except stripe_service.StripeLiveKeyRefused as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Payment error: {e}")
    inv.stripe_payment_intent_id = pi["id"]
    db.commit()
    return {"client_secret": pi["client_secret"], "amount": balance}


# ─── Documents ────────────────────────────────────────────────────────────────

@router.get("/documents")
def portal_documents(cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    rows = db.query(Document).filter(Document.client_id == cu.client_id).order_by(Document.created_at.desc()).all()
    return [doc_to_dict(d) for d in rows]


@router.get("/documents/meta")
def portal_doc_meta(cu: ClientUser = Depends(get_current_client_user)):
    return {"categories": DOCUMENT_CATEGORIES, "max_upload_bytes": storage.MAX_UPLOAD_BYTES,
            "allowed_content_types": sorted(storage.ALLOWED_CONTENT_TYPES)}


@router.get("/documents/{document_id}/signed-url")
def portal_doc_signed_url(
    document_id: int,
    request: Request,
    cu: ClientUser = Depends(get_current_client_user),
    db: Session = Depends(get_db),
):
    d = db.query(Document).filter(Document.id == document_id, Document.client_id == cu.client_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    token, expires_at = storage.make_download_token(d.id)
    _log_access(db, d.id, None, "view", request)
    return {"url": f"/api/documents/{d.id}/download?token={token}", "expires_at": expires_at, "file_name": d.file_name}


@router.post("/documents")
async def portal_upload(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form("other"),
    notes: Optional[str] = Form(None),
    cu: ClientUser = Depends(get_current_client_user),
    db: Session = Depends(get_db),
):
    if category not in DOCUMENT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if file.content_type not in storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{file.content_type}' not allowed")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > storage.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    backend = storage.get_storage()
    stored_key = backend.save(data, file.filename or "upload")
    doc = Document(
        client_id=cu.client_id,
        uploaded_by=None,
        uploaded_by_portal_user_id=cu.id,
        file_name=file.filename or "upload",
        stored_key=stored_key,
        content_type=file.content_type,
        size_bytes=len(data),
        category=category,
        notes=f"[Client upload] {notes}" if notes else "[Client upload]",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    _log_access(db, doc.id, None, "upload", request)
    return doc_to_dict(doc)


# ─── Service / task status ────────────────────────────────────────────────────

@router.get("/services")
def portal_services(cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    services = db.query(Service).filter(Service.client_id == cu.client_id).order_by(Service.created_at.desc()).all()
    tasks = db.query(Task).filter(
        Task.client_id == cu.client_id, Task.status != "done"
    ).order_by(Task.due_date.asc().nullslast()).all()
    return {
        "services": [
            {"id": s.id, "service_type": s.service_type, "status": s.status,
             "recurrence": s.recurrence, "start_date": s.start_date, "end_date": s.end_date}
            for s in services
        ],
        # Simplified, client-safe task view — no internal description/notes.
        "open_tasks": [
            {"id": t.id, "title": t.title, "status": t.status, "due_date": t.due_date}
            for t in tasks
        ],
    }


# ─── Company profile ──────────────────────────────────────────────────────────

class ProfileChangeRequest(BaseModel):
    message: str


@router.get("/profile")
def portal_profile(cu: ClientUser = Depends(get_current_client_user), db: Session = Depends(get_db)):
    c = cu.client
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return {
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
    }


@router.post("/profile/change-request")
def portal_profile_change_request(
    req: ProfileChangeRequest,
    cu: ClientUser = Depends(get_current_client_user),
    db: Session = Depends(get_db),
):
    """Client requests a profile update. Creates a task for the assigned marketing_specialist
    rather than mutating the record directly (staff review the change)."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")
    c = cu.client
    task = Task(
        client_id=cu.client_id,
        title=f"Portal: profile change request from {cu.email}",
        description=req.message.strip(),
        priority="normal",
        status="todo",
        assigned_to=c.assigned_accountant_id if c else None,
        created_by=None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return {"ok": True, "task_id": task.id}
