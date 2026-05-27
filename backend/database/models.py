from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import relationship
from .db import Base


# ─── Core: users, auth, push notifications, e-cards ───────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String(500), nullable=False)
    role = Column(String(30), nullable=False, default="marketing_specialist")
    team_leader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    # Optional per-user permission override: { resource: [actions] }. NULL/empty =>
    # use the role's default permissions. Admins are always full regardless.
    permissions = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    team_leader = relationship(
        "User", remote_side=[id], foreign_keys=[team_leader_id],
        back_populates="team_members"
    )
    team_members = relationship(
        "User", foreign_keys=[team_leader_id],
        back_populates="team_leader", overlaps="team_leader"
    )
    leads_assigned = relationship("Lead", foreign_keys="Lead.assigned_to", back_populates="assignee")
    leads_created = relationship("Lead", foreign_keys="Lead.created_by", back_populates="creator")
    notifications = relationship("Notification", back_populates="user")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class ECard(Base):
    __tablename__ = "ecards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(200), nullable=False)
    job_title = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    whatsapp = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    website = Column(String(200), nullable=True)
    linkedin = Column(String(200), nullable=True)
    photo_url = Column(String(500), nullable=True)
    photo_public_id = Column(String(300), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", foreign_keys=[user_id])


# ─── CRM: leads, activities, notifications ────────────────────────────────────
# NOTE: Lead is the inquiry-stage record. Phase 2 will introduce Client (post-conversion)
# and Service (engagement) models. For Phase 1, kept Lead generic — RE-specific
# property_type/preferred_area columns removed.

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(50))
    email = Column(String(200))
    company = Column(String(200), nullable=True)
    source = Column(String(50), default="other")
    estimated_value = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    stage = Column(String(50), default="inquiry")
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="leads_assigned")
    creator = relationship("User", foreign_keys=[created_by], back_populates="leads_created")
    activities = relationship("Activity", back_populates="lead", cascade="all, delete-orphan")
    commissions = relationship("Commission", back_populates="lead")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    type = Column(String(30), default="note")
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="activities")
    user = relationship("User", foreign_keys=[user_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False)
    lead_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")


# ─── Meta CAPI / customer sync (kept; generic contact records) ────────────────

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    synced_to_meta = Column(Boolean, default=False)
    synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    synced_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    triggered_by = Column(String(20), default="auto")
    created_at = Column(DateTime, default=datetime.utcnow)


# ─── Partnerships / Referral ──────────────────────────────────────────────────

class Partner(Base):
    __tablename__ = "partners"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    whatsapp_number = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    company = Column(String(200), nullable=True)
    partner_type = Column(String(100), default="Other")
    status = Column(String(50), default="New")
    commission_rate = Column(Float, default=0.5)
    total_referrals = Column(Integer, default=0)
    total_deals_closed = Column(Integer, default=0)
    total_commission_earned = Column(Float, default=0.0)
    last_contacted_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship("OutreachMessage", back_populates="partner", cascade="all, delete-orphan")
    replies = relationship("IncomingReply", back_populates="partner", cascade="all, delete-orphan")
    commissions = relationship("Commission", back_populates="partner")


# ─── HR ───────────────────────────────────────────────────────────────────────

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    photo_url = Column(String(500), nullable=True)
    photo_public_id = Column(String(300), nullable=True)
    full_name = Column(String(200), nullable=False)
    job_title = Column(String(200), nullable=True)
    department = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True)
    nationality = Column(String(10), nullable=True)
    date_of_birth = Column(String(20), nullable=True)
    date_joined = Column(String(20), nullable=True)
    employment_type = Column(String(50), default='full_time')
    status = Column(String(50), default='active')
    emirates_id = Column(String(100), nullable=True)
    emirates_id_expiry = Column(String(20), nullable=True)
    passport_number = Column(String(100), nullable=True)
    passport_expiry = Column(String(20), nullable=True)
    visa_expiry = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("EmployeeDocument", back_populates="employee", cascade="all, delete-orphan")


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    label = Column(String(200), nullable=False)
    file_url = Column(String(500), nullable=False)
    file_public_id = Column(String(300), nullable=True)
    file_name = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    employee = relationship("Employee", back_populates="documents")


