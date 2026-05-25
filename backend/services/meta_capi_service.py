import os
import hashlib
import time
import httpx
import logging

logger = logging.getLogger(__name__)

META_PIXEL_ID = os.environ.get("META_PIXEL_ID", "")
META_CAPI_TOKEN = os.environ.get("META_CAPI_TOKEN", "")

STAGE_EVENTS = {
    "follow_up": "Lead",
    "pre_meeting": "Schedule",
    "meeting_done": "ViewContent",
    "deal_closed": "Purchase",
}


def _hash(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode()).hexdigest()


def _clean_phone(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


async def send_stage_event(lead: dict) -> dict:
    stage = lead.get("stage")
    event_name = STAGE_EVENTS.get(stage)
    print(f"[CAPI] stage={stage} event={event_name} pixel={META_PIXEL_ID} token_set={bool(META_CAPI_TOKEN)}", flush=True)

    if not event_name:
        print(f"[CAPI] no event mapped for stage '{stage}', skipping", flush=True)
        return {"skipped": True, "reason": f"No event for stage '{stage}'"}

    if not META_PIXEL_ID or not META_CAPI_TOKEN:
        print("[CAPI] META_PIXEL_ID or META_CAPI_TOKEN not set in environment", flush=True)
        return {"skipped": True, "reason": "META_PIXEL_ID or META_CAPI_TOKEN not configured"}

    user_data = {}
    phone = lead.get("phone", "")
    email = lead.get("email", "")
    if phone:
        cleaned = _clean_phone(phone)
        if cleaned:
            user_data["ph"] = [_hash(cleaned)]
    if email:
        user_data["em"] = [_hash(email)]

    event = {
        "event_name": event_name,
        "event_time": int(time.time()),
        "action_source": "system_generated",
        "user_data": user_data,
        "custom_data": {},
    }

    budget = lead.get("budget")
    if event_name == "Purchase":
        event["custom_data"]["currency"] = "AED"
        try:
            event["custom_data"]["value"] = float(budget) if budget else 0
        except (ValueError, TypeError):
            event["custom_data"]["value"] = 0

    payload = {"data": [event]}
    test_code = os.environ.get("META_CAPI_TEST_CODE", "")
    if test_code:
        payload["test_event_code"] = test_code

    url = f"https://graph.facebook.com/v18.0/{META_PIXEL_ID}/events"
    params = {"access_token": META_CAPI_TOKEN}

    print(f"[CAPI] sending {event_name} to pixel {META_PIXEL_ID}", flush=True)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload, params=params)
        data = resp.json()
        print(f"[CAPI] response status={resp.status_code} body={data}", flush=True)
        if resp.status_code == 200:
            return {"ok": True, "event": event_name, "events_received": data.get("events_received")}
        return {"error": data.get("error", {}).get("message", "CAPI error"), "event": event_name}
