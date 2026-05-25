"""Documents API — client files with signed-URL downloads and an access audit trail.

Storage-backend-agnostic (see backend/services/storage_service.py): local
filesystem today, S3/Supabase later via env. Visibility reuses the Client scoping
from clients.py, so a user can only touch documents on clients they can see.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
from urllib.parse import quote

from backend.database.db import get_db
from backend.database.models import Document, DocumentAccessLog, Client, Service, User
from backend.services.auth_service import get_current_user, require_permission
from backend.api.clients import scope_query as scope_clients
from backend.services import storage_service as storage

router = APIRouter(prefix="/api/documents", tags=["documents"])


DOCUMENT_CATEGORIES = [
    "brief", "proposal", "contract", "creative_asset", "brand_guidelines",
    "campaign_plan", "content_calendar", "analytics_report", "invoice",
    "receipt", "id_document", "other",
]


def doc_to_dict(d: Document) -> dict:
    return {
        "id": d.id,
        "client_id": d.client_id,
        "client_name": d.client.company_name if d.client else None,
        "service_id": d.service_id,
        "service_type": d.service.service_type if d.service else None,
        "file_name": d.file_name,
        "content_type": d.content_type,
        "size_bytes": d.size_bytes,
        "category": d.category,
        "notes": d.notes,
        "uploaded_by": d.uploaded_by,
        "uploaded_by_name": d.uploader.full_name if d.uploader else None,
        "ai_summary": d.ai_summary,
        "ai_extracted": d.ai_extracted,
        "ai_analyzed_at": d.ai_analyzed_at.isoformat() if d.ai_analyzed_at else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _log_access(db: Session, document_id: int, user_id: Optional[int], action: str, request: Optional[Request]):
    ip = None
    if request is not None and request.client:
        ip = request.client.host
    db.add(DocumentAccessLog(document_id=document_id, user_id=user_id, action=action, ip_address=ip))
    db.commit()


def _client_visible(db: Session, current_user: User, client_id: int) -> bool:
    return scope_clients(db.query(Client), current_user, db).filter(Client.id == client_id).first() is not None


def _get_visible_doc(db: Session, current_user: User, document_id: int) -> Document:
    """Fetch a document the user is allowed to see, or 404. Standalone docs
    (no client) are visible to admin only."""
    d = db.query(Document).filter(Document.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    if d.client_id is None:
        if current_user.role != "admin":
            raise HTTPException(status_code=404, detail="Document not found")
    elif not _client_visible(db, current_user, d.client_id):
        raise HTTPException(status_code=404, detail="Document not found")
    return d


@router.get("/meta")
def get_meta(current_user: User = Depends(get_current_user)):
    return {
        "categories": DOCUMENT_CATEGORIES,
        "max_upload_bytes": storage.MAX_UPLOAD_BYTES,
        "allowed_content_types": sorted(storage.ALLOWED_CONTENT_TYPES),
    }


@router.get("")
def list_documents(
    client_id: Optional[int] = None,
    service_id: Optional[int] = None,
    category: Optional[str] = None,
    current_user: User = Depends(require_permission("documents", "read")),
    db: Session = Depends(get_db),
):
    visible_ids = [row.id for row in scope_clients(db.query(Client.id), current_user, db).all()]
    query = db.query(Document).filter(Document.client_id.in_(visible_ids))
    if client_id is not None:
        query = query.filter(Document.client_id == client_id)
    if service_id is not None:
        query = query.filter(Document.service_id == service_id)
    if category:
        query = query.filter(Document.category == category)
    docs = query.order_by(Document.created_at.desc()).all()
    return [doc_to_dict(d) for d in docs]


@router.post("")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    client_id: int = Form(...),
    service_id: Optional[int] = Form(None),
    category: str = Form("other"),
    notes: Optional[str] = Form(None),
    current_user: User = Depends(require_permission("documents", "create")),
    db: Session = Depends(get_db),
):
    if not _client_visible(db, current_user, client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    if category not in DOCUMENT_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. One of: {DOCUMENT_CATEGORIES}")
    if service_id is not None and not db.query(Service).filter(Service.id == service_id).first():
        raise HTTPException(status_code=404, detail="Service not found")

    content_type = file.content_type
    if content_type not in storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{content_type}' not allowed")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > storage.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds max size of {storage.MAX_UPLOAD_BYTES} bytes")

    backend = storage.get_storage()
    stored_key = backend.save(data, file.filename or "upload")

    doc = Document(
        client_id=client_id,
        service_id=service_id,
        uploaded_by=current_user.id,
        file_name=file.filename or "upload",
        stored_key=stored_key,
        content_type=content_type,
        size_bytes=len(data),
        category=category,
        notes=notes,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    _log_access(db, doc.id, current_user.id, "upload", request)
    return doc_to_dict(doc)


@router.get("/{document_id}")
def get_document(
    document_id: int,
    current_user: User = Depends(require_permission("documents", "read")),
    db: Session = Depends(get_db),
):
    d = _get_visible_doc(db, current_user, document_id)
    return doc_to_dict(d)


@router.get("/{document_id}/signed-url")
def get_signed_url(
    document_id: int,
    request: Request,
    current_user: User = Depends(require_permission("documents", "read")),
    db: Session = Depends(get_db),
):
    """Return a short-lived tokenised download URL. Locally this is an HMAC token;
    an S3/Supabase backend would return a real presigned URL instead."""
    d = _get_visible_doc(db, current_user, document_id)
    token, expires_at = storage.make_download_token(d.id)
    _log_access(db, d.id, current_user.id, "view", request)
    return {
        "url": f"/api/documents/{d.id}/download?token={token}",
        "expires_at": expires_at,
        "file_name": d.file_name,
    }


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Token-authenticated stream — no bearer header required, so the URL works in
    a plain link / new tab. Token is bound to this document id and expires."""
    if not storage.verify_download_token(token, document_id):
        raise HTTPException(status_code=403, detail="Invalid or expired download token")
    d = db.query(Document).filter(Document.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")

    backend = storage.get_storage()
    if not backend.exists(d.stored_key):
        raise HTTPException(status_code=410, detail="File no longer available")

    _log_access(db, d.id, None, "download", request)
    stream = backend.open(d.stored_key)
    filename = quote(d.file_name)
    return StreamingResponse(
        stream,
        media_type=d.content_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    request: Request,
    current_user: User = Depends(require_permission("documents", "delete")),
    db: Session = Depends(get_db),
):
    d = _get_visible_doc(db, current_user, document_id)
    backend = storage.get_storage()
    backend.delete(d.stored_key)
    # Keep an audit trail of the deletion before cascading the log rows away.
    _log_access(db, d.id, current_user.id, "delete", request)
    db.delete(d)
    db.commit()
    return {"ok": True}


@router.get("/{document_id}/access-log")
def get_access_log(
    document_id: int,
    current_user: User = Depends(require_permission("documents", "read")),
    db: Session = Depends(get_db),
):
    """Audit trail for a document. Restricted to admin / marketing_manager since it
    can reveal who accessed sensitive client files."""
    if current_user.role not in ("admin", "marketing_manager"):
        raise HTTPException(status_code=403, detail="Audit log access restricted")
    d = _get_visible_doc(db, current_user, document_id)
    logs = (
        db.query(DocumentAccessLog)
        .filter(DocumentAccessLog.document_id == d.id)
        .order_by(DocumentAccessLog.created_at.desc())
        .all()
    )
    return [
        {
            "id": l.id,
            "action": l.action,
            "user_id": l.user_id,
            "user_name": l.user.full_name if l.user else None,
            "ip_address": l.ip_address,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
