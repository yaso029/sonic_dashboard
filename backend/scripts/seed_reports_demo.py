"""Seed realistic UAE marketing demo data for the Client Reports dashboard.

Idempotent and NON-destructive: it never deletes existing rows. It guards on a
marker client ("Gulf Horizon Trading LLC") — if that already exists the script
exits without doing anything, so it is safe to run repeatedly.

Run from the project root (the folder containing the `backend` package):

    python -m backend.scripts.seed_reports_demo

Creates ~18 clients across emirates / industries, each with services, tasks and
a stream of monthly + one-off invoices and payments spread over the last six
months, so every section of the reports page has meaningful data.
"""
from datetime import datetime, date, timedelta

from backend.database.db import SessionLocal, engine, Base
from backend.database import models
from backend.database.models import (
    Client, Service, Task, Invoice, InvoiceLineItem, Payment, User,
)

MARKER = "Gulf Horizon Trading LLC"
TODAY = date(2026, 5, 21)


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    last_day = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, last_day))


# (company, contact, email, phone, trn, ct_reg, license_no, emirate, legal_form,
#  industry, fye_month, fye_day, accountant_id, months_ago_created, status)
CLIENTS = [
    ("Gulf Horizon Trading LLC", "Omar Al Farsi", "omar@gulfhorizon.ae", "+971501112233", "100111222300003", "CT-100111", "DED-554120", "Dubai", "llc", "Trading", 12, 31, 2, 16, "active"),
    ("Blue Marlin Restaurants LLC", "Layla Haddad", "layla@bluemarlin.ae", "+971502223344", "100222333400003", "CT-100222", "DED-661233", "Dubai", "llc", "F&B", 12, 31, 2, 14, "active"),
    ("Sapphire Real Estate FZE", "Karim Nasser", "karim@sapphire-re.ae", "+971503334455", "100333444500003", "CT-100333", "JAFZA-77120", "Dubai", "fze", "Real Estate", 12, 31, 3, 13, "active"),
    ("Falcon Construction LLC", "Mariam Saleh", "mariam@falconcon.ae", "+971504445566", "100444555600003", "CT-100444", "DED-883401", "Abu Dhabi", "llc", "Construction", 3, 31, 3, 12, "active"),
    ("DesertLink Logistics LLC", "Yousef Idris", "yousef@desertlink.ae", "+971505556677", "100555666700003", "CT-100555", "DED-990155", "Sharjah", "llc", "Logistics", 12, 31, 2, 11, "active"),
    ("Nimbus Technologies FZ-LLC", "Hana Qureshi", "hana@nimbustech.ae", "+971506667788", "100666777800003", "CT-100666", "DMCC-44102", "Dubai", "free_zone", "IT / Software", 12, 31, 1, 10, "active"),
    ("Cedar Healthcare Clinics LLC", "Dr. Samir Khan", "samir@cedarclinics.ae", "+971507778899", "100777888900003", "CT-100777", "DED-220981", "Dubai", "llc", "Healthcare", 6, 30, 3, 9, "active"),
    ("Oasis Retail Group LLC", "Fatima Zahra", "fatima@oasisretail.ae", "+971508889900", "100888999000003", "CT-100888", "DED-330817", "Abu Dhabi", "llc", "Retail", 12, 31, 2, 9, "active"),
    ("Pinnacle Consulting FZE", "Rashid Al Maktoum", "rashid@pinnacle.ae", "+971509990011", "100999000100003", "CT-100999", "RAKEZ-12055", "Ras Al Khaimah", "fze", "Consulting", 12, 31, 1, 8, "active"),
    ("Crescent Manufacturing LLC", "Aisha Bukhari", "aisha@crescentmfg.ae", "+971501212121", "101010101000003", "CT-101010", "SAIF-66021", "Sharjah", "llc", "Manufacturing", 12, 31, 3, 7, "active"),
    ("Azure Hospitality LLC", "Tariq Mansour", "tariq@azurehosp.ae", "+971502323232", "101111111100003", "CT-101111", "DED-771234", "Dubai", "llc", "Hospitality", 12, 31, 2, 6, "active"),
    ("BrightPath E-Commerce FZ-LLC", "Noura Al Ali", "noura@brightpath.ae", "+971503434343", "101212121200003", "CT-101212", "DMCC-55310", "Dubai", "free_zone", "E-commerce", 12, 31, 1, 5, "active"),
    ("Emirates Steel Traders LLC", "Bilal Hassan", "bilal@essteel.ae", "+971504545454", None, None, "DED-118822", "Abu Dhabi", "llc", "Trading", 12, 31, 2, 5, "active"),
    ("Lumina Media Sole Est.", "Salma Darwish", "salma@luminamedia.ae", "+971505656565", "101414141400003", "CT-101414", "DED-447781", "Dubai", "sole_establishment", "Marketing", 12, 31, 3, 4, "active"),
    ("Harbor Foods Trading LLC", "Adeel Raza", "adeel@harborfoods.ae", "+971506767676", None, None, "DED-559900", "Ajman", "llc", "F&B", 12, 31, 2, 3, "active"),
    ("Vanguard Marketing Analysts Branch", "Imran Sheikh", "imran@vanguardaud.ae", "+971507878787", "101616161600003", "CT-101616", "DED-665544", "Dubai", "branch", "Professional Services", 12, 31, 1, 3, "active"),
    ("Summit Capital Advisors FZE", "Dana Khalil", "dana@summitcap.ae", "+971508989898", "101717171700003", "CT-101717", "ADGM-30021", "Abu Dhabi", "fze", "Financial Services", 12, 31, 1, 2, "paused"),
    ("Coral Reef Tourism LLC", "Hamad Al Suwaidi", "hamad@coralreef.ae", "+971509090909", "101818181800003", "CT-101818", "DED-887766", "Dubai", "llc", "Tourism", 12, 31, 3, 1, "active"),
]

