from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db
from backend.database.models import Lead, Activity, User
from backend.services.notification_service import notify_admins
import os
import httpx

router = APIRouter(prefix="/api/webhook", tags=["webhook"])

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "sonic-webhook-secret-change-me")
META_VERIFY_TOKEN = os.environ.get("META_VERIFY_TOKEN", "sonic-meta-leads-2024")
META_PAGE_ACCESS_TOKEN = os.environ.get("META_PAGE_ACCESS_TOKEN", "")


class ZapierLeadPayload(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    form_name: Optional[str] = None
    estimated_value: Optional[str] = None
    notes: Optional[str] = None


@router.post("/zapier")
def zapier_inbound(
    payload: ZapierLeadPayload,
    x_webhook_secret: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    if x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    admin = db.query(User).filter(User.role == "admin", User.is_active == True).first()
    default_assignee = admin.id if admin else None

    source = payload.source or payload.form_name or "Facebook"

    lead = Lead(
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        company=payload.company,
        source=source,
        estimated_value=payload.estimated_value,
        notes=payload.notes,
        stage="inquiry",
        assigned_to=default_assignee,
        created_by=default_assignee,
    )
    db.add(lead)
    db.flush()
    activity = Activity(
        lead_id=lead.id,
        user_id=default_assignee,
        type="note",
        content=f"Lead created via Zapier from: {source}",
    )
    db.add(activity)
    notify_admins(db, f"⚡ New inquiry via Zapier: {lead.full_name} (source: {source})", lead_id=lead.id)
    db.commit()
    db.refresh(lead)
    return {"ok": True, "lead_id": lead.id, "message": f"Lead '{lead.full_name}' created successfully"}


# ── Meta Lead Ads direct webhook ──────────────────────────────────────────────

@router.get("/meta-leads")
async def verify_meta_leads(request: Request):
    params = dict(request.query_params)
    if params.get("hub.verify_token") == META_VERIFY_TOKEN and params.get("hub.challenge"):
        return int(params["hub.challenge"])
    raise HTTPException(status_code=403, detail="Invalid verify token")


@router.post("/meta-leads")
async def receive_meta_leads(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        for entry in data.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") != "leadgen":
                    continue
                value = change.get("value", {})
                leadgen_id = value.get("leadgen_id")
                ad_name = value.get("ad_name", "Facebook")
                if not leadgen_id:
                    continue

                lead_fields = await fetch_meta_lead(leadgen_id)
                if not lead_fields:
                    continue

                fields = lead_fields.get("parsed", {})
                source = lead_fields.get("form_name") or ad_name or "Facebook"

                full_name = (
                    fields.get("full_name")
                    or f"{fields.get('first_name', '')} {fields.get('last_name', '')}".strip()
                    or "Unknown"
                )
                phone = fields.get("phone_number") or fields.get("phone", "")
                email = fields.get("email", "")
                company = fields.get("company_name") or fields.get("company", "")
                notes_parts = [f"{k}: {v}" for k, v in fields.items()
                               if k not in ("full_name", "first_name", "last_name", "phone_number", "phone", "email", "company_name", "company")]
                notes = "\n".join(notes_parts) if notes_parts else None

                admin = db.query(User).filter(User.role == "admin", User.is_active == True).first()
                assignee_id = admin.id if admin else None

                lead = Lead(
                    full_name=full_name,
                    phone=phone,
                    email=email,
                    company=company,
                    source=source,
                    notes=notes,
                    stage="inquiry",
                    assigned_to=assignee_id,
                    created_by=assignee_id,
                )
                db.add(lead)
                db.flush()
                activity = Activity(
                    lead_id=lead.id,
                    user_id=assignee_id,
                    type="note",
                    content=f"Lead received from Meta form: {source}",
                )
                db.add(activity)
                notify_admins(db, f"📘 New inquiry from Meta Ads: {full_name} (form: {source})", lead_id=lead.id)
        db.commit()
    except Exception:
        pass
    return {"status": "ok"}


async def fetch_meta_lead(leadgen_id: str) -> Optional[dict]:
    if not META_PAGE_ACCESS_TOKEN:
        return None
    url = f"https://graph.facebook.com/v18.0/{leadgen_id}"
    params = {
        "fields": "field_data,ad_name,form_id,created_time",
        "access_token": META_PAGE_ACCESS_TOKEN,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            return None
        data = resp.json()
        parsed = {item["name"]: item["values"][0] for item in data.get("field_data", []) if item.get("values")}

        form_id = data.get("form_id")
        form_name = None
        if form_id:
            r2 = await client.get(
                f"https://graph.facebook.com/v18.0/{form_id}",
                params={"fields": "name", "access_token": META_PAGE_ACCESS_TOKEN}
            )
            if r2.status_code == 200:
                form_name = r2.json().get("name")

        return {"parsed": parsed, "form_name": form_name}
