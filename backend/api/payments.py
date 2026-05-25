"""Payments — manual payment recording + optional Stripe (test mode) card flow.

Per-invoice endpoints. Manual recording always works offline. Stripe endpoints
return 503 when Stripe isn't configured, so the module degrades gracefully.

Local reconciliation: /payment-intent creates a Stripe PaymentIntent and returns
its client_secret; after the customer pays, /sync-stripe polls the PaymentIntent
and records the payment — no public webhook URL required. A signature-verified
webhook is also provided (api/billing.py) for tunnel/`stripe listen` setups.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

from backend.database.db import get_db
from backend.database.models import Invoice, Payment, Client, User
from backend.services.auth_service import require_permission
from backend.api.invoices import get_visible_invoice, reconcile_status, invoice_to_dict, _round
from backend.services import stripe_service

router = APIRouter(prefix="/api/invoices", tags=["payments"])

PAYMENT_METHODS = ["cash", "bank_transfer", "card", "cheque", "stripe", "other"]


class PaymentIn(BaseModel):
    amount: float
    method: str = "bank_transfer"
    reference: Optional[str] = None
    paid_at: Optional[str] = None


def _apply_payment(db: Session, inv: Invoice, amount: float, method: str, reference: Optional[str],
                   paid_at: Optional[str], user_id: Optional[int], stripe_pi: Optional[str] = None):
    pay = Payment(
        invoice_id=inv.id, amount=_round(amount), method=method, reference=reference,
        paid_at=paid_at or date.today().isoformat(), recorded_by=user_id,
        stripe_payment_intent_id=stripe_pi, currency=inv.currency,
    )
    db.add(pay)
    inv.amount_paid = _round((inv.amount_paid or 0) + amount)
    reconcile_status(inv)
    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return pay


@router.post("/{invoice_id}/payments")
def record_payment(
    invoice_id: int,
    req: PaymentIn,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status in ("draft", "void"):
        raise HTTPException(status_code=409, detail="Send the invoice before recording payment")
    if req.method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail=f"Invalid method. One of: {PAYMENT_METHODS}")
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    balance = _round((inv.total or 0) - (inv.amount_paid or 0))
    if req.amount > balance + 0.01:
        raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding balance ({balance})")
    _apply_payment(db, inv, req.amount, req.method, req.reference, req.paid_at, current_user.id)
    return invoice_to_dict(inv)


@router.post("/{invoice_id}/payment-intent")
def create_payment_intent(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured (set STRIPE_SECRET_KEY, test mode)")
    inv = get_visible_invoice(db, current_user, invoice_id)
    if inv.status in ("draft", "void", "paid"):
        raise HTTPException(status_code=409, detail=f"Cannot collect payment for a {inv.status} invoice")
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
            metadata={"invoice_id": str(inv.id), "invoice_number": inv.invoice_number},
        )
    except stripe_service.StripeLiveKeyRefused as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    inv.stripe_payment_intent_id = pi["id"]
    db.commit()
    return {"client_secret": pi["client_secret"], "payment_intent_id": pi["id"], "amount": balance}


@router.post("/{invoice_id}/sync-stripe")
def sync_stripe(
    invoice_id: int,
    current_user: User = Depends(require_permission("invoices", "update")),
    db: Session = Depends(get_db),
):
    """Poll the invoice's Stripe PaymentIntent and record the payment if it
    succeeded. Lets the local (webhook-less) flow reconcile on demand."""
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    inv = get_visible_invoice(db, current_user, invoice_id)
    if not inv.stripe_payment_intent_id:
        raise HTTPException(status_code=400, detail="No Stripe payment intent on this invoice")

    # Idempotency: skip if we already recorded this PaymentIntent.
    already = db.query(Payment).filter(
        Payment.invoice_id == inv.id,
        Payment.stripe_payment_intent_id == inv.stripe_payment_intent_id,
    ).first()
    if already:
        return {"status": "already_recorded", "invoice": invoice_to_dict(inv)}

    try:
        pi = stripe_service.retrieve_payment_intent(inv.stripe_payment_intent_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    if pi["status"] != "succeeded":
        return {"status": pi["status"], "invoice": invoice_to_dict(inv)}

    amount = (pi.get("amount_received") or 0) / 100.0
    _apply_payment(db, inv, amount, "stripe", "Stripe card payment",
                   date.today().isoformat(), current_user.id, stripe_pi=inv.stripe_payment_intent_id)
    return {"status": "recorded", "invoice": invoice_to_dict(inv)}
