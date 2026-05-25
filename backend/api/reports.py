"""Client Reports — management dashboard aggregations.

Single endpoint powering the CRM "Client Reports" page. It returns KPIs, a
revenue trend, top clients, client-status breakdowns, derived UAE compliance
deadlines (VAT / corporate tax / trade-license renewal / missing TRN), task
operations + team workload, recent activity and inactive clients.

Every figure respects the caller's client visibility scope — the same
role-based rules the Clients module uses (see api/clients.scope_query), so an
marketing_specialist only sees their own book while admins see the whole firm.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import (
    Client, Service, Task, Invoice, Payment, Document, User,
)
from backend.services.auth_service import require_permission
from backend.api.clients import scope_query as scope_clients

router = APIRouter(prefix="/api/reports", tags=["reports"])

OPEN_TASK_STATES = ("todo", "in_progress", "blocked")
TASK_STATES = ("todo", "in_progress", "blocked", "done")
URGENT_PRIORITIES = ("high", "urgent")
ACCOUNTING_ROLES = ("admin", "marketing_manager", "marketing_specialist", "analyst",
                    "social_media_specialist", "seo_specialist")


# ─── Small helpers ─────────────────────────────────────────────────────────────

def _r(x) -> float:
    return round(float(x or 0), 2)


def _parse(d) -> Optional[date]:
    if not d:
        return None
    try:
        return date.fromisoformat(str(d)[:10])
    except (ValueError, TypeError):
        return None


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, last))


def _safe_date(year: int, month: int, day: int) -> date:
    last = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(day, last))


def _trend_pct(curr: float, prev: float):
    if prev and prev > 0:
        return _r((curr - prev) / prev * 100)
    if curr > 0:
        return None  # no baseline to compare against
    return 0.0


# ─── Compliance deadline derivation (from each client's tax profile) ───────────

def _classify(deadline: date, today: date) -> str:
    days = (deadline - today).days
    if days < 0:
        return "overdue"
    if days <= 30:
        return "urgent"
    return "upcoming"


def _deadline(c: Client, dtype: str, deadline: date, today: date) -> dict:
    return {
        "client_id": c.id,
        "client": c.company_name,
        "type": dtype,
        "due_date": deadline.isoformat(),
        "status": _classify(deadline, today),
        "days": (deadline - today).days,
    }


def _compliance_for_client(c: Client, today: date) -> list[dict]:
    out: list[dict] = []
    has_trn = bool((c.trn or "").strip())

    # Missing TRN — flagged as an action item (no due date).
    if not has_trn:
        out.append({
            "client_id": c.id, "client": c.company_name, "type": "Missing TRN",
            "due_date": None, "status": "action_required", "days": None,
        })

    # VAT filing — only TRN-registered clients. Alternate monthly / quarterly
    # cadence by client id so deadlines vary realistically across the book.
    if has_trn:
        if c.id % 2 == 0:  # quarterly filer
            period_ends = [_safe_date(today.year, m, d) for (m, d) in
                           ((3, 31), (6, 30), (9, 30), (12, 31))] + [date(today.year + 1, 3, 31)]
        else:              # monthly filer
            first_of_month = date(today.year, today.month, 1)
            nxt = _add_months(first_of_month, 1)
            period_ends = [nxt - timedelta(days=1), _add_months(nxt, 1) - timedelta(days=1)]
        for pe in period_ends:
            deadline = pe + timedelta(days=28)  # UAE: file within 28 days of period end
            if deadline >= today - timedelta(days=20):
                out.append(_deadline(c, "SEO", deadline, today))
                break

    # Paid Advertising — return due 9 months after the financial year end.
    if c.fiscal_year_end_month:
        candidates = sorted(
            _add_months(_safe_date(yr, c.fiscal_year_end_month, c.fiscal_year_end_day or 31), 9)
            for yr in (today.year - 1, today.year, today.year + 1)
        )
        ct = next((d for d in candidates if d >= today - timedelta(days=30)), candidates[-1])
        out.append(_deadline(c, "Paid Advertising", ct, today))

    # Trade license renewal — annual, on the anniversary of onboarding.
    if (c.trade_license_number or "").strip() and c.created_at:
        base = c.created_at.date()
        for yr in (today.year, today.year + 1):
            renewal = _safe_date(yr, base.month, base.day)
            if renewal >= today - timedelta(days=20):
                out.append(_deadline(c, "Trade License Renewal", renewal, today))
                break

    return out


# ─── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/clients")
def client_reports(
    start: Optional[str] = Query(None, description="YYYY-MM-DD; defaults to 6 months ago"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD; defaults to today"),
    current_user: User = Depends(require_permission("clients", "read")),
    db: Session = Depends(get_db),
):
    today = date.today()
    end_d = _parse(end) or today
    start_d = _parse(start) or _add_months(date(today.year, today.month, 1), -5)
    if start_d > end_d:
        start_d, end_d = end_d, start_d
    period_len = (end_d - start_d).days
    prev_end = start_d - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_len)

    # Visible clients (role-scoped) and their related rows.
    visible = scope_clients(db.query(Client), current_user, db).all()
    visible_ids = [c.id for c in visible]
    name_of = {c.id: c.company_name for c in visible}

    invoices = (db.query(Invoice).filter(Invoice.client_id.in_(visible_ids)).all()
                if visible_ids else [])
    inv_ids = [i.id for i in invoices]
    inv_client = {i.id: i.client_id for i in invoices}
    payments = (db.query(Payment).filter(Payment.invoice_id.in_(inv_ids)).all()
                if inv_ids else [])
    tasks = (db.query(Task).filter(Task.client_id.in_(visible_ids)).all()
             if visible_ids else [])

    # ── Month buckets across the selected range (cap at 12 for readability) ────
    months: list[tuple[int, int]] = []
    yy, mm = start_d.year, start_d.month
    while (yy, mm) <= (end_d.year, end_d.month):
        months.append((yy, mm))
        mm += 1
        if mm > 12:
            mm, yy = 1, yy + 1
    months = months[-12:]
    month_set = set(months)
    invoiced_m = defaultdict(float)
    collected_m = defaultdict(float)

    # ── Walk invoices once: revenue, outstanding, overdue, per-client rollups ──
    total_revenue = prev_revenue = 0.0
    total_outstanding = overdue_amount = 0.0
    overdue_count = 0
    client_revenue = defaultdict(float)
    client_outstanding = defaultdict(float)
    client_overdue = defaultdict(bool)
    client_last_inv: dict[int, date] = {}

    for inv in invoices:
        if inv.status == "void":
            continue
        issue = _parse(inv.issue_date)
        total = inv.total or 0.0
        if issue:
            if (issue.year, issue.month) in month_set:
                invoiced_m[(issue.year, issue.month)] += total
            if start_d <= issue <= end_d:
                total_revenue += total
                client_revenue[inv.client_id] += total
            if prev_start <= issue <= prev_end:
                prev_revenue += total
            prev = client_last_inv.get(inv.client_id)
            if prev is None or issue > prev:
                client_last_inv[inv.client_id] = issue

        balance = (inv.total or 0.0) - (inv.amount_paid or 0.0)
        if inv.status in ("sent", "partially_paid") and balance > 0:
            total_outstanding += balance
            client_outstanding[inv.client_id] += balance
            due = _parse(inv.due_date)
            if due and due < today:
                overdue_amount += balance
                overdue_count += 1
                client_overdue[inv.client_id] = True

    # ── Walk payments once: collections trend + per-client last payment ────────
    total_collected = 0.0
    month_collections = prev_month_collections = 0.0
    client_last_pay: dict[int, date] = {}
    cur_ym = (today.year, today.month)
    prev_ym = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)

    for p in payments:
        paid = _parse(p.paid_at) or (p.created_at.date() if p.created_at else None)
        amt = p.amount or 0.0
        if not paid:
            continue
        if (paid.year, paid.month) in month_set:
            collected_m[(paid.year, paid.month)] += amt
        if start_d <= paid <= end_d:
            total_collected += amt
        if (paid.year, paid.month) == cur_ym:
            month_collections += amt
        if (paid.year, paid.month) == prev_ym:
            prev_month_collections += amt
        cid = inv_client.get(p.invoice_id)
        if cid is not None:
            prev = client_last_pay.get(cid)
            if prev is None or paid > prev:
                client_last_pay[cid] = paid

    monthly_series = [{
        "month": f"{y:04d}-{m:02d}",
        "label": date(y, m, 1).strftime("%b"),
        "invoiced": _r(invoiced_m.get((y, m), 0.0)),
        "collected": _r(collected_m.get((y, m), 0.0)),
        "outstanding": _r(max(invoiced_m.get((y, m), 0.0) - collected_m.get((y, m), 0.0), 0.0)),
    } for (y, m) in months]

    # ── Compliance deadlines (active + paused clients) ─────────────────────────
    deadlines: list[dict] = []
    for c in visible:
        if c.status == "archived":
            continue
        deadlines.extend(_compliance_for_client(c, today))
    # Keep the table focused: recently overdue, or due within the next ~9 months
    # (wide enough to surface annual corporate-tax deadlines), plus action items.
    def _keep(d):
        if d["status"] == "action_required":
            return True
        return d["days"] is not None and -90 <= d["days"] <= 280
    deadlines = [d for d in deadlines if _keep(d)]
    deadlines.sort(key=lambda d: (d["days"] if d["days"] is not None else 9999))

    comp_summary = {
        "vat_due": sum(1 for d in deadlines if d["type"] == "SEO"),
        "ct_due": sum(1 for d in deadlines if d["type"] == "Paid Advertising"),
        "license_renewals": sum(1 for d in deadlines if d["type"] == "Trade License Renewal"),
        "missing_trn": sum(1 for d in deadlines if d["type"] == "Missing TRN"),
        "overdue": sum(1 for d in deadlines if d["status"] == "overdue"),
        "urgent": sum(1 for d in deadlines if d["status"] == "urgent"),
    }
    upcoming_vat = sum(1 for d in deadlines if d["type"] == "SEO"
                       and d["status"] in ("urgent", "upcoming")
                       and d["days"] is not None and d["days"] <= 60)

    # ── Client status breakdowns ───────────────────────────────────────────────
    status_counts = {"active": 0, "paused": 0, "archived": 0}
    for c in visible:
        status_counts[c.status] = status_counts.get(c.status, 0) + 1

    by_service_type: list[dict] = []
    if visible_ids:
        rows = (db.query(Service.service_type, func.count(Service.id))
                .filter(Service.client_id.in_(visible_ids))
                .group_by(Service.service_type).all())
        by_service_type = sorted(
            ({"type": t, "count": n} for t, n in rows),
            key=lambda x: x["count"], reverse=True,
        )

    accountant_name = {u.id: u.full_name for u in db.query(User).all()}
    by_accountant: list[dict] = []
    acc_counts = defaultdict(int)
    for c in visible:
        if c.status == "archived":
            continue
        acc_counts[c.assigned_accountant_id] += 1
    for aid, n in acc_counts.items():
        by_accountant.append({"marketing_specialist": accountant_name.get(aid, "Unassigned"), "count": n})
    by_accountant.sort(key=lambda x: x["count"], reverse=True)

    # ── Top clients by revenue (within range); outstanding is a live snapshot ──
    top_clients = []
    for cid, rev in client_revenue.items():
        lp = client_last_pay.get(cid)
        top_clients.append({
            "client_id": cid,
            "name": name_of.get(cid, f"Client #{cid}"),
            "total_revenue": _r(rev),
            "outstanding": _r(client_outstanding.get(cid, 0.0)),
            "last_payment_date": lp.isoformat() if lp else None,
        })
    top_clients.sort(key=lambda x: x["total_revenue"], reverse=True)
    top_clients = top_clients[:10]

    # ── Tasks & operations ─────────────────────────────────────────────────────
    open_tasks = overdue_tasks = completed_tasks = high_priority = 0
    status_task_counts = {s: 0 for s in TASK_STATES}
    workload = defaultdict(lambda: {"open": 0, "completed": 0, "urgent": 0})
    for t in tasks:
        status_task_counts[t.status] = status_task_counts.get(t.status, 0) + 1
        is_open = t.status in OPEN_TASK_STATES
        if is_open:
            open_tasks += 1
            due = _parse(t.due_date)
            if due and due < today:
                overdue_tasks += 1
            if t.priority in URGENT_PRIORITIES:
                high_priority += 1
        if t.status == "done":
            completed_tasks += 1
        if t.assigned_to:
            w = workload[t.assigned_to]
            if is_open:
                w["open"] += 1
            if t.status == "done":
                w["completed"] += 1
            if is_open and t.priority == "urgent":
                w["urgent"] += 1

    team_workload = [{
        "marketing_specialist": accountant_name.get(aid, f"User #{aid}"),
        "open": w["open"], "completed": w["completed"], "urgent": w["urgent"],
    } for aid, w in workload.items()]
    team_workload.sort(key=lambda x: x["open"], reverse=True)

    by_status = [{"status": s, "count": status_task_counts.get(s, 0)} for s in TASK_STATES]

    # ── Recent activity (document uploads + payments received) ─────────────────
    activity: list[dict] = []
    if visible_ids:
        docs = (db.query(Document).filter(Document.client_id.in_(visible_ids))
                .order_by(Document.created_at.desc()).limit(10).all())
        for d in docs:
            activity.append({
                "type": "document",
                "title": f"Document uploaded · {d.file_name}",
                "subtitle": name_of.get(d.client_id, "—"),
                "date": d.created_at.isoformat() if d.created_at else None,
            })
    recent_pays = sorted(payments, key=lambda p: (p.paid_at or ""), reverse=True)[:10]
    for p in recent_pays:
        cid = inv_client.get(p.invoice_id)
        activity.append({
            "type": "payment",
            "title": f"Payment received · AED {_r(p.amount):,.0f}",
            "subtitle": name_of.get(cid, "—"),
            "date": p.paid_at or (p.created_at.isoformat() if p.created_at else None),
        })
    activity.sort(key=lambda a: (a["date"] or ""), reverse=True)
    activity = activity[:12]

    # ── Inactive clients (active/paused, stale or with overdue invoices) ───────
    inactive: list[dict] = []
    for c in visible:
        if c.status == "archived":
            continue
        last = c.updated_at.date() if c.updated_at else (c.created_at.date() if c.created_at else None)
        for cand in (client_last_inv.get(c.id), client_last_pay.get(c.id)):
            if cand and (last is None or cand > last):
                last = cand
        days_idle = (today - last).days if last else None
        has_overdue = client_overdue.get(c.id, False)
        if has_overdue or (days_idle is not None and days_idle >= 60):
            reason = "Overdue invoice" if has_overdue else f"No activity for {days_idle} days"
            inactive.append({
                "client_id": c.id,
                "name": c.company_name,
                "last_activity": last.isoformat() if last else None,
                "days_idle": days_idle,
                "outstanding": _r(client_outstanding.get(c.id, 0.0)),
                "reason": reason,
            })
    inactive.sort(key=lambda x: (0 if x["reason"] == "Overdue invoice" else 1,
                                 -(x["days_idle"] or 0)))
    inactive = inactive[:12]

    return {
        "currency": "AED",
        "generated_at": datetime.utcnow().isoformat(),
        "range": {"start": start_d.isoformat(), "end": end_d.isoformat()},
        "kpis": {
            "active_clients": status_counts["active"],
            "new_clients_period": sum(
                1 for c in visible
                if c.status != "archived" and c.created_at
                and start_d <= c.created_at.date() <= end_d),
            "total_revenue": _r(total_revenue),
            "total_revenue_trend_pct": _trend_pct(total_revenue, prev_revenue),
            "outstanding": _r(total_outstanding),
            "overdue_amount": _r(overdue_amount),
            "overdue_invoice_count": overdue_count,
            "upcoming_vat_filings": upcoming_vat,
            "overdue_tasks": overdue_tasks,
            "open_tasks": open_tasks,
            "monthly_collections": _r(month_collections),
            "monthly_collections_trend_pct": _trend_pct(month_collections, prev_month_collections),
            "total_collected": _r(total_collected),
        },
        "revenue": {
            "monthly": monthly_series,
            "top_clients": top_clients,
        },
        "client_status": {
            "active": status_counts["active"],
            "paused": status_counts["paused"],
            "archived": status_counts["archived"],
            "by_service_type": by_service_type,
            "by_accountant": by_accountant,
        },
        "compliance": {
            "summary": comp_summary,
            "deadlines": deadlines[:40],
        },
        "tasks": {
            "open": open_tasks,
            "overdue": overdue_tasks,
            "completed": completed_tasks,
            "high_priority": high_priority,
            "by_status": by_status,
            "team_workload": team_workload,
        },
        "activity": {
            "recent": activity,
            "inactive_clients": inactive,
        },
    }
