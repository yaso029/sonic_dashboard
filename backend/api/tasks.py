"""Tasks API — work items, optionally linked to a Service and/or Client.

Standalone tasks are allowed (client_id and service_id both nullable) so the
firm can also track internal/admin work.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from backend.database.db import get_db
from backend.database.models import Task, Client, Service, User
from backend.services.auth_service import get_current_user, require_permission
from backend.api.clients import scope_query as scope_clients

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


TASK_STATUSES = ["todo", "in_progress", "blocked", "done"]
TASK_PRIORITIES = ["low", "normal", "high", "urgent"]


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    client_id: Optional[int] = None
    service_id: Optional[int] = None
    due_date: Optional[str] = None
    priority: Optional[str] = "normal"
    status: Optional[str] = "todo"
    assigned_to: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    client_id: Optional[int] = None
    service_id: Optional[int] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[int] = None


def task_to_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "client_id": t.client_id,
        "client_name": t.client.company_name if t.client else None,
        "service_id": t.service_id,
        "service_type": t.service.service_type if t.service else None,
        "due_date": t.due_date,
        "priority": t.priority,
        "status": t.status,
        "assigned_to": t.assigned_to,
        "assigned_to_name": t.assignee.full_name if t.assignee else None,
        "created_by": t.created_by,
        "created_by_name": t.creator.full_name if t.creator else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _validate_enums(status=None, priority=None):
    if status is not None and status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status")
    if priority is not None and priority not in TASK_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority")


def _scope_tasks(query, current_user: User, db: Session):
    """A user can see tasks that are:
    - assigned to them, OR
    - created by them, OR
    - linked to a client they can see (handled inline since this needs a subquery)
    """
    if current_user.role == "admin":
        return query
    visible_client_ids = [
        row.id for row in scope_clients(db.query(Client.id), current_user, db).all()
    ]
    return query.filter(or_(
        Task.assigned_to == current_user.id,
        Task.created_by == current_user.id,
        Task.client_id.in_(visible_client_ids) if visible_client_ids else False,
    ))


@router.get("")
def list_tasks(
    client_id: Optional[int] = None,
    service_id: Optional[int] = None,
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _scope_tasks(db.query(Task), current_user, db)
    if client_id is not None:
        query = query.filter(Task.client_id == client_id)
    if service_id is not None:
        query = query.filter(Task.service_id == service_id)
    if status:
        query = query.filter(Task.status == status)
    if assigned_to:
        query = query.filter(Task.assigned_to == assigned_to)
    tasks = query.order_by(Task.due_date.asc().nullslast(), Task.priority.desc()).all()
    return [task_to_dict(t) for t in tasks]


@router.get("/{task_id}")
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _scope_tasks(db.query(Task), current_user, db).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_to_dict(t)


@router.post("")
def create_task(
    req: TaskCreate,
    current_user: User = Depends(require_permission("tasks", "create")),
    db: Session = Depends(get_db),
):
    _validate_enums(req.status, req.priority)
    if req.client_id is not None:
        visible = scope_clients(db.query(Client), current_user, db).filter(Client.id == req.client_id).first()
        if not visible:
            raise HTTPException(status_code=404, detail="Client not found")
    if req.service_id is not None:
        svc = db.query(Service).filter(Service.id == req.service_id).first()
        if not svc:
            raise HTTPException(status_code=404, detail="Service not found")

    t = Task(
        title=req.title,
        description=req.description,
        client_id=req.client_id,
        service_id=req.service_id,
        due_date=req.due_date,
        priority=req.priority or "normal",
        status=req.status or "todo",
        assigned_to=req.assigned_to or current_user.id,
        created_by=current_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return task_to_dict(t)


@router.put("/{task_id}")
def update_task(
    task_id: int,
    req: TaskUpdate,
    current_user: User = Depends(require_permission("tasks", "update")),
    db: Session = Depends(get_db),
):
    _validate_enums(req.status, req.priority)
    t = _scope_tasks(db.query(Task), current_user, db).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    for field in [
        "title", "description", "client_id", "service_id", "due_date",
        "priority", "status", "assigned_to",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(t, field, val)

    # Auto-stamp completed_at when transitioning to done
    if req.status == "done" and t.completed_at is None:
        t.completed_at = datetime.utcnow()
    if req.status is not None and req.status != "done":
        t.completed_at = None

    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return task_to_dict(t)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: User = Depends(require_permission("tasks", "delete")),
    db: Session = Depends(get_db),
):
    t = _scope_tasks(db.query(Task), current_user, db).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
