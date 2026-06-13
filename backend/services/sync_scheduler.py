import random
import asyncio
from datetime import datetime, date
from backend.database.db import SessionLocal
from backend.database.models import Customer, SyncLog, Bill
from backend.services import meta_capi_service, notification_service


async def auto_sync_batch():
    db = SessionLocal()
    try:
        unsynced = db.query(Customer).filter(Customer.synced_to_meta == False).all()
        if not unsynced:
            print("[AUTOSYNC] No unsynced customers remaining", flush=True)
            return

        batch_size = random.randint(7, 10)
        batch = random.sample(unsynced, min(batch_size, len(unsynced)))
        print(f"[AUTOSYNC] Starting batch of {len(batch)} customers", flush=True)

        synced = 0
        failed = 0
        for customer in batch:
            result = await meta_capi_service.send_stage_event({
                "stage": "deal_closed",
                "phone": customer.phone,
                "email": customer.email,
                "budget": None,
            })
            if not result.get("error") and not result.get("skipped"):
                customer.synced_to_meta = True
                customer.synced_at = datetime.utcnow()
                synced += 1
            else:
                failed += 1

        log = SyncLog(synced_count=synced, failed_count=failed, triggered_by="auto")
        db.add(log)
        db.commit()
        print(f"[AUTOSYNC] Done: {synced} synced, {failed} failed", flush=True)
    except Exception as e:
        print(f"[AUTOSYNC] Error: {e}", flush=True)
    finally:
        db.close()


async def _scheduler_loop():
    print("[AUTOSYNC] Scheduler started — first batch in 60 seconds", flush=True)
    await asyncio.sleep(60)
    while True:
        await auto_sync_batch()
        await asyncio.sleep(3600)


def check_bill_reminders():
    """Notify all admins about Bills whose expires_at is within reminder_days.
    Each bill is reminded at most once per 24h via `last_reminded_at`."""
    db = SessionLocal()
    try:
        today = date.today()
        bills = db.query(Bill).filter(Bill.expires_at != None).all()
        reminded = 0
        for b in bills:
            try:
                exp = date.fromisoformat(b.expires_at)
            except (ValueError, TypeError):
                continue
            days_left = (exp - today).days
            window = b.reminder_days or 7
            # Remind only when within the reminder window (or expired today).
            if days_left < 0 or days_left > window:
                continue
            if b.last_reminded_at and (datetime.utcnow() - b.last_reminded_at).total_seconds() < 86400:
                continue
            label = f"in {days_left} day{'s' if days_left != 1 else ''}" if days_left > 0 else "today"
            msg = f"⏰ Renewal due {label}: {b.title}{(' (' + b.vendor + ')') if b.vendor else ''} — expires {b.expires_at}"
            try:
                notification_service.notify_admins(db, msg)
            except Exception as e:
                print(f"[BILL-REMINDER] notify failed: {e}", flush=True)
                continue
            b.last_reminded_at = datetime.utcnow()
            db.commit()
            reminded += 1
        if reminded:
            print(f"[BILL-REMINDER] sent {reminded} reminder(s)", flush=True)
    except Exception as e:
        print(f"[BILL-REMINDER] error: {e}", flush=True)
    finally:
        db.close()


async def _bill_reminder_loop():
    print("[BILL-REMINDER] Scheduler started — first check in 120s", flush=True)
    await asyncio.sleep(120)
    while True:
        check_bill_reminders()
        await asyncio.sleep(6 * 3600)  # every 6 hours


_task = None
_bill_task = None


def start_scheduler():
    global _task, _bill_task
    _task = asyncio.create_task(_scheduler_loop())
    _bill_task = asyncio.create_task(_bill_reminder_loop())


def stop_scheduler():
    global _task, _bill_task
    if _task:
        _task.cancel()
    if _bill_task:
        _bill_task.cancel()