class ReferralApplication(Base):
    __tablename__ = "referral_applications"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(50), nullable=False)
    email = Column(String(200), nullable=True)
    job = Column(String(200), nullable=True)
    nationality = Column(String(10), nullable=True)
    language = Column(String(5), default='en')
    agreed_to_terms = Column(Boolean, default=False)
    status = Column(String(50), default='interested')
    assigned_to = Column(Integer, ForeignKey('users.id'), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    assigned_user = relationship("User", foreign_keys=[assigned_to])


# ─── Messaging: WhatsApp + Email ──────────────────────────────────────────────

class WhatsAppTemplate(Base):
    __tablename__ = "whatsapp_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category = Column(String(50), default="MARKETING")
    body = Column(Text, nullable=False)
    buttons = Column(JSON, nullable=True)
    meta_status = Column(String(50), default="pending")
    meta_template_id = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    subject = Column(String(500), nullable=False)
    body_html = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OutreachMessage(Base):
    __tablename__ = "outreach_messages"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=False)
    channel = Column(String(20), nullable=False)
    template_id = Column(Integer, nullable=True)
    message_body = Column(Text, nullable=True)
    subject = Column(String(500), nullable=True)
    sent_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="sent")
    message_id = Column(String(200), nullable=True)

    partner = relationship("Partner", back_populates="messages")


class IncomingReply(Base):
    __tablename__ = "incoming_replies"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=True)
    channel = Column(String(20), default="whatsapp")
    message_body = Column(Text, nullable=False)
    from_number = Column(String(50), nullable=True)
    received_at = Column(DateTime, default=datetime.utcnow)
    ai_suggestion = Column(String(50), nullable=True)
    action_taken = Column(String(50), nullable=True)

    partner = relationship("Partner", back_populates="replies")


# ─── Commissions (kept for Phase 1; rename → Invoices in Phase 5) ─────────────

class Commission(Base):
    __tablename__ = "commissions"

    id = Column(Integer, primary_key=True, index=True)
    partner_id = Column(Integer, ForeignKey("partners.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)
    referred_client_name = Column(String(200), nullable=True)
    deal_value = Column(Float, default=0.0)
    commission_rate = Column(Float, default=0.5)
    commission_amount = Column(Float, default=0.0)
    status = Column(String(20), default="pending")
    paid_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    partner = relationship("Partner", back_populates="commissions")
    lead = relationship("Lead", back_populates="commissions")


# ─── Marketing domain (Phase 2): Client, Service, Task ───────────────────────
# UAE-focused: TRN (15-digit VAT), CT registration, FTA emirate, ESR flag.

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(300), nullable=False)
    primary_contact_name = Column(String(200), nullable=True)
    primary_email = Column(String(200), nullable=True, index=True)
    primary_phone = Column(String(50), nullable=True)

    # UAE tax + licensing identifiers
    trn = Column(String(20), nullable=True, index=True)  # 15-digit Tax Registration Number
    ct_registration_number = Column(String(50), nullable=True)
    trade_license_number = Column(String(100), nullable=True)
    trade_license_emirate = Column(String(50), nullable=True)  # Dubai, Abu Dhabi, Sharjah, etc.

    # Entity profile
    legal_form = Column(String(50), nullable=True)  # llc, sole_establishment, fzc, fze, branch, free_zone, offshore
    industry = Column(String(100), nullable=True)
    fiscal_year_end_month = Column(Integer, nullable=True, default=12)  # 1-12
    fiscal_year_end_day = Column(Integer, nullable=True, default=31)    # 1-31
    esr_applicable = Column(Boolean, default=False)  # Economic Substance Regulations

    # CRM
    status = Column(String(30), nullable=False, default="active")  # active, paused, archived
    assigned_accountant_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=True)  # conversion source
    notes = Column(Text, nullable=True)
    stripe_customer_id = Column(String(80), nullable=True)  # Phase 5: lazily created Stripe customer (test mode)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_accountant = relationship("User", foreign_keys=[assigned_accountant_id])
    source_lead = relationship("Lead", foreign_keys=[lead_id])
    services = relationship("Service", back_populates="client", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="client")
    documents = relationship("Document", back_populates="client", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="client", cascade="all, delete-orphan")


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    service_type = Column(String(50), nullable=False)
    # service_type values: social_media_management, seo, paid_advertising, content_creation,
    # audit, marketing_strategy, analytics_reporting, website_development, marketing_consultation
    status = Column(String(30), nullable=False, default="active")  # active, paused, completed, cancelled
    recurrence = Column(String(20), default="one_time")  # one_time, monthly, quarterly, annual
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    start_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    end_date = Column(String(20), nullable=True)
    fee_amount = Column(Float, default=0.0)
    fee_currency = Column(String(10), default="AED")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="services")
    assignee = relationship("User", foreign_keys=[assigned_to])
    tasks = relationship("Task", back_populates="service")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    priority = Column(String(20), default="normal")  # low, normal, high, urgent
    status = Column(String(20), default="todo")  # todo, in_progress, blocked, done
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="tasks")
    service = relationship("Service", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])


