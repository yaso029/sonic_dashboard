"""Company Expenses — internal invoices entered one by one, each in USD or SYP.

A period summary returns two separate totals (USD and SYP) and two daily series
(one per currency) for charting. Gated by the 'expenses' permission resource
(managers/admin by default; grantable per-user)."""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Expense, User
from backend.services.auth_service import get_current_user, require_permission

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

CURRENCIES = ["USD", "SYP"]
CATEGORY_SUGGESTIONS = ["Rent", "Salaries", "Advertising", "Software", "Equipment", "Utilities", "Travel", "Taxes", "Other"]


class ExpenseCreate(BaseModel):
    title: str
    amount: float = 0.0
    currency: str = "USD"
    date: str                       # YYYY-MM-DD
    category: Optional[str] = None
    note: Optional[str] = None


class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None


def to_dict(e: Expense) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "category": e.category,
        "amount": e.amount,
        "currency": e.currency,
        "date": e.date,
        "note": e.note,
        "created_by_name": e.creator.full_name if e.creator else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def _valid_date(d: str) -> bool:
    try:
        datetime.strptime(d, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def _month_bounds():
    today = date.today()
    start = today.replace(day=1).isoformat()
    return start, today.isoformat()


@router.get("/meta")
def meta(current_user: User = Depends(require_permission("expenses", "read"))):
    return {"currencies": CURRENCIES, "categories": CATEGORY_SUGGESTIONS}


@router.get("")
def list_expenses(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    currency: Optional[str] = None,
    category: Optional[str] = None,
    current_user: User = Depends(require_permission("expenses", "read")),
    db: Session = Depends(get_db),
):
    q = db.query(Expense)
    if date_from:
        q = q.filter(Expense.date >= date_from)
    if date_to:
        q = q.filter(Expense.date <= date_to)
    if currency:
        q = q.filter(Expense.currency == currency)
    if category:
        q = q.filter(Expense.category == category)
    rows = q.order_by(Expense.date.desc(), Expense.id.desc()).all()
    return [to_dict(e) for e in rows]


@router.post("")
def create_expense(req: ExpenseCreate, current_user: User = Depends(require_permission("expenses", "create")), db: Session = Depends(get_db)):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if req.currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="Currency must be USD or SYP")
    if not _valid_date(req.date):
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
    e = Expense(
        title=req.title.strip()[:300],
        category=(req.category or None),
        amount=float(req.amount or 0),
        currency=req.currency,
        date=req.date,
        note=req.note,
        created_by=current_user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return to_dict(e)


@router.put("/{expense_id}")
def update_expense(expense_id: int, req: ExpenseUpdate, current_user: User = Depends(require_permission("expenses", "update")), db: Session = Depends(get_db)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    if req.currency is not None:
        if req.currency not in CURRENCIES:
            raise HTTPException(status_code=400, detail="Currency must be USD or SYP")
        e.currency = req.currency
    if req.date is not None:
        if not _valid_date(req.date):
            raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD")
        e.date = req.date
    if req.title is not None:
        e.title = req.title.strip()[:300]
    if req.amount is not None:
        e.amount = float(req.amount)
    if req.category is not None:
        e.category = req.category or None
    if req.note is not None:
        e.note = req.note
    e.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(e)
    return to_dict(e)


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, current_user: User = Depends(require_permission("expenses", "delete")), db: Session = Depends(get_db)):
    e = db.query(Expense).filter(Expense.id == expense_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def summary(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(require_permission("expenses", "read")),
    db: Session = Depends(get_db),
):
    if not date_from or not date_to:
        date_from, date_to = _month_bounds()
    rows = (
        db.query(Expense)
        .filter(Expense.date >= date_from, Expense.date <= date_to)
        .order_by(Expense.date.asc())
        .all()
    )
    totals = {c: 0.0 for c in CURRENCIES}
    counts = {c: 0 for c in CURRENCIES}
    by_day = {c: {} for c in CURRENCIES}  # currency -> {date: total}
    for e in rows:
        cur = e.currency if e.currency in CURRENCIES else "USD"
        totals[cur] += (e.amount or 0.0)
        counts[cur] += 1
        by_day[cur][e.date] = by_day[cur].get(e.date, 0.0) + (e.amount or 0.0)

    series = {
        c: [{"date": d, "total": round(v, 2)} for d, v in sorted(by_day[c].items())]
        for c in CURRENCIES
    }
    return {
        "date_from": date_from,
        "date_to": date_to,
        "totals": {c: round(totals[c], 2) for c in CURRENCIES},
        "counts": counts,
        "series": series,
    }
