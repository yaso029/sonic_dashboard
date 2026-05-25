"""Billing — Stripe config/webhook + revenue & AR-aging reports."""
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Invoice, Payment, Client, User
from backend.services.auth_service import get_current_user, require_permission
from backend.api.clients import scope_query as scope_clients
from backend.api.invoices import _round, _is_overdue
from backend.api.payments import _apply_payment
from backend.services import stripe_service

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/config")
def billing_config(current_user: User = Depends(get_current_user)):
    """Tells the frontend whether Stripe card payments are available and exposes
    the publishable key (safe to send to the browser)."""
    return {
        "stripe_enabled": stripe_service.is_configured(),
        "publishable_key": os.environ.get("STRIPE_PUBLISHABLE_KEY", "") if stripe_service.is_configured() else "",
        "currency_default": "AED",
    }


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Signature-verified Stripe webhook. Optional — the /sync-stripe endpoint
    covers local setups without a public URL. Handles payment_intent.succeeded."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_service.construct_webhook_event(payload, sig)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook signature: {e}")

    if event["type"] == "payment_intent.succeeded":
        pi = event["data"]["object"]
        inv = db.query(Invoice).filter(Invoice.stripe_payment_intent_id == pi["id"]).first()
        if inv:
            already = db.query(Payment).filter(
                Payment.invoice_id == inv.id, Payment.stripe_payment_intent_id == pi["id"]
            ).first()
            if not already:
                amount = (pi.get("amount_received") or pi.get("amount") or 0) / 100.0
                _apply_payment(db, inv, amount, "stripe", "Stripe webhook",
                               date.today().isoformat(), None, stripe_pi=pi["id"])
    return {"received": True}


@router.get("/reports")
def billing_reports(
    current_user: User = Depends(require_permission("invoices", "read")),
    db: Session = Depends(get_db),
):
    """Revenue summary + accounts-receivable aging, scoped to visible clients."""
    visible_ids = [row.id for row in scope_clients(db.query(Client.id), current_user, db).all()]
    invoices = db.query(Invoice).filter(Invoice.client_id.in_(visible_ids)).all()

    total_invoiced = total_collected = total_outstanding = vat_collected = 0.0
    status_counts = {}
    aging = {"current": 0.0, "1_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    today = date.today()

    for inv in invoices:
        status_counts[inv.status] = status_counts.get(inv.status, 0) + 1
        if inv.status == "void":
            continue
        total_invoiced = _round(total_invoiced + (inv.total or 0))
        total_collected = _round(total_collected + (inv.amount_paid or 0))
        if inv.status == "paid":
            vat_collected = _round(vat_collected + (inv.vat_amount or 0))
        balance = _round((inv.total or 0) - (inv.amount_paid or 0))
        if balance <= 0 or inv.status in ("paid", "draft"):
            continue
        total_outstanding = _round(total_outstanding + balance)
        # Aging bucket by days past due_date
        days_past = -1
        if inv.due_date:
            try:
                days_past = (today - date.fromisoformat(inv.due_date)).days
            except ValueError:
                days_past = -1
        if days_past <= 0:
            aging["current"] = _round(aging["current"] + balance)
        elif days_past <= 30:
            aging["1_30"] = _round(aging["1_30"] + balance)
        elif days_past <= 60:
            aging["31_60"] = _round(aging["31_60"] + balance)
        elif days_past <= 90:
            aging["61_90"] = _round(aging["61_90"] + balance)
        else:
            aging["90_plus"] = _round(aging["90_plus"] + balance)

    overdue_amount = _round(aging["1_30"] + aging["31_60"] + aging["61_90"] + aging["90_plus"])
    return {
        "currency": "AED",
        "total_invoiced": total_invoiced,
        "total_collected": total_collected,
        "total_outstanding": total_outstanding,
        "overdue_amount": overdue_amount,
        "vat_collected": vat_collected,
        "invoice_count": len([i for i in invoices if i.status != "void"]),
        "status_counts": status_counts,
        "aging": aging,
    }
