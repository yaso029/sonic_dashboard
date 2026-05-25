import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from backend.database.db import get_db
from backend.database.models import ECard, User
from backend.services.auth_service import get_current_user, require_hr_access
from backend.services.cloudinary_service import upload_image

router = APIRouter(prefix="/api/ecards", tags=["ecards"])


def _make_slug(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')


def card_to_dict(c: ECard) -> dict:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "slug": c.slug,
        "full_name": c.full_name,
        "job_title": c.job_title,
        "phone": c.phone,
        "whatsapp": c.whatsapp,
        "email": c.email,
        "website": c.website,
        "linkedin": c.linkedin,
        "photo_url": c.photo_url,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


class ECardBody(BaseModel):
    user_id: Optional[int] = None
    full_name: str
    job_title: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    linkedin: Optional[str] = None
    is_active: bool = True


# ── Public (no auth) ───────────────────────────────────────────────────────────
@router.get("/public/{slug}")
def get_public_card(slug: str, db: Session = Depends(get_db)):
    card = db.query(ECard).filter(ECard.slug == slug, ECard.is_active == True).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card_to_dict(card)


# ── Authenticated — all users ──────────────────────────────────────────────────
@router.get("")
def get_all_cards(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cards = db.query(ECard).order_by(ECard.full_name).all()
    result = []
    for c in cards:
        d = card_to_dict(c)
        d["is_mine"] = (c.user_id == current_user.id)
        result.append(d)
    return result


# ── HR admin — manage ─────────────────────────────────────────────────────────
@router.post("")
def create_card(data: ECardBody, current_user: User = Depends(require_hr_access), db: Session = Depends(get_db)):
    slug = _make_slug(data.full_name)
    base = slug
    i = 1
    while db.query(ECard).filter(ECard.slug == slug).first():
        slug = f"{base}-{i}"
        i += 1
    card = ECard(
        user_id=data.user_id,
        slug=slug,
        full_name=data.full_name,
        job_title=data.job_title,
        phone=data.phone,
        whatsapp=data.whatsapp,
        email=data.email,
        website=data.website,
        linkedin=data.linkedin,
        is_active=data.is_active,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_to_dict(card)


@router.put("/{card_id}")
def update_card(card_id: int, data: ECardBody, current_user: User = Depends(require_hr_access), db: Session = Depends(get_db)):
    card = db.query(ECard).filter(ECard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    card.user_id = data.user_id
    card.full_name = data.full_name
    card.job_title = data.job_title
    card.phone = data.phone
    card.whatsapp = data.whatsapp
    card.email = data.email
    card.website = data.website
    card.linkedin = data.linkedin
    card.is_active = data.is_active
    db.commit()
    return card_to_dict(card)


@router.delete("/{card_id}")
def delete_card(card_id: int, current_user: User = Depends(require_hr_access), db: Session = Depends(get_db)):
    card = db.query(ECard).filter(ECard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    db.delete(card)
    db.commit()
    return {"ok": True}


@router.post("/{card_id}/photo")
async def upload_card_photo(
    card_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_hr_access),
    db: Session = Depends(get_db),
):
    card = db.query(ECard).filter(ECard.id == card_id).first()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    result = await upload_image(file, folder="ecards")
    card.photo_url = result["url"]
    card.photo_public_id = result.get("public_id")
    db.commit()
    return {"url": result["url"]}
