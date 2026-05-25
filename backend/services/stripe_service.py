"""Phase 5 — Stripe integration (TEST MODE ONLY, optional).

Design constraints for this local-first project:
- Stripe is *optional*: with no STRIPE_SECRET_KEY set the whole billing module
  still works in manual mode. Endpoints that need Stripe raise StripeNotConfigured
  (-> HTTP 503) instead of crashing.
- TEST MODE ONLY: a live key (sk_live_…) is refused outright, so this code can
  never move real money. Use sk_test_… keys.
- Local amounts are the source of truth; Stripe ids are stored only as references.

Local reconciliation: because a dev machine usually has no public webhook URL,
invoices can be reconciled by polling the PaymentIntent (see retrieve_payment_intent
+ the /sync-stripe endpoint). A signature-verified webhook is also provided for
setups that run `stripe listen` / a tunnel.
"""
import os

import stripe


class StripeNotConfigured(RuntimeError):
    """Raised when a Stripe operation is attempted without a configured test key."""


class StripeLiveKeyRefused(RuntimeError):
    """Raised if a live (sk_live_) key is supplied — refused for safety."""


STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()


def _guard_live_key():
    if STRIPE_SECRET_KEY.startswith("sk_live_") or STRIPE_SECRET_KEY.startswith("rk_live_"):
        raise StripeLiveKeyRefused(
            "A live Stripe key was provided. This project is restricted to TEST "
            "MODE (sk_test_…). Refusing to initialise to avoid touching real money."
        )


def is_configured() -> bool:
    """True only for a usable *test-mode* key."""
    if not STRIPE_SECRET_KEY:
        return False
    _guard_live_key()
    return True


def _client():
    if not STRIPE_SECRET_KEY:
        raise StripeNotConfigured(
            "Stripe is not configured. Set STRIPE_SECRET_KEY (test mode) to enable "
            "card payments, or use manual payment recording."
        )
    _guard_live_key()
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def ensure_customer(client_row) -> str:
    """Return a Stripe customer id for a Client, creating one on first use."""
    s = _client()
    if getattr(client_row, "stripe_customer_id", None):
        return client_row.stripe_customer_id
    cust = s.Customer.create(
        name=client_row.company_name,
        email=client_row.primary_email or None,
        metadata={"client_id": str(client_row.id), "trn": client_row.trn or ""},
    )
    return cust.id


def create_payment_intent(amount_minor: int, currency: str, customer_id: str | None, metadata: dict) -> dict:
    """Create a PaymentIntent. amount_minor is in the smallest currency unit
    (fils for AED). Returns {id, client_secret}."""
    s = _client()
    pi = s.PaymentIntent.create(
        amount=amount_minor,
        currency=currency.lower(),
        customer=customer_id,
        metadata=metadata,
        automatic_payment_methods={"enabled": True},
    )
    return {"id": pi.id, "client_secret": pi.client_secret, "status": pi.status}


def retrieve_payment_intent(payment_intent_id: str) -> dict:
    s = _client()
    pi = s.PaymentIntent.retrieve(payment_intent_id)
    return {
        "id": pi.id,
        "status": pi.status,                 # requires_payment_method, succeeded, etc.
        "amount_received": pi.amount_received,
        "currency": pi.currency,
    }


def construct_webhook_event(payload: bytes, sig_header: str):
    """Verify + parse a Stripe webhook. Requires STRIPE_WEBHOOK_SECRET."""
    if not STRIPE_WEBHOOK_SECRET:
        raise StripeNotConfigured("STRIPE_WEBHOOK_SECRET not set; cannot verify webhook")
    _client()
    return stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)


def to_minor_units(amount: float) -> int:
    """Convert a major-unit amount (e.g. 105.00 AED) to minor units (10500 fils)."""
    return int(round(amount * 100))
