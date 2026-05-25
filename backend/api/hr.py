from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from backend.database.db import get_db
from backend.database.models import Employee, EmployeeDocument
from backend.services.auth_service import require_hr_access as require_admin
from backend.services.cloudinary_service import upload_image, upload_file, delete_image, delete_file

router = APIRouter(prefix="/api/hr", tags=["hr"])

NATIONALITY_LABELS = {
    'AE': 'UAE', 'SA': 'Saudi Arabia', 'EG': 'Egypt', 'IN': 'India', 'PK': 'Pakistan',
    'PH': 'Philippines', 'GB': 'United Kingdom', 'US': 'United States', 'JO': 'Jordan',
    'LB': 'Lebanon', 'SY': 'Syria', 'IQ': 'Iraq', 'CN': 'China', 'NG': 'Nigeria',
    'KE': 'Kenya', 'ET': 'Ethiopia', 'BD': 'Bangladesh', 'LK': 'Sri Lanka',
    'NP': 'Nepal', 'TR': 'Turkey', 'IR': 'Iran', 'RU': 'Russia', 'OTHER': 'Other',
}


def emp_to_dict(e: Employee) -> dict:
    return {
        "id": e.id,
        "photo_url": e.photo_url,
        "photo_public_id": e.photo_public_id,
        "full_name": e.full_name,
        "job_title": e.job_title,
        "department": e.department,
        "phone": e.phone,
        "email": e.email,
        "nationality": e.nationality,
        "nationality_label": NATIONALITY_LABELS.get(e.nationality or '', e.nationality or ''),
        "date_of_birth": e.date_of_birth,
        "date_joined": e.date_joined,
        "employment_type": e.employment_type,
        "status": e.status,
        "emirates_id": e.emirates_id,
        "emirates_id_expiry": e.emirates_id_expiry,
        "passport_number": e.passport_number,
        "passport_expiry": e.passport_expiry,
        "visa_expiry": e.visa_expiry,
        "notes": e.notes,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "documents": [
            {
                "id": d.id,
                "label": d.label,
                "file_url": d.file_url,
                "file_name": d.file_name,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in (e.documents or [])
        ],
    }


class EmployeeIn(BaseModel):
    full_name: str
    job_title: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    nationality: Optional[str] = None
    date_of_birth: Optional[str] = None
    date_joined: Optional[str] = None
    employment_type: Optional[str] = 'full_time'
    status: Optional[str] = 'active'
    emirates_id: Optional[str] = None
    emirates_id_expiry: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    visa_expiry: Optional[str] = None
    notes: Optional[str] = None


@router.get("/employees")
def list_employees(current_user=Depends(require_admin), db: Session = Depends(get_db)):
    employees = db.query(Employee).order_by(Employee.full_name).all()
    return [emp_to_dict(e) for e in employees]


@router.get("/employees/{emp_id}")
def get_employee(emp_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp_to_dict(e)


@router.post("/employees")
def create_employee(payload: EmployeeIn, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    e = Employee(**payload.dict())
    db.add(e)
    db.commit()
    db.refresh(e)
    return emp_to_dict(e)


@router.put("/employees/{emp_id}")
def update_employee(emp_id: int, payload: EmployeeIn, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    for k, v in payload.dict().items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return emp_to_dict(e)


@router.delete("/employees/{emp_id}")
def delete_employee(emp_id: int, current_user=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    if e.photo_public_id:
        delete_image(e.photo_public_id)
    db.delete(e)
    db.commit()
    return {"ok": True}


@router.post("/employees/{emp_id}/photo")
async def upload_photo(
    emp_id: int,
    file: UploadFile = File(...),
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    if e.photo_public_id:
        delete_image(e.photo_public_id)
    contents = await file.read()
    result = upload_image(contents, folder="sonic_hr_photos")
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    e.photo_url = result["url"]
    e.photo_public_id = result["public_id"]
    db.commit()
    return {"photo_url": e.photo_url}


@router.post("/employees/{emp_id}/documents")
async def upload_document(
    emp_id: int,
    file: UploadFile = File(...),
    label: str = Form(...),
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    e = db.query(Employee).filter(Employee.id == emp_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    contents = await file.read()
    result = upload_file(contents, file_name=file.filename)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    doc = EmployeeDocument(
        employee_id=emp_id,
        label=label,
        file_url=result["url"],
        file_public_id=result.get("public_id"),
        file_name=file.filename,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "id": doc.id,
        "label": doc.label,
        "file_url": doc.file_url,
        "file_name": doc.file_name,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.delete("/employees/{emp_id}/documents/{doc_id}")
def delete_document(
    emp_id: int,
    doc_id: int,
    current_user=Depends(require_admin),
    db: Session = Depends(get_db),
):
    doc = db.query(EmployeeDocument).filter(
        EmployeeDocument.id == doc_id, EmployeeDocument.employee_id == emp_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.file_public_id:
        delete_file(doc.file_public_id)
    db.delete(doc)
    db.commit()
    return {"ok": True}
