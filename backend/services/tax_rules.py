"""Deterministic marketing readiness / audit checklist.

Pure rules, no AI, no network: builds a per-client marketing checklist from the
services the client has signed up for, plus a few baseline onboarding items every
client needs. Used by GET /api/clients/{id}/tax-checklist.

These are workflow reminders for the account team, not a guarantee of results.
The disclaimer is returned with the result.
"""
import calendar
from datetime import date

DISCLAIMER = (
    "These are workflow reminders generated from the client's active services, "
    "not a guarantee of marketing performance. Confirm scope and deliverables "
    "with the client's signed agreement."
)


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    year = d.year + m // 12
    month = m % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _next_month_start(today: date) -> date:
    """First day of next month — used for recurring monthly deliverables."""
    nm = _add_months(today.replace(day=1), 1)
    return nm


def _item(key, title, category, status, detail, due_date=None):
    return {"key": key, "title": title, "category": category, "status": status,
            "detail": detail, "due_date": due_date.isoformat() if due_date else None}


# Per-service checklist items. Each entry: service_type -> (key, title, category, status, detail, recurring?)
_SERVICE_ITEMS = {
    "social_media_management": (
        "content_calendar", "Monthly content calendar", "deliverable", "upcoming",
        "Plan and schedule this month's social posts across the client's channels.", True,
    ),
    "seo": (
        "seo_audit", "Technical SEO audit", "deliverable", "upcoming",
        "Run a site crawl, fix on-page issues, and refresh the target keyword list.", True,
    ),
    "paid_advertising": (
        "ads_review", "Ad campaign optimisation", "deliverable", "upcoming",
        "Review spend, pause underperformers, and report ROAS for the period.", True,
    ),
    "content_creation": (
        "content_batch", "Content production batch", "deliverable", "upcoming",
        "Produce and deliver the agreed blog / creative assets for the period.", True,
    ),
    "brand_strategy": (
        "brand_guidelines", "Brand guidelines", "deliverable", "action_needed",
        "Define positioning, tone of voice, and a visual identity kit for the client.", False,
    ),
    "marketing_strategy": (
        "strategy_roadmap", "Marketing roadmap", "deliverable", "upcoming",
        "Maintain the quarterly channel mix, budget split, and growth targets.", True,
    ),
    "analytics_reporting": (
        "monthly_report", "Monthly performance report", "deliverable", "upcoming",
        "Compile traffic, leads, and channel KPIs into the client report.", True,
    ),
    "website_development": (
        "website_brief", "Website project brief", "deliverable", "action_needed",
        "Confirm sitemap, design direction, and launch timeline with the client.", False,
    ),
    "marketing_consultation": (
        "consultation_notes", "Consultation follow-up", "deliverable", "info",
        "Document recommendations and next steps from the consultation session.", False,
    ),
}


def build_checklist(client, services=None) -> dict:
    """client: ORM Client. services: list of ORM Service (optional)."""
    today = date.today()
    services = services or []
    items = []

    # ── Baseline onboarding items every client needs ────────────────────────────
    items.append(_item(
        "brand_assets", "Brand assets on file", "onboarding", "action_needed",
        "Collect the client's logo, brand guidelines, and any existing creative "
        "assets so deliverables stay on-brand.",
    ))
    items.append(_item(
        "analytics_access", "Analytics & ad-account access", "onboarding", "action_needed",
        "Request access to Google Analytics, Google/Meta Ads, and the client's social "
        "accounts so we can measure and run campaigns.",
    ))

    # ── Service-driven deliverables ─────────────────────────────────────────────
    svc_types = {s.service_type for s in services}
    next_month = _next_month_start(today)
    for st in sorted(svc_types):
        spec = _SERVICE_ITEMS.get(st)
        if not spec:
            continue
        key, title, category, status, detail, recurring = spec
        items.append(_item(
            key, title, category, status, detail,
            due_date=next_month if recurring else None,
        ))

    if not svc_types:
        items.append(_item(
            "no_services", "No active services", "info", "info",
            "This client has no marketing services yet — add a service to generate "
            "its deliverable checklist.",
        ))

    counts = {
        "action_needed": sum(1 for i in items if i["status"] == "action_needed"),
        "upcoming": sum(1 for i in items if i["status"] == "upcoming"),
        "ok": sum(1 for i in items if i["status"] == "ok"),
        "info": sum(1 for i in items if i["status"] == "info"),
    }
    return {
        "client_id": client.id,
        "company_name": client.company_name,
        "generated_at": today.isoformat(),
        "items": items,
        "counts": counts,
        "disclaimer": DISCLAIMER,
    }