# Services per client: keyed by company prefix -> list of (type, recurrence, monthly_fee)
SERVICES = {
    "Gulf Horizon": [("social_media_management", "monthly", 2500), ("seo", "quarterly", 1200), ("paid_advertising", "annual", 9000)],
    "Blue Marlin": [("social_media_management", "monthly", 3000), ("seo", "quarterly", 1200), ("content_creation", "monthly", 1500)],
    "Sapphire Real": [("social_media_management", "monthly", 3500), ("paid_advertising", "annual", 12000), ("analytics_reporting", "annual", 6000)],
    "Falcon Construction": [("social_media_management", "monthly", 4000), ("seo", "quarterly", 1500), ("brand_strategy", "annual", 18000)],
    "DesertLink": [("social_media_management", "monthly", 2200), ("content_creation", "monthly", 2000)],
    "Nimbus": [("social_media_management", "monthly", 2800), ("paid_advertising", "annual", 10000), ("marketing_strategy", "monthly", 6000)],
    "Cedar Healthcare": [("social_media_management", "monthly", 3200), ("seo", "quarterly", 1200), ("content_creation", "monthly", 2500)],
    "Oasis Retail": [("social_media_management", "monthly", 3000), ("brand_strategy", "annual", 15000)],
    "Pinnacle": [("social_media_management", "monthly", 1800), ("marketing_consultation", "one_time", 5000)],
    "Crescent Manufacturing": [("social_media_management", "monthly", 3800), ("seo", "quarterly", 1500), ("brand_strategy", "annual", 22000)],
    "Azure Hospitality": [("social_media_management", "monthly", 2600), ("content_creation", "monthly", 1800)],
    "BrightPath": [("social_media_management", "monthly", 2400), ("seo", "quarterly", 1200)],
    "Emirates Steel": [("social_media_management", "monthly", 2000)],
    "Lumina Media": [("social_media_management", "monthly", 1500), ("seo", "quarterly", 900)],
    "Harbor Foods": [("social_media_management", "monthly", 1800)],
    "Vanguard": [("brand_strategy", "annual", 25000), ("analytics_reporting", "annual", 7000)],
    "Summit Capital": [("marketing_strategy", "monthly", 8000), ("paid_advertising", "annual", 15000)],
    "Coral Reef": [("social_media_management", "monthly", 2200), ("seo", "quarterly", 1200)],
}

VAT_RATE = 5.0


