"""Phase 7 — AI + compliance endpoints.

- GET  /api/ai/config                       availability + model
- GET  /api/clients/{id}/tax-checklist      deterministic, always available
- POST /api/documents/{id}/analyze          Claude document analysis (503 if no key)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.db import get_db
from backend.database.models import Client, Service, User
from backend.services.auth_service import get_current_user, require_permission
from backend.services import ai_service, tax_rules, storage_service as storage
from backend.api.clients import scope_query as scope_clients
from backend.api.documents import _get_visible_doc, doc_to_dict

router = APIRouter(tags=["ai"])


@router.get("/api/ai/config")
def ai_config(current_user: User = Depends(get_current_user)):
    """Tells the frontend whether AI document analysis is available."""
    enabled = ai_service.is_configured()
    return {
        "ai_enabled": enabled,
        "model": ai_service.model_name() if enabled else None,
        "analyzable_content_types": sorted(ai_service.ANALYZABLE_CONTENT_TYPES),
    }


@router.get("/api/clients/{client_id}/tax-checklist")
def tax_checklist(
    client_id: int,
    current_user: User = Depends(require_permission("clients", "read")),
    db: Session = Depends(get_db),
):
    """Deterministic UAE compliance checklist — no AI, always available."""
    client = scope_clients(db.query(Client), current_user, db).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    services = db.query(Service).filter(Service.client_id == client_id).all()
    return tax_rules.build_checklist(client, services)


@router.post("/api/documents/{document_id}/analyze")
def analyze_document(
    document_id: int,
    current_user: User = Depends(require_permission("documents", "read")),
    db: Session = Depends(get_db),
):
    """Run Claude analysis on a stored document and cache the result. Requires
    ANTHROPIC_API_KEY (503 otherwise)."""
    if not ai_service.is_configured():
        raise HTTPException(status_code=503, detail="AI is not configured (set ANTHROPIC_API_KEY)")

    d = _get_visible_doc(db, current_user, document_id)
    if not ai_service.can_analyze(d.content_type):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot analyse '{d.content_type}'. Supported: PDF, images, text.",
        )

    backend = storage.get_storage()
    if not backend.exists(d.stored_key):
        raise HTTPException(status_code=410, detail="File no longer available")
    with backend.open(d.stored_key) as fh:
        file_bytes = fh.read()

    try:
        result = ai_service.analyze_document(file_bytes, d.content_type, d.file_name, d.category)
    except ai_service.AINotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI error: {e}")

    d.ai_summary = result.get("summary")
    d.ai_extracted = result.get("extracted") or {}
    d.ai_analyzed_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return {
        "document": doc_to_dict(d),
        "summary": result.get("summary"),
        "suggested_category": result.get("suggested_category"),
        "extracted": result.get("extracted") or {},
        "model": result.get("model"),
    }