# ─── Team Task Management: admin-assigned internal team work items ─────────────
# Distinct from the client-linked `Task` above. An admin creates and assigns a
# team task and is the only one who can mark it DONE or delete it. The assigned
# team member moves their own task through In Progress / Review and updates its
# progress %, optionally leaving a progress note. Admins can leave review notes.

class TeamTask(Base):
    __tablename__ = "team_tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String(20), default="todo")        # todo, in_progress, review, done
    progress_percent = Column(Integer, default=0)       # 0..100
    priority = Column(String(20), default="normal")     # low, normal, high, urgent
    due_date = Column(String(20), nullable=True)        # YYYY-MM-DD
    review_notes = Column(Text, nullable=True)          # admin feedback to the assignee
    member_note = Column(Text, nullable=True)           # assignee's latest progress note
    started_at = Column(DateTime, nullable=True)        # stamped on first move to in_progress
    completed_at = Column(DateTime, nullable=True)      # stamped when marked done
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])


# ─── Notes: personal notepad files, private to each user ──────────────────────
class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(300), nullable=False, default="Untitled note")
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", foreign_keys=[user_id])


# ─── Internal messaging: direct messages between staff/admin ──────────────────
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])


# ─── Documents (Phase 4): client files + access audit trail ───────────────────
# Storage-backend-agnostic: `stored_key` is an opaque key resolved by
# backend/services/storage_service.py (local filesystem today; S3/Supabase later).

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    file_name = Column(String(400), nullable=False)       # original filename
    stored_key = Column(String(500), nullable=False)      # opaque key in the storage backend
    content_type = Column(String(150), nullable=True)
    size_bytes = Column(Integer, default=0)
    category = Column(String(60), default="other")        # trade_license, vat_return, ct_return, etc.
    notes = Column(Text, nullable=True)
    # Phase 6: when a client uploads via the portal, uploaded_by is null and this
    # records which portal account did it (provenance).
    uploaded_by_portal_user_id = Column(Integer, ForeignKey("client_users.id"), nullable=True)
    # Phase 7: cached AI analysis (Anthropic). Null until analysed.
    ai_summary = Column(Text, nullable=True)
    ai_extracted = Column(JSON, nullable=True)
    ai_analyzed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", back_populates="documents")
    service = relationship("Service", foreign_keys=[service_id])
    uploader = relationship("User", foreign_keys=[uploaded_by])
    portal_uploader = relationship("ClientUser", foreign_keys=[uploaded_by_portal_user_id])


class DocumentAccessLog(Base):
    __tablename__ = "document_access_logs"

    # Durable audit trail: intentionally NOT a cascade child of Document, so the
    # record of who uploaded/viewed/downloaded/deleted a file survives the file's
    # deletion. document_id is kept as a historical reference (no ORM relationship,
    # so deleting a Document never touches these rows).
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(20), nullable=False)           # upload, view, download, delete
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


