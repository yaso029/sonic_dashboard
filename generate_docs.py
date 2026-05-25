"""Generate the branded Sonic CRM system-documentation PDF.

Rewritten in Phase 10 for the UAE marketing-firm CRM (the system was refactored
from a real-estate platform). Run with the project venv:

    .venv\\Scripts\\python.exe generate_docs.py

Produces Sonic_CRM_Documentation.pdf in the repo root. The detailed reference lives
in docs/*.md; this PDF is the polished high-level overview.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from datetime import date

NAVY = colors.HexColor('#0A2342')
GOLD = colors.HexColor('#C9A84C')
LIGHT = colors.HexColor('#F8FAFC')
GRAY = colors.HexColor('#6B7280')
BORDER = colors.HexColor('#E2E8F0')

doc = SimpleDocTemplate(
    "Sonic_CRM_Documentation.pdf",
    pagesize=A4,
    rightMargin=2*cm, leftMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title="Sonic CRM — Marketing Agency System Documentation",
    author="Sonic CRM",
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title', fontSize=28, fontName='Helvetica-Bold', textColor=NAVY, spaceAfter=6, alignment=TA_CENTER)
subtitle_style = ParagraphStyle('Subtitle', fontSize=13, fontName='Helvetica', textColor=GRAY, spaceAfter=4, alignment=TA_CENTER)
h1_style = ParagraphStyle('H1', fontSize=18, fontName='Helvetica-Bold', textColor=NAVY, spaceBefore=20, spaceAfter=8, borderPad=4)
h2_style = ParagraphStyle('H2', fontSize=13, fontName='Helvetica-Bold', textColor=NAVY, spaceBefore=14, spaceAfter=6)
body_style = ParagraphStyle('Body', fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#374151'), spaceAfter=5, leading=16)
bullet_style = ParagraphStyle('Bullet', fontSize=10, fontName='Helvetica', textColor=colors.HexColor('#374151'), spaceAfter=4, leading=15, leftIndent=16, bulletIndent=4)
label_style = ParagraphStyle('Label', fontSize=9, fontName='Helvetica-Bold', textColor=GOLD, spaceAfter=2, spaceBefore=4)
code_style = ParagraphStyle('Code', fontSize=9, fontName='Courier', textColor=NAVY, spaceAfter=4, backColor=LIGHT, leftIndent=10, rightIndent=10, leading=14)

def h1(text): return Paragraph(text, h1_style)
def h2(text): return Paragraph(text, h2_style)
def body(text): return Paragraph(text, body_style)
def bullet(text): return Paragraph(f"• {text}", bullet_style)
def label(text): return Paragraph(text.upper(), label_style)
def code(text): return Paragraph(text, code_style)
def space(n=8): return Spacer(1, n)
def divider(): return HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10, spaceBefore=4)

def section_header(text):
    return Table(
        [[Paragraph(text, ParagraphStyle('SH', fontSize=16, fontName='Helvetica-Bold', textColor=colors.white, spaceAfter=0))]],
        colWidths=['100%'],
        style=TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), NAVY),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LEFTPADDING', (0,0), (-1,-1), 14),
            ('RIGHTPADDING', (0,0), (-1,-1), 14),
            ('ROUNDEDCORNERS', [6]),
        ])
    )

def info_table(rows):
    data = [[Paragraph(k, ParagraphStyle('K', fontSize=9, fontName='Helvetica-Bold', textColor=NAVY)),
             Paragraph(v, ParagraphStyle('V', fontSize=9, fontName='Helvetica', textColor=colors.HexColor('#374151')))]
            for k, v in rows]
    return Table(data, colWidths=[4.5*cm, 12*cm], style=TableStyle([
        ('BACKGROUND', (0,0), (0,-1), LIGHT),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))

def feature_table(headers, rows, col_widths=None):
    data = [[Paragraph(h, ParagraphStyle('TH', fontSize=9, fontName='Helvetica-Bold', textColor=colors.white))
             for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), ParagraphStyle('TD', fontSize=9, fontName='Helvetica', textColor=colors.HexColor('#374151')))
                     for c in row])
    cw = col_widths or [16.5*cm / len(headers)] * len(headers)
    return Table(data, colWidths=cw, style=TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('BACKGROUND', (0,1), (-1,-1), colors.white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))

story = []

# ── COVER PAGE ──────────────────────────────────────────────────────────────
story += [
    space(60),
    Paragraph("SONIC CRM", ParagraphStyle('Cover', fontSize=36, fontName='Helvetica-Bold', textColor=NAVY, alignment=TA_CENTER)),
    space(8),
    Paragraph("Marketing Agency CRM · UAE", ParagraphStyle('CoverSub', fontSize=14, fontName='Helvetica', textColor=GOLD, alignment=TA_CENTER)),
    space(24),
    HRFlowable(width="60%", thickness=2, color=GOLD, hAlign='CENTER'),
    space(24),
    Paragraph("System Documentation", ParagraphStyle('CoverTitle', fontSize=20, fontName='Helvetica-Bold', textColor=NAVY, alignment=TA_CENTER)),
    space(8),
    Paragraph("Clients, services, tasks, documents, UAE VAT billing, compliance, and the client portal", subtitle_style),
    space(60),
    Paragraph(f"Version 2.0  ·  {date.today().strftime('%B %Y')}", ParagraphStyle('Date', fontSize=10, fontName='Helvetica', textColor=GRAY, alignment=TA_CENTER)),
    Paragraph("Confidential — Internal Use Only", ParagraphStyle('Conf', fontSize=9, fontName='Helvetica', textColor=GRAY, alignment=TA_CENTER)),
    PageBreak(),
]

# ── TABLE OF CONTENTS ────────────────────────────────────────────────────────
story += [
    Paragraph("Table of Contents", ParagraphStyle('TOCTitle', fontSize=20, fontName='Helvetica-Bold', textColor=NAVY, spaceAfter=20)),
    divider(),
]
toc_items = [
    ("1.", "System Overview", "3"),
    ("2.", "Architecture & Technology Stack", "3"),
    ("3.", "User Roles & Access (RBAC)", "4"),
    ("4.", "Clients & UAE Tax Profile", "5"),
    ("5.", "Services & Tasks", "6"),
    ("6.", "Documents", "7"),
    ("7.", "Billing — Invoices, Payments, Subscriptions", "8"),
    ("8.", "Compliance & AI", "9"),
    ("9.", "Client Portal", "10"),
    ("10.", "Security", "11"),
    ("11.", "Configuration & Deployment", "12"),
    ("12.", "Data Model", "13"),
]
toc_data = [[
    Paragraph(n, ParagraphStyle('TN', fontSize=10, fontName='Helvetica-Bold', textColor=GOLD)),
    Paragraph(t, ParagraphStyle('TT', fontSize=10, fontName='Helvetica', textColor=NAVY)),
    Paragraph(p, ParagraphStyle('TP', fontSize=10, fontName='Helvetica', textColor=GRAY, alignment=TA_LEFT)),
] for n, t, p in toc_items]
story.append(Table(toc_data, colWidths=[1.2*cm, 13.8*cm, 1.5*cm], style=TableStyle([
    ('TOPPADDING', (0,0), (-1,-1), 8),
    ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ('LINEBELOW', (0,0), (-1,-1), 0.5, BORDER),
    ('LEFTPADDING', (0,0), (-1,-1), 4),
])))
story += [PageBreak()]

# ── 1. SYSTEM OVERVIEW ───────────────────────────────────────────────────────
story += [
    section_header("1. System Overview"),
    space(10),
    body("Sonic CRM is a single-firm client-relationship and practice-management tool for a UAE marketing "
         "firm. It manages the full client lifecycle — lead intake, client onboarding, engagements "
         "(social_media_management, VAT, corporate tax, content_creation, audit, CFO and more), tasks, documents, UAE VAT "
         "invoicing, recurring retainers, a client self-service portal, and an optional AI document-analysis "
         "and compliance-checklist layer."),
    space(6),
    body("It is a single-firm tool by design — there is no multi-tenancy. The whole application runs fully "
         "offline on SQLite and the local filesystem with no external services, unless you opt in to Stripe "
         "(test mode) or Anthropic Claude. The system was refactored from an earlier real-estate platform; "
         "auth, dashboard, HR, calendar, e-cards, notifications and partnerships were retained."),
    space(8),
    h2("Core modules"),
    feature_table(
        ["Module", "Purpose"],
        [
            ["Clients", "Client companies + UAE tax/licensing profile (TRN, CT, trade licence, FY end, ESR)"],
            ["Services", "Engagements per client with recurrence and fees"],
            ["Tasks", "Work items, optionally linked to a client/service"],
            ["Documents", "Client files on pluggable storage with a signed-URL download + access audit"],
            ["Billing", "UAE VAT invoices, manual + Stripe (test) payments, retainers, AR reports"],
            ["Client Portal", "Separate client logins: invoices, pay, documents, status, profile requests"],
            ["Compliance & AI", "Deterministic UAE tax checklist + optional Claude document analysis"],
            ["Security", "Audit log + login lockout (admin viewer / escape hatch)"],
        ],
        [4.5*cm, 12*cm]
    ),
    PageBreak(),
]

# ── 2. ARCHITECTURE ──────────────────────────────────────────────────────────
story += [
    section_header("2. Architecture & Technology Stack"),
    space(10),
    h2("Backend"),
    info_table([
        ("Framework", "FastAPI (Python) — title 'Sonic CRM API', version 2.0.0"),
        ("ORM", "SQLAlchemy 2.0 (DeclarativeBase)"),
        ("Database", "SQLite locally (crm_local.db); PostgreSQL in production"),
        ("Auth", "JWT (python-jose, HS256); staff tokens 8 h, portal tokens 12 h"),
        ("Passwords", "passlib + bcrypt"),
        ("Server", "uvicorn"),
    ]),
    space(10),
    h2("Frontend"),
    info_table([
        ("Framework", "React 19 + Vite 8"),
        ("Routing", "React Router 7"),
        ("Styling", "Tailwind CSS v4 (CSS-first); some legacy screens inline-styled"),
        ("HTTP", "axios — separate staff (api.js) and portal (portalApi.js) clients"),
        ("Charts / DnD / QR", "Recharts · @hello-pangea/dnd · qrcode.react"),
        ("API base", "VITE_API_URL (default http://localhost:8000)"),
    ]),
    space(10),
    h2("Optional integrations (all opt-in, graceful)"),
    feature_table(
        ["Integration", "Used for", "Without it"],
        [
            ["Stripe (TEST mode only)", "Card payments on invoices", "Manual payment recording still works"],
            ["Anthropic Claude", "Document analysis (vision/PDF/text)", "Deterministic tax checklist still works"],
            ["Cloudinary", "HR photos + e-card images only", "Those image uploads disabled"],
            ["Meta WhatsApp / webhooks", "Legacy partnerships outreach", "Partnerships module idle"],
        ],
        [4.5*cm, 6*cm, 6*cm]
    ),
    space(8),
    body("Startup runs in order: create tables, additive SQLite migrations, seed the admin, start the "
         "customer-sync scheduler. Health check: GET / returns the running status and version."),
    PageBreak(),
]

# ── 3. ROLES ─────────────────────────────────────────────────────────────────
story += [
    section_header("3. User Roles & Access (RBAC)"),
    space(10),
    body("Access has three layers: a permission matrix (may this role do this action on this resource?), "
         "row scoping (which records can this user see?), and service-type scoping for specialist roles. "
         "The matrix in backend/services/permissions.py is the single source of truth — it drives the backend "
         "guards, the permissions endpoint, and frontend button-hiding alike."),
    space(8),
    feature_table(
        ["Role", "Access"],
        [
            ["admin", "Full access to everything (the seeded 'Yaso' account)"],
            ["marketing_manager", "Own + team's clients; full billing/documents; can assign and delete tasks"],
            ["marketing_specialist", "Day-to-day work on own assigned clients"],
            ["analyst", "Firm-wide read-only; may update tasks assigned to them"],
            ["social_media_specialist", "Like marketing_specialist, scoped to content_creation services only"],
            ["seo_specialist", "Like marketing_specialist, scoped to VAT / corporate tax / tax consultation services"],
            ["hr_admin", "HR + e-cards only; no marketing access"],
        ],
        [4.5*cm, 12*cm]
    ),
    space(8),
    body("Row scoping (scope_query): admin & analyst see all clients; senior sees own + team; content_creation/tax see "
         "clients having an in-scope service; everyone else sees their own assigned clients. Out-of-scope "
         "records return 404 (not 403) so the API never reveals their existence."),
    PageBreak(),
]

# ── 4. CLIENTS ───────────────────────────────────────────────────────────────
story += [
    section_header("4. Clients & UAE Tax Profile"),
    space(10),
    body("The client record is the hub of the marketing domain. Beyond contact details it captures the "
         "UAE-specific identifiers that drive compliance and invoicing."),
    space(8),
    feature_table(
        ["Field group", "Fields"],
        [
            ["Identity", "company_name, primary contact name / email / phone"],
            ["UAE tax & licensing", "TRN (15-digit VAT), CT registration number, trade licence number + emirate"],
            ["Entity profile", "legal form, industry, fiscal year-end (month/day, default 31 Dec), ESR flag"],
            ["CRM", "status (active/paused/archived), assigned marketing_specialist, source lead, notes"],
        ],
        [4.5*cm, 12*cm]
    ),
    space(8),
    body("Legal forms: LLC, sole establishment, FZC, FZE, branch, free zone, offshore, civil company, other. "
         "Emirates: Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah, Umm Al Quwain. Deleting a "
         "client archives it (status = archived) rather than destroying data. Clients can be created fresh or "
         "converted from a CRM lead."),
    PageBreak(),
]

# ── 5. SERVICES & TASKS ──────────────────────────────────────────────────────
story += [
    section_header("5. Services & Tasks"),
    space(10),
    h2("Services (engagements)"),
    body("A service is an engagement between the firm and a client. The catalog suggests a default recurrence "
         "and a typical AED fee per type."),
    feature_table(
        ["Service type", "Default recurrence", "Typical fee (AED)"],
        [
            ["Social Media Management", "Monthly", "1,500"],
            ["SEO", "Quarterly", "1,000"],
            ["Paid Advertising", "Annual", "3,500"],
            ["Content Creation", "Monthly", "800"],
            ["Audit", "Annual", "8,000"],
            ["Marketing Strategy", "Monthly", "5,000"],
            ["Analytics & Reporting", "Annual", "4,000"],
            ["Website Development", "One-time", "12,000"],
            ["Marketing Consultation", "One-time", "2,000"],
        ],
        [6*cm, 5.25*cm, 5.25*cm]
    ),
    space(8),
    h2("Tasks"),
    body("Tasks track work and can be linked to a client and/or service, or stand alone for internal work. "
         "Priority: low / normal / high / urgent. Status: todo / in_progress / blocked / done (moving to "
         "'done' auto-stamps completion). A user sees tasks assigned to them, created by them, or attached to "
         "a client they can see. Client portal profile-change requests arrive here as tasks for the assigned "
         "marketing_specialist."),
    PageBreak(),
]

# ── 6. DOCUMENTS ─────────────────────────────────────────────────────────────
story += [
    section_header("6. Documents"),
    space(10),
    body("Per-client file storage with a durable access audit trail. The database stores only metadata and an "
         "opaque storage key; the file bytes live in the storage backend (local filesystem by default, "
         "date-sharded; S3/Supabase are reserved extension points selected via STORAGE_BACKEND)."),
    space(8),
    feature_table(
        ["Aspect", "Detail"],
        [
            ["Categories", "trade_license, vat_return, ct_return, financial_statement, bank_statement, invoice, receipt, contract, passport_eid, audit_report, content_creation, other"],
            ["Allowed types", "PDF, images, Word/Excel, CSV, text"],
            ["Size limit", "25 MB by default (MAX_UPLOAD_BYTES)"],
            ["Download", "Short-lived (~5 min) signed HMAC link — opens without a bearer header"],
            ["Audit trail", "Every upload/view/download/delete logged; survives the document's deletion"],
        ],
        [4.5*cm, 12*cm]
    ),
    space(8),
    body("Admins and senior accountants can view a document's full access log. If AI is enabled, supported "
         "documents gain an Analyze action that summarises and extracts key fields."),
    PageBreak(),
]

# ── 7. BILLING ───────────────────────────────────────────────────────────────
story += [
    section_header("7. Billing — Invoices, Payments, Subscriptions"),
    space(10),
    body("UAE VAT invoicing. Local amounts are the source of truth (5% VAT, AED default, TRN shown on the "
         "invoice). Stripe is optional and test-mode only; a live key is refused so the system can never move "
         "real money."),
    space(8),
    h2("Invoices"),
    bullet("Sequential numbers per year: INV-2026-0001. Statuses: draft, sent, partially paid, paid, void."),
    bullet("Created as draft; editable only while draft. VAT and totals are derived from line items."),
    bullet("Send (draft → sent, 30-day terms), Void (only if unpaid), Delete (only draft/void), or generate from a service."),
    space(6),
    h2("Payments"),
    bullet("Record manual payments (cash, bank transfer, card, cheque, stripe, other); status auto-reconciles."),
    bullet("With Stripe enabled: create a card PaymentIntent and Sync the result in — no webhook needed locally."),
    space(6),
    h2("Subscriptions (retainers) & reports"),
    bullet("Recurring monthly/quarterly/annual charges; 'Generate due' materialises invoices and advances the schedule."),
    bullet("Reports: total invoiced/collected/outstanding, VAT collected, and AR aging (current / 1–30 / 31–60 / 61–90 / 90+)."),
    PageBreak(),
]

# ── 8. COMPLIANCE & AI ───────────────────────────────────────────────────────
story += [
    section_header("8. Compliance & AI"),
    space(10),
    h2("Deterministic UAE compliance checklist"),
    body("Each client has a compliance checklist built from their profile and services — no AI, no network, "
         "always available. It is generated by pure rules and returns items tagged ok / upcoming / "
         "action_needed / info, with due dates."),
    feature_table(
        ["Area", "What it checks"],
        [
            ["VAT", "Registration (via TRN) and next quarterly return (28th of month after the period)"],
            ["Paid Advertising (9%)", "Registration (via CT number) and return due 9 months after FY-end"],
            ["ESR", "Notification (6 mo) and report (12 mo) when the ESR flag is set"],
            ["Financial statements", "When the client has an audit or financial-statements service"],
            ["Trade licence", "Annual renewal reminder when a licence number is on file"],
        ],
        [4.5*cm, 12*cm]
    ),
    body("Every checklist carries a disclaimer: these are workflow reminders, not tax or legal advice — "
         "always confirm assigned tax periods with the FTA."),
    space(8),
    h2("AI document analysis (optional)"),
    body("With an Anthropic API key, staff can analyse a document (PDF, image or text). Claude returns a short "
         "summary, a suggested category, and extracted fields, cached on the document. Without a key the "
         "feature is simply hidden and everything else is unaffected. AI output is assistive — always verify."),
    PageBreak(),
]

# ── 9. CLIENT PORTAL ─────────────────────────────────────────────────────────
story += [
    section_header("9. Client Portal"),
    space(10),
    body("A self-service area for clients at /portal, served by /api/portal/*. Portal accounts are a separate "
         "login domain from staff: their tokens carry scope='portal', can only reach portal endpoints, and "
         "every request is hard-scoped to the account's own client — one client can never see another's data."),
    space(8),
    feature_table(
        ["Clients can", "Clients cannot"],
        [
            ["See sent invoices and pay them (if enabled)", "See draft/void invoices"],
            ["Download and upload their documents", "See another client's data"],
            ["See service statuses and open tasks", "See internal task notes/descriptions"],
            ["View their profile and request changes", "Edit the profile directly"],
        ],
        [8.25*cm, 8.25*cm]
    ),
    space(8),
    body("Staff with clients:update manage portal accounts from the client page (Portal Access): create, "
         "rename, reset password, enable/disable. All such changes are audited. Note: today the portal exposes "
         "all of a client's documents — there is no per-document 'internal only' flag yet."),
    PageBreak(),
]

# ── 10. SECURITY ─────────────────────────────────────────────────────────────
story += [
    section_header("10. Security"),
    space(10),
    h2("Two isolated token domains"),
    body("Staff and clients authenticate separately. The staff dependency rejects portal-scoped tokens and "
         "the portal dependency rejects non-portal tokens, so neither can call the other's endpoints — even "
         "though both are signed with the same SECRET_KEY."),
    space(6),
    h2("Login rate limiting"),
    body("An in-memory limiter locks a login after repeated failures (lenient defaults: 5 attempts / 5-minute "
         "window / 5-minute lock; returns HTTP 429). Being in-memory, a backend restart clears all lockouts, "
         "so the local admin can never be permanently locked out; admins also have an explicit unlock endpoint."),
    space(6),
    h2("Audit trail"),
    body("An append-only security audit log records logins, failures, lockouts, logout, and user/portal account "
         "changes. The recorder uses its own session and swallows errors so it can never block the audited "
         "action. Document access (upload/view/download/delete) is logged separately and survives deletion."),
    space(6),
    h2("Production hardening"),
    bullet("Set a strong SECRET_KEY (signs JWTs and document download tokens)."),
    bullet("Change the seeded admin password; restrict CORS; serve over HTTPS."),
    bullet("Use persistent, backed-up document storage and managed Postgres backups."),
    PageBreak(),
]

# ── 11. CONFIGURATION & DEPLOYMENT ───────────────────────────────────────────
story += [
    section_header("11. Configuration & Deployment"),
    space(10),
    h2("Key environment variables"),
    info_table([
        ("DATABASE_URL", "DB connection (SQLite default; Postgres in prod, postgres:// auto-rewritten)"),
        ("SECRET_KEY", "Signs JWTs and document download tokens — set a strong value in prod"),
        ("STORAGE_BACKEND / STORAGE_DIR", "Document storage selector + local path (default local)"),
        ("MAX_UPLOAD_BYTES", "Per-file upload cap (default 25 MB)"),
        ("STRIPE_SECRET_KEY / _PUBLISHABLE_KEY", "Optional Stripe TEST keys (live keys refused)"),
        ("ANTHROPIC_API_KEY / AI_MODEL", "Optional AI analysis (default claude-sonnet-4-6)"),
        ("LOGIN_MAX_ATTEMPTS / LOCKOUT_MINUTES", "Login lockout tuning (lenient defaults)"),
        ("VITE_API_URL", "Frontend's API base (build-time inlined)"),
    ]),
    space(10),
    h2("Deployment"),
    bullet("Backend deploys on Railway via nixpacks: pip install -r requirements.txt, then uvicorn backend.main:app."),
    bullet("requirements.txt must include stripe (imported at startup) and pywebpush; anthropic for AI analysis."),
    bullet("Frontend: build with Vite (npm run build) and serve dist/ as a static SPA with index.html fallback."),
    bullet("Provision Postgres + persistent storage for documents (container FS is ephemeral). Back up DB + storage + audit logs."),
    space(6),
    body("Full reference: docs/CONFIGURATION.md and docs/DEPLOYMENT.md."),
    PageBreak(),
]

# ── 12. DATA MODEL ───────────────────────────────────────────────────────────
story += [
    section_header("12. Data Model"),
    space(10),
    body("All models live in backend/database/models.py. Tables are created on startup; additive SQLite column "
         "migrations run via run_light_migrations(). Single-firm tool — no firm_id anywhere."),
    space(8),
    feature_table(
        ["Table", "Stores"],
        [
            ["users", "Internal staff accounts + roles"],
            ["clients", "Client companies + UAE tax/licensing profile"],
            ["services", "Engagements per client"],
            ["tasks", "Work items (client/service-linked or standalone)"],
            ["documents / document_access_logs", "Client files (metadata) + append-only access trail"],
            ["invoices / invoice_line_items / payments", "UAE VAT invoices, lines, and payments"],
            ["subscriptions", "Recurring retainers that generate invoices"],
            ["client_users", "Client-portal login accounts (separate domain)"],
            ["security_audit_logs", "Append-only security-event trail"],
            ["leads / activities", "CRM inquiry pipeline (convert → client)"],
            ["partners / commissions / *_templates", "Retained partnerships + messaging"],
            ["employees / employee_documents / ecards / calendar_events", "HR, e-cards, calendar"],
        ],
        [6*cm, 10.5*cm]
    ),
    space(20),
    divider(),
    Paragraph("Sonic CRM · Marketing Agency System Documentation · Confidential",
              ParagraphStyle('Footer', fontSize=9, fontName='Helvetica', textColor=GRAY, alignment=TA_CENTER)),
]

doc.build(story)
print("PDF generated: Sonic_CRM_Documentation.pdf")
