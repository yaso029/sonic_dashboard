"""Analytics & KPIs — per-client monthly marketing metrics with a summary
endpoint (time series + latest value + month-over-month delta) for dashboards."""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import KpiEntry, User
from backend.services.auth_service import get_current_user, require_permission

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

METRICS = [
    {"key": "followers", "label": "Followers", "unit": ""},
    {"key": "reach", "label": "Reach", "unit": ""},
    {"key": "impressions", "label": "Impressions", "unit": ""},
    {"key": "engagement", "label": "Engagement", "unit": ""},
    {"key": "website_visits", "label": "Website Visits", "unit": ""},
    {"key": "leads", "label": "Leads", "unit": ""},
    {"key": "conversions", "label": "Conversions", "unit": ""},
    {"key": "spend", "label": "Ad Spend", "unit": "AED"},
    {"key": "revenue", "label": "Revenue", "unit": "AED"},
    {"key": "roas", "label": "ROAS", "unit": "x"},
]
METRIC_KEYS = {m["key"] for m in METRICS}
CHANNELS = ["all", "instagram", "facebook", "linkedin", "tiktok", "google", "tiktok", "other"]


class EntryCreate(BaseModel):
    client_id: Optional[int] = None
    period: str               # YYYY-MM
    metric: str
    value: float = 0.0
    channel: Optional[str] = None
    note: Optional[str] = None


class EntryUpdate(BaseModel):
    period: Optional[str] = None
    metric: Optional[str] = None
    value: Optional[float] = None
    channel: Optional[str] = None
    note: Optional[str] = None


def to_dict(e: KpiEntry) -> dict:
    return {
        "id": e.id,
        "client_id": e.client_id,
        "client_name": e.client.company_name if e.client else None,
        "period": e.period,
        "metric": e.metric,
        "value": e.value,
        "channel": e.channel,
        "note": e.note,
    }


def _valid_period(p: str) -> bool:
    try:
        datetime.strptime(p, "%Y-%m")
        return True
    except (ValueError, TypeError):
        return False


def _recent_periods(n: int) -> list[str]:
    today = date.today()
    out = []
    y, m = today.year, today.month
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return list(reversed(out))


@router.get("/meta")
def meta(current_user: User = Depends(get_current_user)):
    return {"metrics": METRICS, "channels": CHANNELS}


@router.get("/entries")
def list_entries(
    client_id: Optional[int] = None,
    period: Optional[str] = None,
    metric: Optional[str] = None,
    current_user: User = Depends(require_permission("analytics", "read")),
    db: Session = Depends(get_db),
):
    q = db.query(KpiEntry)
    if client_id:
        q = q.filter(KpiEntry.client_id == client_id)
    if period:
        q = q.filter(KpiEntry.period == period)
    if metric:
        q = q.filter(KpiEntry.metric == metric)
    rows = q.order_by(KpiEntry.period.desc(), KpiEntry.metric).all()
    return [to_dict(e) for e in rows]


@router.post("/entries")
def create_entry(req: EntryCreate, current_user: User = Depends(require_permission("analytics", "create")), db: Session = Depends(get_db)):
    if not _valid_period(req.period):
        raise HTTPException(status_code=400, detail="Period must be YYYY-MM")
    if req.metric not in METRIC_KEYS:
        raise HTTPException(status_code=400, detail="Unknown metric")
    e = KpiEntry(
        client_id=req.client_id,
        period=req.period,
        metric=req.metric,
        value=req.value or 0.0,
        channel=(req.channel or None),
        note=req.note,
        created_by=current_user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return to_dict(e)


@router.put("/entries/{entry_id}")
def update_entry(entry_id: int, req: EntryUpdate, current_user: User = Depends(require_permission("analytics", "update")), db: Session = Depends(get_db)):
    e = db.query(KpiEntry).filter(KpiEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if req.period is not None:
        if not _valid_period(req.period):
            raise HTTPException(status_code=400, detail="Period must be YYYY-MM")
        e.period = req.period
    if req.metric is not None:
        if req.metric not in METRIC_KEYS:
            raise HTTPException(status_code=400, detail="Unknown metric")
        e.metric = req.metric
    if req.value is not None:
        e.value = req.value
    if req.channel is not None:
        e.channel = req.channel or None
    if req.note is not None:
        e.note = req.note
    e.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(e)
    return to_dict(e)


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, current_user: User = Depends(require_permission("analytics", "delete")), db: Session = Depends(get_db)):
    e = db.query(KpiEntry).filter(KpiEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.get("/summary")
def summary(
    client_id: Optional[int] = None,
    months: int = 6,
    current_user: User = Depends(require_permission("analytics", "read")),
    db: Session = Depends(get_db),
):
    months = max(1, min(int(months or 6), 24))
    periods = _recent_periods(months)
    q = db.query(KpiEntry).filter(KpiEntry.period.in_(periods))
    if client_id:
        q = q.filter(KpiEntry.client_id == client_id)
    rows = q.all()

    # totals[metric][period] = summed value (across channels / clients)
    totals: dict[str, dict[str, float]] = {}
    for e in rows:
        totals.setdefault(e.metric, {}).setdefault(e.period, 0.0)
        totals[e.metric][e.period] += (e.value or 0.0)

    out_metrics = []
    for m in METRICS:
        by_period = totals.get(m["key"], {})
        series = [{"period": p, "value": round(by_period.get(p, 0.0), 2)} for p in periods]
        latest = series[-1]["value"] if series else 0.0
        previous = series[-2]["value"] if len(series) >= 2 else 0.0
        delta = None
        if previous:
            delta = round((latest - previous) / previous * 100, 1)
        has_data = any(v > 0 for v in by_period.values())
        out_metrics.append({**m, "series": series, "latest": latest, "previous": previous, "delta": delta, "has_data": has_data})

    return {"periods": periods, "metrics": out_metrics}
