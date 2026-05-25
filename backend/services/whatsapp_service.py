import os
import re
import httpx
from datetime import datetime, timezone, timedelta

WHATSAPP_API_TOKEN = os.environ.get("WHATSAPP_API_TOKEN", "")
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")

UAE_TZ = timezone(timedelta(hours=4))
SEND_HOUR_START = 9
SEND_HOUR_END = 18


def is_within_sending_hours() -> bool:
    now_uae = datetime.now(UAE_TZ)
    return SEND_HOUR_START <= now_uae.hour < SEND_HOUR_END


def personalize(template_body: str, partner: dict) -> str:
    return (
        template_body
        .replace("{name}", partner.get("full_name", ""))
        .replace("{company}", partner.get("company", "") or "")
        .replace("{partner_type}", partner.get("partner_type", "") or "")
        .replace("{commission_rate}", str(partner.get("commission_rate", "0.5")) + "%")
    )


async def send_whatsapp_text(to_number: str, message: str) -> dict:
    if not WHATSAPP_API_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return {"error": "WhatsApp not configured", "simulated": True, "message_id": f"sim_{to_number}"}

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": message},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
        data = resp.json()
        if resp.status_code == 200:
            msg_id = data.get("messages", [{}])[0].get("id", "")
            return {"ok": True, "message_id": msg_id}
        return {"error": data.get("error", {}).get("message", "Send failed")}


async def send_whatsapp_template(to_number: str, template_name: str, body_params: list = None, language: str = "en") -> dict:
    if not WHATSAPP_API_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        return {"error": "WhatsApp not configured", "simulated": True, "message_id": f"sim_{to_number}"}

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_API_TOKEN}",
        "Content-Type": "application/json",
    }
    template_block = {"name": template_name, "language": {"code": language}}
    if body_params:
        template_block["components"] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in body_params],
            }
        ]
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": template_block,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
        data = resp.json()
        if resp.status_code == 200:
            msg_id = data.get("messages", [{}])[0].get("id", "")
            return {"ok": True, "message_id": msg_id}
        return {"error": data.get("error", {}).get("message", "Send failed")}


async def get_meta_template_param_count(template_name: str) -> int:
    """Return the number of {{N}} variables in the approved Meta template body."""
    print(f"[META PARAMS] checking template={template_name} has_token={bool(WHATSAPP_API_TOKEN)} has_account={bool(WHATSAPP_BUSINESS_ACCOUNT_ID)}", flush=True)
    if not WHATSAPP_API_TOKEN or not WHATSAPP_BUSINESS_ACCOUNT_ID:
        return 0
    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates"
    headers = {"Authorization": f"Bearer {WHATSAPP_API_TOKEN}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers, params={"name": template_name})
        print(f"[META PARAMS] api_status={resp.status_code} response={resp.text[:300]}", flush=True)
        if resp.status_code != 200:
            return 0
        data = resp.json()
        templates = data.get("data", [])
        if not templates:
            return 0
        for component in templates[0].get("components", []):
            if component.get("type") == "BODY":
                body_text = component.get("text", "")
                count = len(set(re.findall(r"\{\{(\d+)\}\}", body_text)))
                print(f"[META PARAMS] body={body_text!r} count={count}", flush=True)
                return count
    return 0


async def check_template_status(template_name: str) -> dict:
    if not WHATSAPP_API_TOKEN:
        return {"error": "WHATSAPP_API_TOKEN not set in Railway environment variables"}
    if not WHATSAPP_BUSINESS_ACCOUNT_ID:
        return {"error": "WHATSAPP_BUSINESS_ACCOUNT_ID not set in Railway environment variables"}
    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates"
    headers = {"Authorization": f"Bearer {WHATSAPP_API_TOKEN}"}
    params = {"name": template_name.lower().replace(" ", "_")}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers, params=params)
        data = resp.json()
        if resp.status_code != 200:
            return {"error": data.get("error", {}).get("message", f"Meta error {resp.status_code}")}
        templates = data.get("data", [])
        print(f"[TEMPLATE CHECK] name={template_name} response={data}", flush=True)
        if templates:
            t = templates[0]
            print(f"[TEMPLATE CHECK] status={t.get('status')} reason={t.get('rejected_reason', 'none')}", flush=True)
            return {"status": t.get("status", "UNKNOWN"), "found": True, "rejected_reason": t.get("rejected_reason")}
        return {"status": "NOT_FOUND", "found": False}


async def submit_template_to_meta(template_name: str, category: str, body: str, buttons: list) -> dict:
    if not WHATSAPP_API_TOKEN or not WHATSAPP_BUSINESS_ACCOUNT_ID:
        return {"error": "WhatsApp not configured"}

    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_API_TOKEN}",
        "Content-Type": "application/json",
    }
    components = [{"type": "BODY", "text": body}]
    if buttons:
        btn_component = {"type": "BUTTONS", "buttons": []}
        for b in buttons:
            if b.get("type") == "URL":
                btn_component["buttons"].append({"type": "URL", "text": b["text"], "url": b.get("url", "")})
            else:
                btn_component["buttons"].append({"type": "QUICK_REPLY", "text": b["text"]})
        components.append(btn_component)

    payload = {
        "name": template_name.lower().replace(" ", "_"),
        "category": category.upper(),
        "language": "en",
        "components": components,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload, headers=headers)
        data = resp.json()
        print(f"[TEMPLATE SUBMIT] status={resp.status_code} payload={payload} response={data}", flush=True)
        if resp.status_code == 200:
            return {"ok": True, "template_id": data.get("id", "")}
        return {"error": data.get("error", {}).get("message", "Submission failed"), "detail": data}
