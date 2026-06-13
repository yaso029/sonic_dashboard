"""Internal Invoices ("Bills") — paid invoices entered one by one with monthly
separation, dual-currency totals, charts, and renewal reminders for recurring
subscriptions (monthly/yearly). Distinct from `invoices` (client billing) and
`expenses` (general one-off internal expenses)."""
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Bill, User
from backend.services.auth_service import get_current_user, require_permission

router = APIRouter(prefix="/api/bills", tags=["bills"])

CURRENCIES = ["USD", "SYP"]
RECURRENCES = ["none", "monthly", "yearly"]
CATEGORY_SUGGESTIONS = ["Hosting", "Domain", "Software", "Subscription", "SaaS", "Ads", "Email", "Storage", "API", "Other"]


class BillCreate(BaseModel):
    title: str
    vendor: Optional[str] = None
    category: Optional[str] = None
    amount: float = 0.0
    currency: str = "USD"
    invoice_date: str
    recurrence: Optional[str] = "none"
    expires_at: Optional[str] = None
    reminder_days: Optional[int] = 7
    note: Optional[str] = None


class BillUpdate(BaseModel):
    title: Optional[str] = None
    vendor: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    invoice_date: Optional[str] = None
    recurrence: Optional[str] = None
    expires_at: Optional[str] = None
    reminder_days: Optional[int] = None
    note: Optional[str] = None


def _valid_date(d: str) -> bool:
    try:
        datetime.strptime(d, "%Y-%m-%d"); return True
    except (ValueError, TypeError):
        return False


def to_dict(b: Bill) -> dict:
    days_left = None
    if b.expires_at:
        try:
            days_left = (date.fromisoformat(b.expires_at) - date.today()).days
        except ValueError:
            days_left = None
    return {
        "id": b.id,
        "title": b.title,
        "vendor": b.vendor,
        "category": b.category,
        "amount": b.amount,
        "currency": b.currency,
        "invoice_date": b.invoice_date,
        "recurrence": b.recurrence,
        "expires_at": b.expires_at,
        "reminder_days": b.reminder_days,
        "days_left": days_left,
        "note": b.note,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def _month_bounds():
    today = date.today()
    start = today.replace(day=1).isoformat()
    return start, today.isoformat()


@router.get("/meta")
def meta(current_user: User = Depends(require_permission("bills", "read"))):
    return {"currencies": CURRENCIES, "recurrences": RECURRENCES, "categories": CATEGORY_SUGGESTIONS}


@router.get("")
def list_bills(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    currency: Optional[str] = None,
    recurrence: Optional[str] = None,
    current_user: User = Depends(require_permission("bills", "read")),
    db: Session = Depends(get_db),
):
    q = db.query(Bill)
    if date_from:
        q = q.filter(Bill.invoice_date >= date_from)
    if date_to:
        q = q.filter(Bill.invoice_date <= date_to)
    if currency:
        q = q.filter(Bill.currency == currency)
    if recurrence:
        q = q.filter(Bill.recurrence == recurrence)
    rows = q.order_by(Bill.invoice_date.desc(), Bill.id.desc()).all()
    return [to_dict(b) for b in rows]


@router.post("")
def create_bill(req: BillCreate, current_user: User = Depends(require_permission("bills", "create")), db: Session = Depends(get_db)):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if req.currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="Currency must be USD or SYP")
    if req.recurrence and req.recurrence not in RECURRENCES:
        raise HTTPException(status_code=400, detail="Invalid recurrence")
    if not _valid_date(req.invoice_date):
        raise HTTPException(status_code=400, detail="Invoice date must be YYYY-MM-DD")
    if req.expires_at and not _valid_date(req.expires_at):
        raise HTTPException(status_code=400, detail="Expires-at must be YYYY-MM-DD")
    b = Bill(
        title=req.title.strip()[:300],
        vendor=(req.vendor or None),
        category=(req.category or None),
        amount=float(req.amount or 0),
        currency=req.currency,
        invoice_date=req.invoice_date,
        recurrence=req.recurrence or "none",
        expires_at=req.expires_at or None,
        reminder_days=max(0, min(int(req.reminder_days or 7), 365)),
        note=req.note,
        created_by=current_user.id,
    )
    db.add(b); db.commit(); db.refresh(b)
    return to_dict(b)


