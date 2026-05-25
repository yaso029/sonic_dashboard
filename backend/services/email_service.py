import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "partnerships@sonic.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")


def personalize(text: str, partner: dict) -> str:
    return (
        text
        .replace("{name}", partner.get("full_name", ""))
        .replace("{company}", partner.get("company", "") or "")
        .replace("{partner_type}", partner.get("partner_type", "") or "")
        .replace("{commission_rate}", str(partner.get("commission_rate", "0.5")) + "%")
    )


def send_email(to_email: str, subject: str, body_html: str) -> dict:
    if not SMTP_PASSWORD:
        return {"ok": True, "simulated": True, "message_id": f"sim_{to_email}"}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_EMAIL
        msg["To"] = to_email
        msg.attach(MIMEText(body_html, "html"))

        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        return {"ok": True, "message_id": f"email_{to_email}_{subject[:20]}"}
    except Exception as e:
        return {"error": str(e)}
