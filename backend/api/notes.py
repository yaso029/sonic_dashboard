"""Notes — a personal notepad. Each user creates, names, edits and deletes their
own note files; notes are private to their owner (never shared or cross-visible).
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Note, User
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/notes", tags=["notes"])

DEFAULT_TITLE = "Untitled note"


class NoteCreate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


def _clean_title(title: Optional[str]) -> str:
    t = (title or "").strip()[:300]
    return t or DEFAULT_TITLE


def to_dict(n: Note) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "content": n.content or "",
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def _get_own(db: Session, user: User, note_id: int) -> Note:
    n = db.query(Note).filter(Note.id == note_id, Note.user_id == user.id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Note not found")
    return n


@router.get("")
def list_notes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Note)
        .filter(Note.user_id == current_user.id)
        .order_by(Note.updated_at.desc())
        .all()
    )
    return [to_dict(n) for n in rows]


@router.post("")
def create_note(req: NoteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = Note(
        user_id=current_user.id,
        title=_clean_title(req.title),
        content=req.content or "",
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return to_dict(n)


@router.put("/{note_id}")
def update_note(note_id: int, req: NoteUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _get_own(db, current_user, note_id)
    if req.title is not None:
        n.title = _clean_title(req.title)
    if req.content is not None:
        n.content = req.content
    n.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(n)
    return to_dict(n)


@router.delete("/{note_id}")
def delete_note(note_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _get_own(db, current_user, note_id)
    db.delete(n)
    db.commit()
    return {"ok": True}