@router.put("/{bill_id}")
def update_bill(bill_id: int, req: BillUpdate, current_user: User = Depends(require_permission("bills", "update")), db: Session = Depends(get_db)):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    if req.currency is not None:
        if req.currency not in CURRENCIES: raise HTTPException(400, "Currency must be USD or SYP")
        b.currency = req.currency
    if req.recurrence is not None:
        if req.recurrence not in RECURRENCES: raise HTTPException(400, "Invalid recurrence")
        b.recurrence = req.recurrence
    if req.invoice_date is not None:
        if not _valid_date(req.invoice_date): raise HTTPException(400, "Invoice date must be YYYY-MM-DD")
        b.invoice_date = req.invoice_date
    if req.expires_at is not None:
        if req.expires_at and not _valid_date(req.expires_at): raise HTTPException(400, "Expires-at must be YYYY-MM-DD")
        b.expires_at = req.expires_at or None
        b.last_reminded_at = None  # reset reminder so the new date can fire
    for f in ("title", "vendor", "category", "note"):
        v = getattr(req, f)
        if v is not None:
            setattr(b, f, v or None)
    if req.amount is not None:
        b.amount = float(req.amount)
    if req.reminder_days is not None:
        b.reminder_days = max(0, min(int(req.reminder_days), 365))
    b.updated_at = datetime.utcnow()
    db.commit(); db.refresh(b)
    return to_dict(b)


@router.delete("/{bill_id}")
def delete_bill(bill_id: int, current_user: User = Depends(require_permission("bills", "delete")), db: Session = Depends(get_db)):
    b = db.query(Bill).filter(Bill.id == bill_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    db.delete(b); db.commit()
    return {"ok": True}


@router.get("/summary")
def summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(require_permission("bills", "read")),
    db: Session = Depends(get_db),
):
    if not date_from or not date_to:
        date_from, date_to = _month_bounds()
    rows = (
        db.query(Bill)
        .filter(Bill.invoice_date >= date_from, Bill.invoice_date <= date_to)
        .order_by(Bill.invoice_date.asc())
        .all()
    )
    totals = {c: 0.0 for c in CURRENCIES}
    counts = {c: 0 for c in CURRENCIES}
    by_day = {c: {} for c in CURRENCIES}
    for b in rows:
        cur = b.currency if b.currency in CURRENCIES else "USD"
        totals[cur] += (b.amount or 0.0)
        counts[cur] += 1
        by_day[cur][b.invoice_date] = by_day[cur].get(b.invoice_date, 0.0) + (b.amount or 0.0)
    series = {
        c: [{"date": d, "total": round(v, 2)} for d, v in sorted(by_day[c].items())]
        for c in CURRENCIES
    }
    return {
        "date_from": date_from, "date_to": date_to,
        "totals": {c: round(totals[c], 2) for c in CURRENCIES},
        "counts": counts, "series": series,
    }


@router.get("/upcoming")
def upcoming_renewals(
    within_days: int = 30,
    current_user: User = Depends(require_permission("bills", "read")),
    db: Session = Depends(get_db),
):
    """Bills with an expires_at within the next `within_days` days (or already
    expired in the last 30 days), grouped by status: due / soon / expired."""
    today = date.today()
    horizon = today + timedelta(days=max(1, within_days))
    rows = (
        db.query(Bill)
        .filter(Bill.expires_at != None)
        .order_by(Bill.expires_at.asc())
        .all()
    )
    out = []
    for b in rows:
        try:
            exp = date.fromisoformat(b.expires_at)
        except ValueError:
            continue
        days_left = (exp - today).days
        if days_left < -30:
            continue
        if days_left > within_days:
            continue
        bucket = "expired" if days_left < 0 else ("due" if days_left <= (b.reminder_days or 7) else "soon")
        d = to_dict(b)
        d["bucket"] = bucket
        out.append(d)
    return out
