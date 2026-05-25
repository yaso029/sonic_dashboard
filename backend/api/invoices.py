"""Invoices API — UAE VAT invoices for client engagements.

Local amounts are the source of truth (5% VAT, AED default). Stripe is optional
(see api/payments.py for card flows). Visibility reuses Client scoping so users
only see invoices for clients they can access.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta

from backend.database.db import get_db
from backend.database.models import Invoice, InvoiceLineItem, Client, Service, User
from backend.services.auth_service import get_current_user, require_permission
from backend.api.clients import scope_query as scope_clients

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "void"]
DEFAULT_VAT_RATE = 5.0
DEFAULT_PAYMENT_TERMS_DAYS = 30


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LineItemIn(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0


class InvoiceCreate(BaseModel):
    client_id: int
    service_id: Optional[int] = None
    subscription_id: Optional[int] = None
    currency: str = "AED"
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    vat_rate: float = DEFAULT_VAT_RATE
    notes: Optional[str] = None
    line_items: List[LineItemIn] = []


class InvoiceUpdate(BaseModel):
    currency: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    vat_rate: Optional[float] = None
    notes: Optional[str] = None
    line_items: Optional[List[LineItemIn]] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _round(x: float) -> float:
    return round(float(x or 0), 2)


def next_invoice_number(db: Session) -> str:
    """Sequential per calendar year: INV-2026-0001. Single-firm tool, so a simple
    count-based sequence is sufficient."""
    year = datetime.utcnow().year
    prefix = f"INV-{year}-"
    count = db.query(Invoice).filter(Invoice.invoice_number.like(f"{prefix}%")).count()
    return f"{prefix}{count + 1:04d}"


def recompute_totals(inv: Invoice):
    """Recompute line totals, subtotal, VAT and grand total from line items."""
    subtotal = 0.0
    for li in inv.line_items:
        li.line_total = _round((li.quantity or 0) * (li.unit_price or 0))
        subtotal += li.line_total
    inv.subtotal = _round(subtotal)
    inv.vat_amount = _round(inv.subtotal * (inv.vat_rate or 0) / 100.0)
    inv.total = _round(inv.subtotal + inv.vat_amount)


def reconcile_status(inv: Invoice):
    """Set paid / partially_paid based on amount_paid vs total. Never overrides
    draft or void."""
    if inv.status in ("draft", "void"):
        return
    if inv.amount_paid >= inv.total and inv.total > 0:
        inv.status = "paid"
    elif inv.amount_paid > 0:
        inv.status = "partially_paid"
    else:
        inv.status = "sent"


def _is_overdue(inv: Invoice) -> bool:
    if inv.status in ("paid", "void", "draft"):
        return False
    if not inv.due_date:
        return False
    try:
        return date.fromisoformat(inv.due_date) < date.today()
    except ValueError:
        return False


def invoice_to_dict(inv: Invoice, with_items: bool = True) -> dict:
    data = {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "client_id": inv.client_id,
        "client_name": inv.client.company_name if inv.client else None,
        "client_trn": inv.client.trn if inv.client else None,
        "service_id": inv.service_id,
        "subscription_id": inv.subscription_id,
        "status": inv.status,
        "overdue": _is_overdue(inv),
        "currency": inv.currency,
        "issue_date": inv.issue_date,
        "due_date": inv.due_date,
        "subtotal": inv.subtotal,
        "vat_rate": inv.vat_rate,
        "vat_amount": inv.vat_amount,
        "total": inv.total,
        "amount_paid": inv.amount_paid,
        "balance": _round((inv.total or 0) - (inv.amount_paid or 0)),
        "notes": inv.notes,
        "stripe_payment_intent_id": inv.stripe_payment_intent_id,
        "created_by": inv.created_by,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
    }
    if with_items:
        data["line_items"] = [
            {"id": li.id, "description": li.description, "quantity": li.quantity,
             "unit_price": li.unit_price, "line_total": li.line_total}
            for li in inv.line_items
        ]
        data["payments"] = [
            {"id": p.id, "amount": p.amount, "method": p.method, "reference": p.reference,
             "paid_at": p.paid_at, "recorded_by_name": p.recorder.full_name if p.recorder else None,
             "created_at": p.created_at.isoformat() if p.created_at else None}
            for p in sorted(inv.payments, key=lambda x: x.id)
        ]
    return data


def get_visible_invoice(db: Session, current_user: User, invoice_id: int) -> Invoice:
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == inv.client_id).first():
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


def build_invoice(db: Session, current_user: User, *, client_id, service_id, subscription_id,
                  currency, issue_date, due_date, vat_rate, notes, items: List[LineItemIn]) -> Invoice:
    inv = Invoice(
        invoice_number=next_invoice_number(db),
        client_id=client_id,
        service_id=service_id,
        subscription_id=subscription_id,
        status="draft",
        currency=currency or "AED",
        issue_date=issue_date,
        due_date=due_date or (date.today() + timedelta(days=DEFAULT_PAYMENT_TERMS_DAYS)).isoformat(),
        vat_rate=vat_rate if vat_rate is not None else DEFAULT_VAT_RATE,
        notes=notes,
        amount_paid=0.0,
        created_by=current_user.id,
    )
    for it in items:
        inv.line_items.append(InvoiceLineItem(
            description=it.description, quantity=it.quantity or 0, unit_price=it.unit_price or 0,
        ))
    recompute_totals(inv)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(current_user: User = Depends(get_current_user)):
    return {"statuses": INVOICE_STATUSES, "default_vat_rate": DEFAULT_VAT_RATE,
            "payment_terms_days": DEFAULT_PAYMENT_TERMS_DAYS}


@router.get("")
def list_invoices(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("invoices", "read")),
    db: Session = Depends(get_db),
):
    visible_ids = [row.id for row in scope_clients(db.query(Client.id), current_user, db).all()]
    query = db.query(Invoice).filter(Invoice.client_id.in_(visible_ids))
    if client_id is not None:
        query = query.filter(Invoice.client_id == client_id)
    if status:
        query = query.filter(Invoice.status == status)
    invoices = query.order_by(Invoice.created_at.desc()).all()
    return [invoice_to_dict(i, with_items=False) for i in invoices]


@router.get("/{invoice_id}")
def get_invoice(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "read")),
    db: Session = Depends(get_db),
):
    return invoice_to_dict(get_visible_invoice(db, current_user, invoice_id))


@router.post("")
def create_invoice(
    req: InvoiceCreate,
    current_user: User = Depends(require_permission("invoices", "create")),
    db: Session = Depends(get_db),
):
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == req.client_id).first():
        raise HTTPException(status_code=404, detail="Client not found")
    if not req.line_items:
        raise HTTPException(status_code=400, detail="At least one line item is required")
    inv = build_invoice(
        db, current_user, client_id=req.client_id, service_id=req.service_id,
        subscription_id=req.subscription_id, currency=req.currency, issue_date=req.issue_date,
        due_date=req.due_date, vat_rate=req.vat_rate, notes=req.notes, items=req.line_items,
    )
    return invoice_to_dict(inv)


@router.put("/{invoice_id}")
def update_invoice(
    invoice_id: int,
    req: InvoiceUpdate,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft invoices can be edited")
    for f in ("currency", "issue_date", "due_date", "vat_rate", "notes"):
        val = getattr(req, f)
        if val is not None:
            setattr(inv, f, val)
    if req.line_items is not None:
        inv.line_items.clear()
        db.flush()
        for it in req.line_items:
            inv.line_items.append(InvoiceLineItem(
                description=it.description, quantity=it.quantity or 0, unit_price=it.unit_price or 0,
            ))
    recompute_totals(inv)
    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return invoice_to_dict(inv)


@router.post("/{invoice_id}/send")
def send_invoice(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status == "void":
        raise HTTPException(status_code=409, detail="Cannot send a void invoice")
    if inv.status == "draft":
        inv.status = "sent"
        if not inv.issue_date:
            inv.issue_date = date.today().isoformat()
    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return invoice_to_dict(inv)


@router.post("/{invoice_id}/void")
def void_invoice(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status == "paid" or inv.amount_paid > 0:
        raise HTTPException(status_code=409, detail="Cannot void an invoice with payments")
    inv.status = "void"
    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return invoice_to_dict(inv)


@router.post("/from-service/{service_id}")
def create_from_service(
    service_id: int,
    current_user: User = Depends(require_permission("invoices", "create")),
    db: Session = Depends(get_db),
):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == svc.client_id).first():
        raise HTTPException(status_code=404, detail="Service not found")
    label = svc.service_type.replace("_", " ").title()
    item = LineItemIn(description=f"{label} service", quantity=1, unit_price=svc.fee_amount or 0)
    inv = build_invoice(
        db, current_user, client_id=svc.client_id, service_id=svc.id, subscription_id=None,
        currency=svc.fee_currency or "AED", issue_date=None, due_date=None,
        vat_rate=DEFAULT_VAT_RATE, notes=f"Auto-generated from {label} service", items=[item],
    )
    return invoice_to_dict(inv)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "delete")),
    db: Session = Depends(get_db),
):
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status not in ("draft", "void"):
        raise HTTPException(status_code=409, detail="Only draft or void invoices can be deleted")
    db.delete(inv)
    db.commit()
    return {"ok": True}