# ─── Billing (Phase 5): invoices, line items, payments, subscriptions ─────────
# UAE-focused: AED default, 5% VAT, TRN shown on invoice. Stripe is optional and
# test-mode only (see backend/services/stripe_service.py); all amount fields are
# the source of truth locally, Stripe ids are just references.

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(40), unique=True, index=True, nullable=False)  # e.g. INV-2026-0001
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)

    status = Column(String(20), nullable=False, default="draft")  # draft, sent, paid, partially_paid, overdue, void
    currency = Column(String(10), default="AED")
    issue_date = Column(String(20), nullable=True)   # YYYY-MM-DD
    due_date = Column(String(20), nullable=True)

    subtotal = Column(Float, default=0.0)
    vat_rate = Column(Float, default=5.0)             # UAE standard 5%
    vat_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)

    notes = Column(Text, nullable=True)
    stripe_payment_intent_id = Column(String(80), nullable=True)
    stripe_invoice_id = Column(String(80), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="invoices")
    service = relationship("Service", foreign_keys=[service_id])
    creator = relationship("User", foreign_keys=[created_by])
    line_items = relationship("InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    description = Column(String(500), nullable=False)
    quantity = Column(Float, default=1.0)
    unit_price = Column(Float, default=0.0)
    line_total = Column(Float, default=0.0)

    invoice = relationship("Invoice", back_populates="line_items")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, index=True)
    amount = Column(Float, default=0.0)
    currency = Column(String(10), default="AED")
    method = Column(String(30), default="bank_transfer")  # cash, bank_transfer, card, cheque, stripe, other
    reference = Column(String(200), nullable=True)
    paid_at = Column(String(20), nullable=True)            # YYYY-MM-DD
    stripe_payment_intent_id = Column(String(80), nullable=True)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")
    recorder = relationship("User", foreign_keys=[recorded_by])


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)
    description = Column(String(300), nullable=True)
    amount = Column(Float, default=0.0)                  # recurring net amount (VAT added at invoice time)
    currency = Column(String(10), default="AED")
    interval = Column(String(20), default="monthly")     # monthly, quarterly, annual
    status = Column(String(20), default="active")        # active, paused, cancelled
    next_invoice_date = Column(String(20), nullable=True)  # YYYY-MM-DD when the next invoice is due to be generated
    last_invoiced_date = Column(String(20), nullable=True)
    stripe_subscription_id = Column(String(80), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("Client", back_populates="subscriptions")
    service = relationship("Service", foreign_keys=[service_id])
    creator = relationship("User", foreign_keys=[created_by])


# ─── Client Portal (Phase 6): external client login accounts ──────────────────
# Separate from the internal `users` table — a different security domain. Portal
# JWTs carry scope="portal" and can only reach /api/portal/* endpoints, always
# scoped to this account's client_id.

class ClientUser(Base):
    __tablename__ = "client_users"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password_hash = Column(String(500), nullable=False)
    full_name = Column(String(200), nullable=True)       # contact person name
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # staff who invited
    created_at = Column(DateTime, default=datetime.utcnow)

    client = relationship("Client", foreign_keys=[client_id])
    creator = relationship("User", foreign_keys=[created_by])


# ─── Security audit (Phase 9): tamper-evident trail of security events ─────────
# Durable, append-only. Records logins, failed logins, lockouts, and account /
# role changes. No cascade — entries outlive the users they reference.

class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    # login_success, login_failed, login_locked, logout,
    # user_created, user_updated, user_deactivated, password_reset,
    # portal_user_created, portal_user_updated, portal_user_disabled,
    # portal_login_success, portal_login_failed, account_unlocked
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_label = Column(String(200), nullable=True)   # email/name even if no FK
    target_type = Column(String(40), nullable=True)    # user, portal_user, client
    target_id = Column(Integer, nullable=True)
    detail = Column(String(500), nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    actor = relationship("User", foreign_keys=[actor_user_id])


# ─── Calendar (generic events; kept) ──────────────────────────────────────────

class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    date = Column(String(20), nullable=False)
    time_start = Column(String(10), nullable=True)
    time_end = Column(String(10), nullable=True)
    location = Column(String(500), nullable=True)
    hosted_by = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    image_public_id = Column(String(300), nullable=True)
    visibility = Column(String(20), default='everyone')
    status = Column(String(20), default='pending')
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])
    approver = relationship("User", foreign_keys=[approved_by])
