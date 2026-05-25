from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from backend.database.db import get_db
from backend.database.models import Partner, EmailTemplate, OutreachMessage
from backend.services.auth_service import require_admin
from backend.services import email_service, whatsapp_service

router = APIRouter(prefix="/api/email", tags=["email"])

UAE_TZ = timezone(timedelta(hours=4))
DAILY_LIMIT = 50
COOLDOWN_DAYS = 5
BLOCKED_STATUSES = ["Not Interested", "Inactive"]


class SendEmailRequest(BaseModel):
    partner_ids: List[int]
    template_id: Optional[int] = None
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None


class EmailTemplateRequest(BaseModel):
    name: str
    subject: str
    body_html: str


def tmpl_to_dict(t: EmailTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "subject": t.subject,
        "body_html": t.body_html,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def msg_to_dict(m: OutreachMessage) -> dict:
    return {
        "id": m.id,
        "partner_id": m.partner_id,
        "partner_name": m.partner.full_name if m.partner else None,
        "subject": m.subject,
        "message_body": m.message_body,
        "sent_at": m.sent_at.isoformat() if m.sent_at else None,
        "status": m.status,
    }


@router.get("/daily-count")
def daily_count(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    today = datetime.now(UAE_TZ).date()
    count = db.query(OutreachMessage).filter(
        OutreachMessage.channel == "email",
        OutreachMessage.sent_at >= datetime.combine(today, datetime.min.time())
    ).count()
    return {"count": count, "limit": DAILY_LIMIT}


@router.post("/send")
def send_emails(req: SendEmailRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    today = datetime.now(UAE_TZ).date()
    sent_today = db.query(OutreachMessage).filter(
        OutreachMessage.channel == "email",
        OutreachMessage.sent_at >= datetime.combine(today, datetime.min.time())
    ).count()

    if sent_today >= DAILY_LIMIT:
        raise HTTPException(status_code=400, detail=f"Daily limit of {DAILY_LIMIT} emails reached")

    template = None
    if req.template_id:
        template = db.query(EmailTemplate).filter(EmailTemplate.id == req.template_id).first()

    results = []
    remaining = DAILY_LIMIT - sent_today

    for pid in req.partner_ids[:remaining]:
        partner = db.query(Partner).filter(Partner.id == pid).first()
        if not partner or not partner.email:
            results.append({"partner_id": pid, "error": "No email address"})
            continue
        if partner.status in BLOCKED_STATUSES:
            results.append({"partner_id": pid, "error": "Blocked status"})
            continue

        cooldown_cutoff = datetime.utcnow() - timedelta(days=COOLDOWN_DAYS)
        recent = db.query(OutreachMessage).filter(
            OutreachMessage.partner_id == pid,
            OutreachMessage.channel == "email",
            OutreachMessage.sent_at >= cooldown_cutoff
        ).first()
        if recent:
            results.append({"partner_id": pid, "error": f"Contacted within last {COOLDOWN_DAYS} days"})
            continue

        partner_data = {
            "full_name": partner.full_name, "company": partner.company,
            "partner_type": partner.partner_type, "commission_rate": partner.commission_rate
        }
        subject = req.custom_subject or (template.subject if template else "Partnership Opportunity")
        body = req.custom_body or (template.body_html if template else "")
        subject = email_service.personalize(subject, partner_data)
        body = email_service.personalize(body, partner_data)

        result = email_service.send_email(partner.email, subject, body)

        if "error" in result:
            results.append({"partner_id": pid, "error": result["error"]})
            continue

        msg = OutreachMessage(
            partner_id=partner.id,
            channel="email",
            template_id=req.template_id,
            message_body=body,
            subject=subject,
            status="sent",
            message_id=result.get("message_id"),
        )
        db.add(msg)
        partner.last_contacted_at = datetime.utcnow()
        results.append({"partner_id": pid, "ok": True})

    db.commit()
    errors = [r for r in results if r.get("error")]
    sent_count = len([r for r in results if r.get("ok")])
    if sent_count == 0 and errors:
        raise HTTPException(status_code=400, detail=errors[0]["error"])
    return {"results": results, "sent": sent_count}


@router.get("/templates")
def list_templates(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    return [tmpl_to_dict(t) for t in db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc()).all()]


@router.post("/templates")
def create_template(req: EmailTemplateRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    t = EmailTemplate(name=req.name, subject=req.subject, body_html=req.body_html)
    db.add(t)
    db.commit()
    db.refresh(t)
    return tmpl_to_dict(t)


@router.put("/templates/{template_id}")
def update_template(template_id: int, req: EmailTemplateRequest, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.name = req.name
    t.subject = req.subject
    t.body_html = req.body_html
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return tmpl_to_dict(t)


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.get("/sent")
def sent_history(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    msgs = db.query(OutreachMessage).filter(OutreachMessage.channel == "email") \
        .order_by(OutreachMessage.sent_at.desc()).limit(200).all()
    return [msg_to_dict(m) for m in msgs]
