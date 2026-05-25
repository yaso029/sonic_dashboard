"""Phase 4 — pluggable document storage.

Local-first by design: documents live on the local filesystem under STORAGE_DIR
so the whole app runs with no external service. The Storage interface is
deliberately small (save / open / delete / exists) so an S3 or Supabase adapter
can be dropped in later by setting STORAGE_BACKEND, without touching the API layer.

"Signed URLs" are emulated locally with short-lived HMAC tokens (see
make_download_token / verify_download_token). The same `signed_url_for()` concept
would return a real presigned URL from an S3/Supabase backend in production.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from datetime import datetime
from typing import BinaryIO, Optional

from backend.services.auth_service import SECRET_KEY

# ─── Config ───────────────────────────────────────────────────────────────────

STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local").lower()
# Default: <cwd>/storage/documents  (uvicorn runs from the repo root)
STORAGE_DIR = os.environ.get("STORAGE_DIR", os.path.join(os.getcwd(), "storage", "documents"))

# 25 MB default cap; overridable via env.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))

# Content types we accept for client documents.
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "text/plain",
}


# ─── Storage interface ──────────────────────────────────────────────────────────

class Storage:
    """Minimal storage contract. Implementations must be safe for concurrent use."""

    def save(self, data: bytes, original_name: str) -> str:
        """Persist bytes; return an opaque storage key used to retrieve later."""
        raise NotImplementedError

    def open(self, key: str) -> BinaryIO:
        """Return a readable binary stream for the stored object."""
        raise NotImplementedError

    def delete(self, key: str) -> bool:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class LocalStorage(Storage):
    """Filesystem backend. Keys are date-sharded relative paths under STORAGE_DIR."""

    def __init__(self, base_dir: str = STORAGE_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _abs(self, key: str) -> str:
        # Normalise and confine to base_dir (defence against path traversal).
        full = os.path.normpath(os.path.join(self.base_dir, key))
        if not full.startswith(os.path.normpath(self.base_dir)):
            raise ValueError("Invalid storage key")
        return full

    def save(self, data: bytes, original_name: str) -> str:
        ext = os.path.splitext(original_name)[1][:20]  # keep a sane extension
        shard = datetime.utcnow().strftime("%Y/%m")
        key = f"{shard}/{uuid.uuid4().hex}{ext}"
        full = self._abs(key)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(data)
        return key

    def open(self, key: str) -> BinaryIO:
        return open(self._abs(key), "rb")

    def delete(self, key: str) -> bool:
        try:
            os.remove(self._abs(key))
            return True
        except FileNotFoundError:
            return False

    def exists(self, key: str) -> bool:
        return os.path.isfile(self._abs(key))


def get_storage() -> Storage:
    """Factory keyed on STORAGE_BACKEND. Local today; S3/Supabase are documented
    extension points so production can swap backends via env only."""
    if STORAGE_BACKEND == "local":
        return LocalStorage()
    if STORAGE_BACKEND in ("s3", "supabase"):
        raise NotImplementedError(
            f"STORAGE_BACKEND='{STORAGE_BACKEND}' is not wired yet. Implement a "
            f"Storage subclass (save/open/delete/exists) and return it here. "
            f"Local-only deployment uses STORAGE_BACKEND=local."
        )
    raise ValueError(f"Unknown STORAGE_BACKEND: {STORAGE_BACKEND}")


# ─── Signed download tokens (local presigned-URL emulation) ───────────────────

def make_download_token(document_id: int, ttl_seconds: int = 300) -> tuple[str, int]:
    """Return (token, expires_at_epoch). Token authorises downloading one document
    until it expires, without needing the Authorization header (so it works in a
    plain <a href> / new browser tab)."""
    expires_at = int(time.time()) + ttl_seconds
    payload = json.dumps({"d": document_id, "e": expires_at}, separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    sig = _sign(body)
    return f"{body}.{sig}", expires_at


def verify_download_token(token: str, document_id: int) -> bool:
    """True iff the token is well-formed, signed by us, not expired, and bound to
    this document id."""
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return False
    if not hmac.compare_digest(sig, _sign(body)):
        return False
    try:
        padded = body + "=" * (-len(body) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        return False
    if data.get("d") != document_id:
        return False
    if int(data.get("e", 0)) < int(time.time()):
        return False
    return True


def _sign(body: str) -> str:
    return hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
