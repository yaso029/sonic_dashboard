"""Internal messaging — direct messages between staff & admin, with real-time
delivery over WebSocket and a Web Push notification when the recipient is away.

- REST: contacts, conversation history, send, unread count.
- WS  : /api/messages/ws?token=<jwt> pushes new messages live to the recipient
        (and echoes to the sender's other devices).
History is persisted, so a dropped socket never loses messages (REST recovers).
"""
from datetime import datetime
from typing import Optional

from fastapi import (APIRouter, BackgroundTasks, Depends, HTTPException, Query,
                     WebSocket, WebSocketDisconnect)
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from backend.database.db import SessionLocal, get_db
from backend.database.models import Message, User
from backend.services.auth_service import get_current_user, get_user_from_token
from backend.services import notification_service
from backend.services.ws_manager import manager

router = APIRouter(prefix="/api/messages", tags=["messages"])


class SendBody(BaseModel):
    recipient_id: int
    body: str


def msg_dict(m: Message) -> dict:
    return {
        "id": m.id,
        "sender_id": m.sender_id,
        "recipient_id": m.recipient_id,
        "sender_name": m.sender.full_name if m.sender else None,
        "body": m.body,
        "is_read": m.is_read,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _unread_by_sender(db: Session, user_id: int) -> dict:
    rows = (
        db.query(Message.sender_id, func.count(Message.id))
        .filter(Message.recipient_id == user_id, Message.is_read == False)
        .group_by(Message.sender_id)
        .all()
    )
    return {str(sid): int(c) for sid, c in rows}


@router.get("/contacts")
def list_contacts(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everyone you can message (all other active staff) + unread count each."""
    users = (
        db.query(User)
        .filter(User.id != current_user.id, User.is_active == True)
        .order_by(User.full_name)
        .all()
    )
    unread = _unread_by_sender(db, current_user.id)
    return [
        {"id": u.id, "full_name": u.full_name, "role": u.role, "unread": unread.get(str(u.id), 0)}
        for u in users
    ]


@router.get("/unread-count")
def unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    by = _unread_by_sender(db, current_user.id)
    return {"total": sum(by.values()), "by_user": by}


@router.get("/with/{user_id}")
def conversation(user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = (
        db.query(Message)
        .filter(or_(
            and_(Message.sender_id == current_user.id, Message.recipient_id == user_id),
            and_(Message.sender_id == user_id, Message.recipient_id == current_user.id),
        ))
        .order_by(Message.created_at.asc())
        .all()
    )
    # Mark the other side's messages as read now that we're viewing them.
    db.query(Message).filter(
        Message.sender_id == user_id,
        Message.recipient_id == current_user.id,
        Message.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return [msg_dict(m) for m in msgs]


def _push_bg(recipient_id: int, sender_name: str, snippet: str):
    db = SessionLocal()
    try:
        notification_service._send_push(db, recipient_id, f"💬 {sender_name}", snippet, url="/messages")
    finally:
        db.close()


@router.post("")
async def send_message(
    body: SendBody,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    recipient = db.query(User).filter(User.id == body.recipient_id, User.is_active == True).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    m = Message(sender_id=current_user.id, recipient_id=recipient.id, body=text[:4000], is_read=False)
    db.add(m)
    db.commit()
    db.refresh(m)
    data = msg_dict(m)

    payload = {"type": "message", "message": data}
    await manager.send_to_user(recipient.id, payload)   # live to recipient
    await manager.send_to_user(current_user.id, payload)  # echo to my other devices
    # Background web push so the recipient is notified even if the app is closed.
    background_tasks.add_task(_push_bg, recipient.id, current_user.full_name, text[:120])
    return data


@router.websocket("/ws")
async def messages_ws(websocket: WebSocket, token: str = Query(...)):
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
    finally:
        db.close()
    if not user:
        await websocket.close(code=1008)
        return
    await manager.connect(user.id, websocket)
    try:
        while True:
            await websocket.receive_text()  # client pings/keepalive; inbound ignored
    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception:
        manager.disconnect(user.id, websocket)
