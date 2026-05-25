from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from backend.database.db import get_db
from backend.database.models import User, Lead, Activity
from backend.services.auth_service import get_current_user
import csv
import io
import re

router = APIRouter(prefix="/api/leads/import", tags=["import"])

COLUMN_MAP = {
    "full_name": ["full_name", "name", "full name", "client name", "client", "lead name", "contact"],
    "phone": ["phone", "phone number", "mobile", "mobile number", "tel", "telephone", "contact number"],
    "email": ["email", "email address", "e-mail", "mail"],
    "company": ["company", "company name", "business", "organization", "business name"],
    "source": ["source", "lead source", "channel"],
    "estimated_value": ["estimated_value", "estimated value", "deal value", "value", "revenue", "budget"],
    "notes": ["notes", "note", "remarks", "comment", "comments", "description"],
}

def detect_column(header: str):
    clean = header.strip().lower()
    for field, variants in COLUMN_MAP.items():
        if clean in variants:
            return field
    return None

def clean_phone(value: str) -> str:
    # Strip common prefixes like "p:", "tel:", "ph:" etc.
    value = re.sub(r'^[a-zA-Z]+:', '', value.strip())
    return value.strip()

def parse_rows(headers, rows):
    mapping = {}
    for i, h in enumerate(headers):
        field = detect_column(str(h))
        if field:
            mapping[field] = i

    unrecognized = [h for h in headers if detect_column(str(h)) is None]
    leads = []
    for row in rows:
        if not any(str(c).strip() for c in row):
            continue
        lead = {}
        for field, idx in mapping.items():
            val = str(row[idx]).strip() if idx < len(row) else ""
            if val and val.lower() not in ("none", "null", "n/a", "-", ""):
                if field == "phone":
                    val = clean_phone(val)
                lead[field] = val
        if lead.get("full_name") or lead.get("phone"):
            leads.append(lead)

    return leads, unrecognized


def read_file(content: bytes, filename: str):
    if not filename:
        raise HTTPException(status_code=400, detail="No filename detected")
    filename = filename.lower()

    if filename.endswith(".csv"):
        # Detect encoding: UTF-16 has BOM \xff\xfe or \xfe\xff
        if content[:2] in (b'\xff\xfe', b'\xfe\xff'):
            text = content.decode("utf-16")
        else:
            text = content.decode("utf-8-sig", errors="replace")
        # Detect delimiter (comma, semicolon, or tab)
        first_line = text.splitlines()[0] if text.splitlines() else ""
        delimiter = '\t' if '\t' in first_line else (';' if ';' in first_line else ',')
        reader = csv.reader(io.StringIO(text, newline=''), delimiter=delimiter)
        all_rows = list(reader)
        if not all_rows:
            raise HTTPException(status_code=400, detail="Empty file")
        return all_rows[0], all_rows[1:]

    elif filename.endswith(".xlsx"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            all_rows = [[str(c.value) if c.value is not None else "" for c in row] for row in ws.iter_rows()]
            wb.close()
            if not all_rows:
                raise HTTPException(status_code=400, detail="Empty file")
            return all_rows[0], all_rows[1:]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read Excel file: {str(e)}")

    elif filename.endswith(".xls"):
        try:
            import xlrd
            wb = xlrd.open_workbook(file_contents=content)
            ws = wb.sheet_by_index(0)
            all_rows = [[str(ws.cell_value(r, c)) for c in range(ws.ncols)] for r in range(ws.nrows)]
            if not all_rows:
                raise HTTPException(status_code=400, detail="Empty file")
            return all_rows[0], all_rows[1:]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not read .xls file: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail="Only CSV and Excel (.xlsx, .xls) files are supported")


@router.post("/preview")
async def preview_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        headers, rows = read_file(content, file.filename or "")
        leads, unrecognized = parse_rows(headers, rows)
        return {
            "headers": headers,
            "column_mapping": {h: detect_column(str(h)) for h in headers},
            "unrecognized_columns": unrecognized,
            "preview": leads[:5],
            "total_rows": len(rows),
            "importable_rows": len(leads),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")


@router.post("")
async def import_leads(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
      content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {str(e)}")

    headers, rows = read_file(content, file.filename or "")
    leads_data, _ = parse_rows(headers, rows)

    created = 0
    skipped = 0
    duplicates = 0
    errors = []

    for i, data in enumerate(leads_data):
        try:
            if not data.get("full_name") and not data.get("phone"):
                skipped += 1
                continue

            # Duplicate check by name, phone, or email
            name = data.get("full_name", "").strip()
            phone = data.get("phone", "").strip()
            email = data.get("email", "").strip()

            from sqlalchemy import or_
            conditions = []
            if name:
                conditions.append(Lead.full_name.ilike(name))
            if phone:
                conditions.append(Lead.phone == phone)
            if email:
                conditions.append(Lead.email == email)

            if conditions:
                existing = db.query(Lead).filter(or_(*conditions)).first()
                if existing:
                    duplicates += 1
                    continue

            lead = Lead(
                full_name=data.get("full_name", "Unknown"),
                phone=data.get("phone", ""),
                email=data.get("email"),
                company=data.get("company"),
                source=data.get("source", "Other"),
                estimated_value=data.get("estimated_value"),
                notes=data.get("notes"),
                stage="inquiry",
                assigned_to=current_user.id,
                created_by=current_user.id,
            )
            db.add(lead)
            db.flush()

            activity = Activity(
                lead_id=lead.id,
                user_id=current_user.id,
                type="note",
                content=f"Lead imported via CSV/Excel by {current_user.full_name}",
            )
            db.add(activity)
            created += 1
        except Exception as e:
            skipped += 1
            errors.append(f"Row {i + 2}: {str(e)}")

    db.commit()

    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "duplicates": duplicates,
        "errors": errors[:10],
    }
