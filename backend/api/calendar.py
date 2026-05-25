from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db
from backend.database.models import CalendarEvent, User
from backend.services.auth_service import get_current_user, require_admin
from backend.services.cloudinary_service import upload_image, delete_image

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


def event_to_dict(e: CalendarEvent):
    return {
        "id": e.id,
        "title": e.title,
        "date": e.date,
        "time_start": e.time_start,
        "time_end": e.time_end,
        "location": e.location,
        "hosted_by": e.hosted_by,
        "description": e.description,
        "image_url": e.image_url,
        "image_public_id": e.image_public_id,
        "visibility": e.visibility,
        "status": e.status,
        "created_by": e.created_by,
        "creator_name": e.creator.full_name if e.creator else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


class CreateEventRequest(BaseModel):
    title: str
    date: str
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    location: Optional[str] = None
    hosted_by: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = "everyone"


@router.get("/events")
def list_events(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CalendarEvent)
    if current_user.role == "admin":
        # Admin sees: approved public, approved private (own), all pending
        query = query.filter(
            or_(
                and_(CalendarEvent.status == "approved", CalendarEvent.visibility == "everyone"),
                and_(CalendarEvent.status == "approved", CalendarEvent.visibility == "private",
                     CalendarEvent.created_by == current_user.id),
                CalendarEvent.status == "pending",
            )
        )
    else:
        query = query.filter(
            CalendarEvent.status == "approved",
            CalendarEvent.visibility == "everyone",
        )
    if date_from:
        query = query.filter(CalendarEvent.date >= date_from)
    if date_to:
        query = query.filter(CalendarEvent.date <= date_to)
    events = query.order_by(CalendarEvent.date, CalendarEvent.time_start).all()
    return [event_to_dict(e) for e in events]


@router.get("/events/pending")
def list_pending(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    events = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.status == "pending")
        .order_by(CalendarEvent.created_at.desc())
        .all()
    )
    return [event_to_dict(e) for e in events]


@router.post("/events")
def create_event(
    req: CreateEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_admin = current_user.role == "admin"
    status = "approved" if is_admin else "pending"
    visibility = req.visibility if is_admin else "everyone"

    event = CalendarEvent(
        title=req.title,
        date=req.date,
        time_start=req.time_start,
        time_end=req.time_end,
        location=req.location,
        hosted_by=req.hosted_by or current_user.full_name,
        description=req.description,
        visibility=visibility,
        status=status,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_to_dict(event)


@router.put("/events/{event_id}")
def update_event(
    event_id: int,
    req: CreateEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    event.title = req.title
    event.date = req.date
    event.time_start = req.time_start
    event.time_end = req.time_end
    event.location = req.location
    event.hosted_by = req.hosted_by
    event.description = req.description
    if current_user.role == "admin":
        event.visibility = req.visibility or "everyone"
    db.commit()
    db.refresh(event)
    return event_to_dict(event)


@router.post("/events/{event_id}/image")
async def upload_event_image(
    event_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")

    contents = await file.read()
    if event.image_public_id:
        try:
            delete_image(event.image_public_id)
        except Exception:
            pass

    result = upload_image(contents, folder="sonic_calendar")
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    event.image_url = result["url"]
    event.image_public_id = result["public_id"]
    db.commit()
    return {"image_url": event.image_url}


@router.patch("/events/{event_id}/approve")
def approve_event(
    event_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.status = "approved"
    event.approved_by = current_user.id
    db.commit()
    return event_to_dict(event)


@router.patch("/events/{event_id}/reject")
def reject_event(
    event_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.status = "rejected"
    db.commit()
    return {"ok": True}


@router.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.image_public_id:
        try:
            delete_image(event.image_public_id)
        except Exception:
            pass
    db.delete(event)
    db.commit()
    return {"ok": True}
