import random
import asyncio
from datetime import datetime
from backend.database.db import SessionLocal
from backend.database.models import Customer, SyncLog
from backend.services import meta_capi_service


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


_task = None


def start_scheduler():
    global _task
    _task = asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    global _task
    if _task:
        _task.cancel()