def _round(x):
    return round(float(x or 0), 2)


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Client).filter(Client.company_name == MARKER).first():
            print("Demo data already present (marker client found) — nothing to do.")
            return

        # Invoice numbering continues from whatever already exists this year.
        year = TODAY.year
        prefix = f"INV-{year}-"
        seq = db.query(Invoice).filter(Invoice.invoice_number.like(f"{prefix}%")).count()

        def next_inv_no():
            nonlocal seq
            seq += 1
            return f"{prefix}{seq:04d}"

        created_clients = []
        for row in CLIENTS:
            (company, contact, email, phone, trn, ct_reg, lic, emirate, legal,
             industry, fye_m, fye_d, acc_id, months_ago, status) = row
            created_at = datetime.combine(_add_months(TODAY, -months_ago), datetime.min.time())
            c = Client(
                company_name=company, primary_contact_name=contact,
                primary_email=email, primary_phone=phone, trn=trn,
                ct_registration_number=ct_reg, trade_license_number=lic,
                trade_license_emirate=emirate, legal_form=legal, industry=industry,
                fiscal_year_end_month=fye_m, fiscal_year_end_day=fye_d,
                esr_applicable=(legal in ("free_zone", "fze", "fzc", "branch")),
                status=status, assigned_accountant_id=acc_id,
                notes="Imported demo client.", created_at=created_at,
                updated_at=created_at,
            )
            db.add(c)
            db.flush()
            created_clients.append(c)

        db.commit()

        # ── Services ──────────────────────────────────────────────────────────
        svc_by_client = {}
        for c in created_clients:
            key = next((k for k in SERVICES if c.company_name.startswith(k)), None)
            svc_list = []
            for stype, recur, fee in SERVICES.get(key, []):
                s = Service(
                    client_id=c.id, service_type=stype, status="active",
                    recurrence=recur, assigned_to=c.assigned_accountant_id,
                    start_date=(c.created_at.date()).isoformat(),
                    fee_amount=float(fee), fee_currency="AED",
                    created_at=c.created_at, updated_at=c.created_at,
                )
                db.add(s)
                svc_list.append((s, stype, recur, fee))
            svc_by_client[c.id] = svc_list
        db.commit()

        # ── Invoices + payments (monthly retainers spread over 6 months) ───────
        # Months: Dec 2025 .. May 2026
        months = [date(2025, 12, 1), date(2026, 1, 1), date(2026, 2, 1),
                  date(2026, 3, 1), date(2026, 4, 1), date(2026, 5, 1)]

        def make_invoice(client, issue_d, items, *, status, paid_ratio=0.0,
                         paid_offset_days=18, due_days=30):
            inv = Invoice(
                invoice_number=next_inv_no(), client_id=client.id, status="draft",
                currency="AED", issue_date=issue_d.isoformat(),
                due_date=(issue_d + timedelta(days=due_days)).isoformat(),
                vat_rate=VAT_RATE,
                created_by=client.assigned_accountant_id,
                created_at=datetime.combine(issue_d, datetime.min.time()),
                updated_at=datetime.combine(issue_d, datetime.min.time()),
            )
            db.add(inv)
            db.flush()
            subtotal = 0.0
            for desc, qty, price in items:
                line = InvoiceLineItem(invoice_id=inv.id, description=desc,
                                       quantity=qty, unit_price=price,
                                       line_total=_round(qty * price))
                subtotal += line.line_total
                db.add(line)
            inv.subtotal = _round(subtotal)
            inv.vat_amount = _round(inv.subtotal * VAT_RATE / 100.0)
            inv.total = _round(inv.subtotal + inv.vat_amount)
            inv.status = status
            if paid_ratio > 0:
                paid = _round(inv.total * paid_ratio)
                inv.amount_paid = paid
                paid_at = issue_d + timedelta(days=paid_offset_days)
                if paid_at > TODAY:
                    paid_at = TODAY
                db.add(Payment(
                    invoice_id=inv.id, amount=paid, currency="AED",
                    method="bank_transfer", reference=f"FT{issue_d.strftime('%y%m')}{inv.id:04d}",
                    paid_at=paid_at.isoformat(), recorded_by=client.assigned_accountant_id,
                    created_at=datetime.combine(paid_at, datetime.min.time()),
                ))
            return inv

        for c in created_clients:
            svcs = svc_by_client.get(c.id, [])
            monthly = [(t, fee) for (s, t, r, fee) in svcs if r == "monthly"]
            quarterly = [(t, fee) for (s, t, r, fee) in svcs if r == "quarterly"]
            annual = [(t, fee) for (s, t, r, fee) in svcs if r in ("annual", "one_time")]

            for i, m in enumerate(months):
                if m < c.created_at.date().replace(day=1):
                    continue  # client didn't exist yet
                # Monthly retainer invoices
                if monthly:
                    items = [(f"{t.replace('_', ' ').title()} — {m.strftime('%b %Y')}", 1, fee)
                             for (t, fee) in monthly]
                    is_recent = i >= len(months) - 1          # current month → still open
                    if is_recent:
                        make_invoice(c, m.replace(day=3), items, status="sent")
                    else:
                        make_invoice(c, m.replace(day=3), items, status="paid", paid_ratio=1.0)

                # Quarterly invoice on quarter starts (Jan, Apr in this window)
                if quarterly and m.month in (1, 4):
                    items = [(f"SEO — Q ending {m.strftime('%b %Y')}", 1, fee) for (t, fee) in quarterly]
                    if m.month == 4:
                        make_invoice(c, m.replace(day=8), items, status="sent")
                    else:
                        make_invoice(c, m.replace(day=8), items, status="paid", paid_ratio=1.0)

            # One annual / one-off invoice (brand strategy, etc.) in Feb or Mar
            for (t, fee) in annual:
                issue = date(2026, 2, 20) if t in ("brand_strategy", "analytics_reporting") else date(2026, 3, 12)
                if issue < c.created_at.date():
                    issue = c.created_at.date() + timedelta(days=20)
                label = t.replace("_", " ").title()
                # mix of paid / outstanding / overdue
                if t == "brand_strategy":
                    make_invoice(c, issue, [(f"{label} engagement 2025", 1, fee)], status="paid", paid_ratio=1.0)
                elif t == "paid_advertising":
                    make_invoice(c, issue, [(f"{label} campaign 2025", 1, fee)], status="sent")
                else:
                    make_invoice(c, issue, [(f"{label} 2025", 1, fee)], status="paid", paid_ratio=0.5)

        # A few deliberately OVERDUE invoices (due date in the past, unpaid)
        for c in created_clients[:5]:
            issue = date(2026, 3, 25)
            if issue >= c.created_at.date():
                make_invoice(c, issue, [("Advisory services — Mar 2026", 1, 3500)],
                             status="sent", due_days=20)  # due ~Apr 14 → overdue vs May 21

        db.commit()

        # ── Tasks (varied status / priority / due dates) ───────────────────────
        TASKS = [
            # (client_index, title, status, priority, due_offset_days, specialist_id)
            (0, "Schedule March social posts", "in_progress", "high", 4, 2),
            (0, "Prepare Q1 performance report", "todo", "urgent", -3, 2),
            (1, "Content batch — May 2026", "todo", "high", 6, 2),
            (1, "Follow up on missing brand assets", "blocked", "normal", -1, 2),
            (2, "Draft 2025 campaign retrospective", "in_progress", "high", 9, 3),
            (2, "Google Ads account audit", "todo", "urgent", 2, 3),
            (3, "Brand strategy workshop — Falcon", "in_progress", "high", 12, 3),
            (3, "Collect creative asset library", "todo", "normal", 15, 3),
            (4, "Monthly social media report", "done", "normal", -8, 2),
            (4, "Launch retargeting campaign", "todo", "high", 3, 2),
            (5, "Marketing roadmap — May", "todo", "high", 5, 1),
            (5, "Ad budget allocation review", "in_progress", "urgent", 1, 1),
            (6, "SEO keyword refresh Q1", "todo", "urgent", -2, 3),
            (6, "Clinic content calendar review", "done", "normal", -5, 3),
            (7, "Event coverage shoot", "todo", "normal", 20, 2),
            (8, "Marketing advisory memo", "blocked", "high", -4, 1),
            (9, "Campaign kickoff meeting", "todo", "normal", 8, 3),
            (9, "Analytics reconciliation Q1", "in_progress", "high", 2, 3),
            (10, "Onboard 3 new social channels", "todo", "normal", 7, 2),
            (11, "E-commerce conversion tracking", "todo", "high", 4, 1),
            (12, "Set up Google Analytics 4", "done", "normal", -10, 2),
            (13, "Social media invoice query", "todo", "low", 11, 3),
            (15, "Brand audit completion review", "in_progress", "urgent", 1, 1),
            (16, "Quarterly strategy review", "todo", "high", 6, 1),
            (17, "Onboard new client account", "todo", "normal", 9, 3),
        ]
        for idx, title, status, prio, due_off, acc in TASKS:
            if idx >= len(created_clients):
                continue
            c = created_clients[idx]
            due = (TODAY + timedelta(days=due_off)).isoformat()
            completed = None
            if status == "done":
                completed = datetime.combine(TODAY + timedelta(days=due_off), datetime.min.time())
            db.add(Task(
                client_id=c.id, title=title, status=status, priority=prio,
                due_date=due, assigned_to=acc, created_by=1,
                completed_at=completed,
                created_at=datetime.combine(TODAY - timedelta(days=20), datetime.min.time()),
            ))
        db.commit()

        n_clients = len(created_clients)
        n_inv = db.query(Invoice).filter(Invoice.invoice_number.like(f"{prefix}%")).count()
        print(f"Seeded {n_clients} clients, services, {len(TASKS)} tasks, "
              f"and invoices/payments. Total {year} invoices now: {n_inv}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
