from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from backend.database.db import get_db
from backend.database.models import Partner, OutreachMessage, IncomingReply, Commission
from backend.services.auth_service import require_admin

router = APIRouter(prefix="/api/partnerships", tags=["partnerships"])

UAE_TZ = timezone(timedelta(hours=4))


@router.get("/dashboard")
def partnerships_dashboard(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    now_uae = datetime.now(UAE_TZ)
    today_start = datetime(now_uae.year, now_uae.month, now_uae.day)
    month_start = datetime(now_uae.year, now_uae.month, 1)

    total_partners = db.query(Partner).count()
    active_partners = db.query(Partner).filter(Partner.status == "Active Partner").count()

    wa_today = db.query(OutreachMessage).filter(
        OutreachMessage.channel == "whatsapp",
        OutreachMessage.sent_at >= today_start
    ).count()
    email_today = db.query(OutreachMessage).filter(
        OutreachMessage.channel == "email",
        OutreachMessage.sent_at >= today_start
    ).count()

    replies_today = db.query(IncomingReply).filter(
        IncomingReply.received_at >= today_start
    ).count()

    leads_this_month = db.query(Commission).filter(
        Commission.created_at >= month_start
    ).count()

    commissions = db.query(Commission).all()
    commission_owed = sum(c.commission_amount for c in commissions if c.status in ("pending", "closed"))
    commission_paid = sum(c.commission_amount for c in commissions if c.status == "paid")
    commission_this_month = sum(
        c.commission_amount for c in commissions
        if c.created_at and c.created_at >= month_start
    )

    recent_messages = db.query(OutreachMessage).order_by(
        OutreachMessage.sent_at.desc()
    ).limit(10).all()

    recent_activity = []
    for m in recent_messages:
        recent_activity.append({
            "type": "message_sent",
            "channel": m.channel,
            "partner_name": m.partner.full_name if m.partner else "Unknown",
            "time": m.sent_at.isoformat() if m.sent_at else None,
        })

    recent_replies = db.query(IncomingReply).order_by(
        IncomingReply.received_at.desc()
    ).limit(5).all()
    for r in recent_replies:
        recent_activity.append({
            "type": "reply_received",
            "channel": r.channel,
            "partner_name": r.partner.full_name if r.partner else r.from_number or "Unknown",
            "message": r.message_body[:80],
            "time": r.received_at.isoformat() if r.received_at else None,
            "ai_suggestion": r.ai_suggestion,
        })

    recent_activity.sort(key=lambda x: x.get("time") or "", reverse=True)

    return {
        "total_partners": total_partners,
        "active_partners": active_partners,
        "messages_sent_today": wa_today + email_today,
        "whatsapp_sent_today": wa_today,
        "email_sent_today": email_today,
        "replies_today": replies_today,
        "leads_this_month": leads_this_month,
        "commission_owed": commission_owed,
        "commission_paid": commission_paid,
        "commission_this_month": commission_this_month,
        "recent_activity": recent_activity[:15],
    }
