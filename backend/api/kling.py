"""Video Studio — Kling AI video generation (ported 1:1 from the standalone
Node/Express app into the dashboard's FastAPI backend).

Three modes: text->video, image+prompt->video, first/last frame->video, plus a
task-status poll endpoint. Kling auth is a short-lived HS256 JWT signed with the
account's access/secret keys.

Optional & graceful (mirrors the Stripe/AI pattern): with no KLING_ACCESS_KEY /
KLING_SECRET_KEY set, endpoints return 503 and the rest of the dashboard is
unaffected. Keys live in environment variables only — never in the repo.
"""
import base64
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from jose import jwt
from pydantic import BaseModel

from backend.database.models import User
from backend.services.auth_service import get_current_user
from backend.services.permissions import can_user

router = APIRouter(prefix="/api/kling", tags=["kling"])


def _require_video_access(current_user: User = Depends(get_current_user)) -> User:
    """Gate generation behind the per-user 'video_studio' module access."""
    if not can_user(current_user, "video_studio", "read"):
        raise HTTPException(status_code=403, detail="You don't have access to Video Studio")
    return current_user

DEFAULT_BASE_URL = "https://api-singapore.klingai.com"
MODEL_NAME = "kling-v3"
_VALID_TASK_TYPES = {"text2video", "image2video"}


def _access_key() -> str:
    import os
    return os.environ.get("KLING_ACCESS_KEY", "").strip()


def _secret_key() -> str:
    import os
    return os.environ.get("KLING_SECRET_KEY", "").strip()


def _base_url() -> str:
    import os
    return os.environ.get("KLING_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL


def is_configured() -> bool:
    return bool(_access_key() and _secret_key())


def _require_configured():
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Video Studio is not configured. Set KLING_ACCESS_KEY and KLING_SECRET_KEY.",
        )


def _sign_kling_token() -> str:
    """Short-lived HS256 JWT, identical to the Node signKlingToken()."""
    now = int(time.time())
    return jwt.encode(
        {"iss": _access_key(), "exp": now + 1800, "nbf": now - 5},
        _secret_key(),
        algorithm="HS256",
        headers={"alg": "HS256", "typ": "JWT"},
    )


async def _kling_fetch(endpoint: str, method: str, body: Optional[dict] = None) -> dict:
    url = f"{_base_url()}{endpoint}"
    token = _sign_kling_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.request(method, url, headers=headers, json=body)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Kling API: {e}")

    try:
        data = resp.json()
    except ValueError:
        data = {"raw": resp.text}

    code = data.get("code")
    if not resp.is_success or (code is not None and code != 0):
        msg = data.get("message") or resp.text
        raise HTTPException(status_code=502, detail=f"Kling API error ({resp.status_code}): {msg}")
    return data


def _task_out(data: dict) -> dict:
    d = data.get("data", {})
    return {"task_id": d.get("task_id"), "status": d.get("task_status")}


# ─── config ─────────────────────────────────────────────────────────────────
@router.get("/config")
def kling_config(current_user: User = Depends(get_current_user)):
    return {"enabled": is_configured(), "model": MODEL_NAME}


# ─── text -> video ──────────────────────────────────────────────────────────
class Text2Video(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = ""
    duration: Optional[str] = "5"
    aspect_ratio: Optional[str] = "16:9"
    mode: Optional[str] = "std"


@router.post("/text-to-video")
async def text_to_video(req: Text2Video, current_user: User = Depends(_require_video_access)):
    _require_configured()
    if not req.prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    payload = {
        "model_name": MODEL_NAME,
        "prompt": req.prompt,
        "negative_prompt": req.negative_prompt or "",
        "cfg_scale": 0.5,
        "mode": req.mode or "std",
        "duration": req.duration or "5",
        "aspect_ratio": req.aspect_ratio or "16:9",
    }
    data = await _kling_fetch("/v1/videos/text2video", "POST", payload)
    return _task_out(data)


# ─── image + prompt -> video ────────────────────────────────────────────────
@router.post("/image-to-video")
async def image_to_video(
    prompt: str = Form(...),
    negative_prompt: str = Form(""),
    duration: str = Form("5"),
    mode: str = Form("std"),
    image: UploadFile = File(...),
    current_user: User = Depends(_require_video_access),
):
    _require_configured()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")
    img_b64 = base64.b64encode(await image.read()).decode()
    payload = {
        "model_name": MODEL_NAME,
        "image": img_b64,
        "prompt": prompt,
        "negative_prompt": negative_prompt or "",
        "cfg_scale": 0.5,
        "mode": mode or "std",
        "duration": duration or "5",
    }
    data = await _kling_fetch("/v1/videos/image2video", "POST", payload)
    return _task_out(data)


# ─── first + last frame -> video ────────────────────────────────────────────
@router.post("/frames-to-video")
async def frames_to_video(
    prompt: str = Form(""),
    negative_prompt: str = Form(""),
    duration: str = Form("5"),
    mode: str = Form("std"),
    first_frame: UploadFile = File(...),
    last_frame: UploadFile = File(...),
    current_user: User = Depends(_require_video_access),
):
    _require_configured()
    payload = {
        "model_name": MODEL_NAME,
        "image": base64.b64encode(await first_frame.read()).decode(),
        "image_tail": base64.b64encode(await last_frame.read()).decode(),
        "prompt": prompt or "",
        "negative_prompt": negative_prompt or "",
        "cfg_scale": 0.5,
        "mode": mode or "std",
        "duration": duration or "5",
    }
    data = await _kling_fetch("/v1/videos/image2video", "POST", payload)
    return _task_out(data)


# ─── poll task status ───────────────────────────────────────────────────────
@router.get("/task/{task_type}/{task_id}")
async def poll_task(task_type: str, task_id: str, current_user: User = Depends(_require_video_access)):
    _require_configured()
    if task_type not in _VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail="Invalid task type")
    data = await _kling_fetch(f"/v1/videos/{task_type}/{task_id}", "GET")
    t = data.get("data", {})
    result = t.get("task_result") or {}
    return {
        "task_id": t.get("task_id"),
        "status": t.get("task_status"),
        "status_msg": t.get("task_status_msg") or "",
        "videos": result.get("videos") or [],
        "created_at": t.get("created_at"),
        "updated_at": t.get("updated_at"),
    }
