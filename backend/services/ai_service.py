"""Phase 7 — AI document analysis via Anthropic Claude (optional, graceful).

Mirrors the Stripe pattern: AI is *optional*. With no ANTHROPIC_API_KEY the
endpoints return 503 (AINotConfigured) and the deterministic features (tax
checklist) keep working fully offline. Never calls out without a key.

analyze_document() sends a stored file to Claude (PDF → document block, images →
image block, text → inline) and asks for structured JSON: a short summary, a
suggested document category, and extracted key fields appropriate to the doc.
"""
import base64
import json
import os
from typing import Optional

DEFAULT_MODEL = "claude-sonnet-4-6"


class AINotConfigured(RuntimeError):
    """Raised when an AI operation is attempted without ANTHROPIC_API_KEY."""


def _api_key() -> str:
    return os.environ.get("ANTHROPIC_API_KEY", "").strip()


def model_name() -> str:
    return os.environ.get("AI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def is_configured() -> bool:
    return bool(_api_key())


# Content types Claude can read directly (vision / document / text).
_PDF = "application/pdf"
_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
_TEXT_TYPES = {"text/plain", "text/csv"}

ANALYZABLE_CONTENT_TYPES = {_PDF, *_IMAGE_TYPES, *_TEXT_TYPES}


def can_analyze(content_type: Optional[str]) -> bool:
    return content_type in ANALYZABLE_CONTENT_TYPES


_SYSTEM = (
    "You are an assistant for a marketing agency. You read a client document and "
    "return STRICT JSON only (no markdown, no prose) with exactly these keys:\n"
    '  "summary": a 1-2 sentence plain-language summary,\n'
    '  "suggested_category": one of [brief, proposal, contract, creative_asset, '
    "brand_guidelines, campaign_plan, content_calendar, analytics_report, invoice, "
    "receipt, id_document, other],\n"
    '  "extracted": an object of the most relevant fields you can read (e.g. for a '
    "campaign plan: client_name, campaign_name, channels, budget, start_date, "
    "end_date, kpis; for an invoice: vendor, invoice_number, date, total, currency; "
    "use null for anything not present).\n"
    "Only report what is actually present in the document. Do not invent values."
)


def _content_block(file_bytes: bytes, content_type: str):
    if content_type == _PDF:
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": _PDF,
                       "data": base64.standard_b64encode(file_bytes).decode()},
        }
    if content_type in _IMAGE_TYPES:
        media = "image/jpeg" if content_type == "image/jpg" else content_type
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media,
                       "data": base64.standard_b64encode(file_bytes).decode()},
        }
    # text/csv/plain
    text = file_bytes.decode("utf-8", errors="replace")[:20000]
    return {"type": "text", "text": f"Document contents:\n\n{text}"}


def analyze_document(file_bytes: bytes, content_type: str, filename: str,
                     hint_category: Optional[str] = None) -> dict:
    """Return {summary, suggested_category, extracted, model}. Raises
    AINotConfigured if no key, ValueError if the type can't be analysed."""
    if not is_configured():
        raise AINotConfigured(
            "AI is not configured. Set ANTHROPIC_API_KEY to enable document analysis."
        )
    if not can_analyze(content_type):
        raise ValueError(f"Cannot analyse content type '{content_type}' (PDF, image or text only)")

    import anthropic

    client = anthropic.Anthropic(api_key=_api_key())
    instruction = f"Analyse this document (filename: {filename})."
    if hint_category:
        instruction += f" The user filed it under '{hint_category}'."
    instruction += " Return the JSON described in the system prompt."

    msg = client.messages.create(
        model=model_name(),
        max_tokens=1024,
        system=_SYSTEM,
        messages=[{
            "role": "user",
            "content": [_content_block(file_bytes, content_type), {"type": "text", "text": instruction}],
        }],
    )

    raw = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()
    data = _parse_json(raw)
    return {
        "summary": data.get("summary"),
        "suggested_category": data.get("suggested_category"),
        "extracted": data.get("extracted") or {},
        "model": model_name(),
    }


def _parse_json(raw: str) -> dict:
    """Best-effort JSON parse — strips ```json fences and falls back to the first
    {...} block if the model added stray text."""
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        start, end = s.find("{"), s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(s[start:end + 1])
            except json.JSONDecodeError:
                pass
    return {"summary": raw[:400], "suggested_category": None, "extracted": {}}
