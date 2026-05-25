import os
import json
import logging
from backend.database.models import Notification, User, PushSubscription
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def _add(db: Session, user_id: int, message: str, lead_id: int = None):
    db.add(Notification(user_id=user_id, message=message, lead_id=lead_id))


def notify_admins(db: Session, message: str, lead_id: int = None, exclude_id: int = None):
    admins = db.query(User).filter(User.role == "admin", User.is_active == True).all()
    for a in admins:
        if exclude_id and a.id == exclude_id:
            continue
        _add(db, a.id, message, lead_id)
        _send_push(db, a.id, "Sonic System", message)


def notify_user(db: Session, user_id: int, message: str, lead_id: int = None, exclude_id: int = None):
    if user_id and user_id != exclude_id:
        _add(db, user_id, message, lead_id)
        _send_push(db, user_id, "Sonic System", message)


def _send_push(db: Session, user_id: int, title: str, body: str, url: str = "/"):
    vapid_private = os.environ.get("VAPID_PRIVATE_KEY")
    vapid_email = os.environ.get("VAPID_EMAIL", "mailto:admin@sonic.ae")
    if not vapid_private:
        return

    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subs:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — skipping push")
        return

    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=vapid_private,
                vapid_claims={"sub": vapid_email},
            )
        except Exception as e:
            # 404/410 means subscription is gone — clean it up
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                dead.append(sub.id)
            else:
                logger.warning(f"Push failed for user {user_id}: {e}")

    if dead:
        db.query(PushSubscription).filter(PushSubscription.id.in_(dead)).delete(synchronize_session=False)
        db.commit()
