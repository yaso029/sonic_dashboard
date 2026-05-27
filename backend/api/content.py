"""Content Calendar — plan social posts per client across channels with a status
workflow (idea -> draft -> review -> approved -> scheduled -> published)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import ContentPost, User
from backend.services.auth_service import get_current_user, require_permission

router = APIRouter(prefix="/api/content", tags=["content"])

CHANNELS = ["instagram", "facebook", "linkedin", "tiktok", "twitter", "youtube", "blog", "other"]
STATUSES = ["idea", "draft", "review", "approved", "scheduled", "published"]


class PostCreate(BaseModel):
    title: str
    client_id: Optional[int] = None
    caption: Optional[str] = None
    channel: Optional[str] = "instagram"
    scheduled_date: Optional[str] = None
    status: Optional[str] = "idea"
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


class PostUpdate(BaseModel):
    title: Optional[str] = None
    client_id: Optional[int] = None
    caption: Optional[str] = None
    channel: Optional[str] = None
    scheduled_date: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[int] = None
    notes: Optional[str] = None


def to_dict(p: ContentPost) -> dict:
    return {
        "id": p.id,
        "client_id": p.client_id,
        "client_name": p.client.company_name if p.client else None,
        "title": p.title,
        "caption": p.caption,
        "channel": p.channel,
        "scheduled_date": p.scheduled_date,
        "status": p.status,
        "assigned_to": p.assigned_to,
        "assigned_to_name": p.assignee.full_name if p.assignee else None,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _validate(channel=None, status=None):
    if channel is not None and channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid channel")
    if status is not None and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")


@router.get("/meta")
def meta(current_user: User = Depends(get_current_user)):
    return {"channels": CHANNELS, "statuses": STATUSES}


@router.get("")
def list_posts(
    month: Optional[str] = None,          # YYYY-MM
    client_id: Optional[int] = None,
    channel: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(require_permission("content", "read")),
    db: Session = Depends(get_db),
):
    q = db.query(ContentPost)
    if month:
        q = q.filter(ContentPost.scheduled_date.like(f"{month}-%"))
    if client_id:
        q = q.filter(ContentPost.client_id == client_id)
    if channel:
        q = q.filter(ContentPost.channel == channel)
    if status:
        q = q.filter(ContentPost.status == status)
    rows = q.order_by(ContentPost.scheduled_date.asc().nullslast(), ContentPost.id.desc()).all()
    return [to_dict(p) for p in rows]


@router.post("")
def create_post(req: PostCreate, current_user: User = Depends(require_permission("content", "create")), db: Session = Depends(get_db)):
    if not req.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    _validate(req.channel, req.status)
    p = ContentPost(
        client_id=req.client_id,
        title=req.title.strip()[:300],
        caption=req.caption,
        channel=req.channel or "instagram",
        scheduled_date=req.scheduled_date,
        status=req.status or "idea",
        assigned_to=req.assigned_to,
        notes=req.notes,
        created_by=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return to_dict(p)


@router.put("/{post_id}")
def update_post(post_id: int, req: PostUpdate, current_user: User = Depends(require_permission("content", "update")), db: Session = Depends(get_db)):
    _validate(req.channel, req.status)
    p = db.query(ContentPost).filter(ContentPost.id == post_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    for f in ("title", "client_id", "caption", "channel", "scheduled_date", "status", "assigned_to", "notes"):
        v = getattr(req, f)
        if v is not None:
            setattr(p, f, v)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return to_dict(p)


@router.delete("/{post_id}")
def delete_post(post_id: int, current_user: User = Depends(require_permission("content", "delete")), db: Session = Depends(get_db)):
    p = db.query(ContentPost).filter(ContentPost.id == post_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(p)
    db.commit()
    return {"ok": True}
