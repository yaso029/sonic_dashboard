from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database.db import engine, Base
from backend.database import models
from backend.database.db import SessionLocal, run_light_migrations
from backend.services.auth_service import hash_password
from backend.api import auth, users, leads, webhook, notifications, dashboard, import_leads, customers
from backend.services.sync_scheduler import start_scheduler, stop_scheduler
from backend.api import partners, whatsapp_routes, email_routes, commissions, partnerships_dashboard
from backend.api import public_referral
from backend.api import referral_applications
from backend.api import hr
from backend.api import calendar as calendar_routes
from backend.api import ecards as ecards_routes
from backend.api import clients as clients_routes
from backend.api import services as services_routes
from backend.api import tasks as tasks_routes
from backend.api import documents as documents_routes
from backend.api import invoices as invoices_routes
from backend.api import payments as payments_routes
from backend.api import subscriptions as subscriptions_routes
from backend.api import billing as billing_routes
from backend.api import portal as portal_routes
from backend.api import portal_admin as portal_admin_routes
from backend.api import ai as ai_routes
from backend.api import security as security_routes
from backend.api import reports as reports_routes
from backend.api import team_tasks as team_tasks_routes
from backend.api import kling as kling_routes
import os

app = FastAPI(title="Sonic CRM API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CRM routes
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(leads.router)
app.include_router(webhook.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(import_leads.router)
app.include_router(customers.router)

# Partnerships routes
app.include_router(partners.router)
app.include_router(whatsapp_routes.router)
app.include_router(email_routes.router)
app.include_router(commissions.router)
app.include_router(partnerships_dashboard.router)

# Referral applications — public form + authenticated management
app.include_router(public_referral.router)
app.include_router(referral_applications.router)

# HR module — admin only
app.include_router(hr.router)

# Calendar module — all authenticated users
app.include_router(calendar_routes.router)

# E-Cards — HR manages, all users view
app.include_router(ecards_routes.router)

# Marketing domain (Phase 2): Clients, Services, Tasks
app.include_router(clients_routes.router)
app.include_router(services_routes.router)
app.include_router(tasks_routes.router)

# Documents (Phase 4): client files + signed-URL downloads + access audit
app.include_router(documents_routes.router)

# Billing (Phase 5): invoices, payments (manual + Stripe test mode), subscriptions, reports
app.include_router(invoices_routes.router)
app.include_router(payments_routes.router)
app.include_router(subscriptions_routes.router)
app.include_router(billing_routes.router)

# Client Portal (Phase 6): external client logins (portal-scoped) + staff management
app.include_router(portal_routes.router)
app.include_router(portal_admin_routes.router)

# AI + compliance (Phase 7): tax checklist (deterministic) + document analysis (optional Claude)
app.include_router(ai_routes.router)

# Security (Phase 9): audit-log viewer + lockout reset (admin)
app.include_router(security_routes.router)

# Client Reports — management dashboard aggregations (CRM module)
app.include_router(reports_routes.router)

# Team Task Management — admin-assigned internal tasks worked by team members
app.include_router(team_tasks_routes.router)

# Video Studio — Kling AI video generation (text/image/frames -> video)
app.include_router(kling_routes.router)


def seed_admin():
    db = SessionLocal()
    try:
        NEW_EMAIL = "yaso@sonic.com"
        # Migrate any existing admin (including pre-rebrand Sonic emails) by the
        # stable login name, so the account's email updates in place — no duplicate.
        existing = db.query(models.User).filter(models.User.full_name.ilike("Yaso")).first()
        if not existing:
            existing = db.query(models.User).filter(models.User.email == NEW_EMAIL).first()
        if existing:
            existing.full_name = "Yaso"
            existing.email = NEW_EMAIL
            existing.password_hash = hash_password("Yaso@123")
            existing.role = "admin"
            existing.is_active = True
            db.commit()
        else:
            db.add(models.User(
                full_name="Yaso",
                email=NEW_EMAIL,
                password_hash=hash_password("Yaso@123"),
                role="admin",
                is_active=True,
            ))
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)
    run_light_migrations()
    seed_admin()
    start_scheduler()


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


@app.get("/")
def root():
    return {"status": "Sonic CRM API running", "version": "2.0.0"}
