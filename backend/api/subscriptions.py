"""Subscriptions — recurring engagements (retainers) that generate invoices.

Recurrence is handled locally: each subscription tracks `next_invoice_date`, and
`POST /api/subscriptions/generate-due` materialises invoices for everything due.
This keeps recurring billing fully offline; a Stripe subscription id field is kept
for a future real-Stripe-subscriptions integration.
"""
import calendar
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database.db import get_db
from backend.database.models import Subscription, Client, Service, User
from backend.services.auth_service import require_permission
from backend.api.clients import scope_query as scope_clients
from backend.api.invoices import build_invoice, invoice_to_dict, LineItemIn

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

INTERVALS = {"monthly": 1, "quarterly": 3, "annual": 12}
SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled"]


class SubscriptionCreate(BaseModel):
    client_id: int
    service_id: Optional[int] = None
    description: Optional[str] = None
    amount: float = 0.0
    currency: str = "AED"
    interval: str = "monthly"
    status: str = "active"
    next_invoice_date: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    interval: Optional[str] = None
    status: Optional[str] = None
    next_invoice_date: Optional[str] = None


def add_months(d: date, months: int) -> date:
    """Add months to a date, clamping the day to the target month's length."""
    m = d.month - 1 + months
    year = d.year + m // 12
    month = m % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def sub_to_dict(s: Subscription) -> dict:
    return {
        "id": s.id,
        "client_id": s.client_id,
        "client_name": s.client.company_name if s.client else None,
        "service_id": s.service_id,
        "description": s.description,
        "amount": s.amount,
        "currency": s.currency,
        "interval": s.interval,
        "status": s.status,
        "next_invoice_date": s.next_invoice_date,
        "last_invoiced_date": s.last_invoiced_date,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _visible_sub(db: Session, current_user: User, sub_id: int) -> Subscription:
    s = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == s.client_id).first():
        raise HTTPException(status_code=404, detail="Subscription not found")
    return s


@router.get("/meta")
def get_meta(current_user: User = Depends(require_permission("invoices", "read"))):
    return {"intervals": list(INTERVALS.keys()), "statuses": SUBSCRIPTION_STATUSES}


@router.get("")
def list_subscriptions(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("invoices", "read")),
    db: Session = Depends(get_db),
):
    visible_ids = [row.id for row in scope_clients(db.query(Client.id), current_user, db).all()]
    q = db.query(Subscription).filter(Subscription.client_id.in_(visible_ids))
    if client_id is not None:
        q = q.filter(Subscription.client_id == client_id)
    if status:
        q = q.filter(Subscription.status == status)
    return [sub_to_dict(s) for s in q.order_by(Subscription.created_at.desc()).all()]


@router.post("")
def create_subscription(
    req: SubscriptionCreate,
    current_user: User = Depends(require_permission("invoices", "create")),
    db: Session = Depends(get_db),
):
    if req.interval not in INTERVALS:
        raise HTTPException(status_code=400, detail=f"Invalid interval. One of: {list(INTERVALS)}")
    if not scope_clients(db.query(Client), current_user, db).filter(Client.id == req.client_id).first():
        raise HTTPException(status_code=404, detail="Client not found")
    if req.service_id is not None and not db.query(Service).filter(Service.id == req.service_id).first():
        raise HTTPException(status_code=404, detail="Service not found")
    s = Subscription(
        client_id=req.client_id, service_id=req.service_id, description=req.description,
        amount=req.amount or 0, currency=req.currency or "AED", interval=req.interval,
        status=req.status if req.status in SUBSCRIPTION_STATUSES else "active",
        next_invoice_date=req.next_invoice_date or date.today().isoformat(),
        created_by=current_user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return sub_to_dict(s)


@router.put("/{sub_id}")
def update_subscription(
    sub_id: int,
    req: SubscriptionUpdate,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    s = _visible_sub(db, current_user, sub_id)
    if req.interval is not None and req.interval not in INTERVALS:
        raise HTTPException(status_code=400, detail="Invalid interval")
    if req.status is not None and req.status not in SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    for f in ("description", "amount", "currency", "interval", "status", "next_invoice_date"):
        val = getattr(req, f)
        if val is not None:
            setattr(s, f, val)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return sub_to_dict(s)


@router.delete("/{sub_id}")
def cancel_subscription(
    sub_id: int,
    current_user: User = Depends(require_permission("invoices", "delete")),
    db: Session = Depends(get_db),
):
    s = _visible_sub(db, current_user, sub_id)
    s.status = "cancelled"
    s.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/generate-due")
def generate_due_invoices(
    current_user: User = Depends(require_permission("invoices", "create")),
    db: Session = Depends(get_db),
):
    """Create invoices for every active subscription whose next_invoice_date is due
    (<= today), then advance the schedule. Scoped to clients the user can see."""
    today = date.today()
    visible_ids = [row.id for row in scope_clients(db.query(Client.id), current_user, db).all()]
    due = db.query(Subscription).filter(
        Subscription.client_id.in_(visible_ids),
        Subscription.status == "active",
        Subscription.next_invoice_date <= today.isoformat(),
    ).all()

    created = []
    for s in due:
        label = s.description or "Recurring service"
        item = LineItemIn(description=label, quantity=1, unit_price=s.amount or 0)
        inv = build_invoice(
            db, current_user, client_id=s.client_id, service_id=s.service_id, subscription_id=s.id,
            currency=s.currency or "AED", issue_date=today.isoformat(), due_date=None,
            vat_rate=5.0, notes=f"Recurring ({s.interval}) invoice", items=[item],
        )
        # Advance the schedule from the date that was due (avoids drift).
        try:
            base = date.fromisoformat(s.next_invoice_date)
        except (TypeError, ValueError):
            base = today
        s.last_invoiced_date = today.isoformat()
        s.next_invoice_date = add_months(base, INTERVALS[s.interval]).isoformat()
        s.updated_at = datetime.utcnow()
        db.commit()
        created.append(invoice_to_dict(inv, with_items=False))

    return {"generated": len(created), "invoices": created}
