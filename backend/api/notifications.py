import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from backend.database.db import get_db
from backend.database.models import User, Notification, PushSubscription
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def notif_to_dict(n: Notification):
    return {
        "id": n.id,
        "message": n.message,
        "is_read": n.is_read,
        "lead_id": n.lead_id,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
def get_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [notif_to_dict(n) for n in notifs]


@router.get("/unread-count")
def unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)
        .count()
    )
    return {"count": count}


@router.patch("/{notif_id}/read")
def mark_read(notif_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == current_user.id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ── Web Push ───────────────────────────────────────────────────────────────────

@router.get("/vapid-public-key")
def get_vapid_public_key():
    return {"public_key": os.environ.get("VAPID_PUBLIC_KEY", "")}


class PushSubBody(BaseModel):
    endpoint: str
    keys: dict


@router.post("/push-subscribe")
def push_subscribe(body: PushSubBody, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p256dh = body.keys.get("p256dh", "")
    auth = body.keys.get("auth", "")
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == body.endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = p256dh
        existing.auth = auth
    else:
        db.add(PushSubscription(user_id=current_user.id, endpoint=body.endpoint, p256dh=p256dh, auth=auth))
    db.commit()
    return {"ok": True}


@router.delete("/push-unsubscribe")
def push_unsubscribe(body: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    endpoint = body.get("endpoint", "")
    db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).delete()
    db.commit()
    return {"ok": True}
