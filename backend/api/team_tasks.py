"""Team Task Management API.

Internal team work items with a deliberate split of duties:

- Only an **admin** can create, reassign, delete, or mark a task DONE, and may
  leave review notes.
- The **assigned team member** can move their own task to In Progress / Review,
  update its progress %, and leave a progress note — nothing else.
- Everyone else sees only the tasks assigned to them.

This is separate from the client-linked `tasks` module; these are internal
team tasks (`team_tasks` table).
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

from backend.database.db import get_db
from backend.database.models import TeamTask, User
from backend.services.auth_service import get_current_user, require_admin
from backend.services import notification_service, email_service

router = APIRouter(prefix="/api/team-tasks", tags=["team-tasks"])

STATUSES = ["todo", "in_progress", "review", "done"]
PRIORITIES = ["low", "normal", "high", "urgent"]
# The only statuses a non-admin assignee may set on their own task.
MEMBER_STATUSES = ["in_progress", "review"]


class TeamTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    priority: Optional[str] = "normal"
    due_date: Optional[str] = None
    status: Optional[str] = "todo"


class AdminUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    progress_percent: Optional[int] = None
    review_notes: Optional[str] = None


class MemberUpdate(BaseModel):
    status: Optional[str] = None
    progress_percent: Optional[int] = None
    member_note: Optional[str] = None


def _is_overdue(t: TeamTask) -> bool:
    if not t.due_date or t.status == "done":
        return False
    try:
        return date.fromisoformat(t.due_date) < date.today()
    except ValueError:
        return False


def _clamp_pct(v) -> int:
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 0
    return max(0, min(100, v))


def to_dict(t: TeamTask) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "assigned_to": t.assigned_to,
        "assigned_to_name": t.assignee.full_name if t.assignee else None,
        "created_by": t.created_by,
        "created_by_name": t.creator.full_name if t.creator else None,
        "status": t.status,
        "progress_percent": t.progress_percent or 0,
        "priority": t.priority,
        "due_date": t.due_date,
        "is_overdue": _is_overdue(t),
        "review_notes": t.review_notes,
        "member_note": t.member_note,
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _apply_auto_state(t: TeamTask):
    """Keep timestamps and progress coherent with status transitions."""
    if t.status == "in_progress" and t.started_at is None:
        t.started_at = datetime.utcnow()
    if t.status == "done":
        t.completed_at = t.completed_at or datetime.utcnow()
        t.progress_percent = 100
    else:
        t.completed_at = None
    t.updated_at = datetime.utcnow()


def _task_email_html(task: TeamTask, assignee: User) -> str:
    rows = [
        ("Task", task.title),
        ("Description", task.description or "—"),
        ("Priority", (task.priority or "normal").title()),
        ("Due date", task.due_date or "—"),
        ("Assigned by", task.creator.full_name if task.creator else "Admin"),
    ]
    cells = "".join(
        f'<tr><td style="padding:6px 14px;color:#6b7280;font-size:13px">{k}</td>'
        f'<td style="padding:6px 14px;color:#111;font-size:13px;font-weight:600">{v}</td></tr>'
        for k, v in rows
    )
    return (
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px">'
        '<h2 style="color:#111;margin:0 0 8px">📋 New task assigned to you</h2>'
        f'<p style="color:#444;font-size:14px">Hi {assignee.full_name}, a new task has been '
        'assigned to you on Sonic Marketing CRM.</p>'
        f'<table style="border-collapse:collapse;background:#f7f7f8;border-radius:10px;width:100%">{cells}</table>'
        '<p style="margin-top:18px;font-size:13px;color:#444">Open your dashboard to update its '
        'status and progress.</p>'
        '</div>'
    )


def _notify_assignment(db: Session, background_tasks: BackgroundTasks, task: TeamTask):
    """Notify the task's assignee: in-app notification + web push + email."""
    if not task.assigned_to:
        return
    assignee = db.query(User).filter(User.id == task.assigned_to).first()
    if not assignee:
        return
    due = f" (due {task.due_date})" if task.due_date else ""
    msg = f"New task assigned to you: {task.title}{due}"
    # In-app notification + web push (push degrades to a no-op if VAPID isn't set).
    notification_service.notify_user(db, assignee.id, msg)
    db.commit()
    # Build the email body now (session is open), then send in the background so
    # SMTP latency never blocks the API response.
    if assignee.email:
        html = _task_email_html(task, assignee)
        background_tasks.add_task(
            email_service.send_email,
            assignee.email,
            f"New task assigned: {task.title}",
            html,
        )


@router.get("")
def list_team_tasks(
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TeamTask)
    if current_user.role != "admin":
        # Team members only ever see their own assigned tasks.
        q = q.filter(TeamTask.assigned_to == current_user.id)
    elif assigned_to is not None:
        q = q.filter(TeamTask.assigned_to == assigned_to)
    if status:
        q = q.filter(TeamTask.status == status)
    rows = q.order_by(TeamTask.due_date.asc().nullslast(), TeamTask.id.desc()).all()
    return [to_dict(t) for t in rows]


@router.get("/stats")
def team_task_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TeamTask)
    if current_user.role != "admin":
        q = q.filter(TeamTask.assigned_to == current_user.id)
    rows = q.all()
    by_status = {s: 0 for s in STATUSES}
    overdue = 0
    for t in rows:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        if _is_overdue(t):
            overdue += 1
    return {"total": len(rows), "by_status": by_status, "overdue": overdue}


@router.post("")
def create_team_task(
    req: TeamTaskCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if req.status and req.status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if req.priority and req.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if req.assigned_to is not None:
        if not db.query(User).filter(User.id == req.assigned_to, User.is_active == True).first():
            raise HTTPException(status_code=404, detail="Assigned user not found")
    t = TeamTask(
        title=req.title,
        description=req.description,
        assigned_to=req.assigned_to,
        priority=req.priority or "normal",
        due_date=req.due_date,
        status=req.status or "todo",
        progress_percent=0,
        created_by=current_user.id,
    )
    _apply_auto_state(t)
    db.add(t)
    db.commit()
    db.refresh(t)
    # Notify the assignee (email + dashboard notification + push) about the new task.
    _notify_assignment(db, background_tasks, t)
    return to_dict(t)


@router.put("/{task_id}")
def update_team_task(
    task_id: int,
    payload: dict,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = db.query(TeamTask).filter(TeamTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")

    is_admin = current_user.role == "admin"
    prev_assignee = t.assigned_to
    if not is_admin and t.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update tasks assigned to you")

    if is_admin:
        try:
            req = AdminUpdate(**payload)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid task fields")
        if req.status is not None and req.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if req.priority is not None and req.priority not in PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        if req.assigned_to is not None:
            if not db.query(User).filter(User.id == req.assigned_to).first():
                raise HTTPException(status_code=404, detail="Assigned user not found")
            t.assigned_to = req.assigned_to
        for f in ("title", "description", "priority", "due_date", "review_notes"):
            v = getattr(req, f)
            if v is not None:
                setattr(t, f, v)
        if req.progress_percent is not None:
            t.progress_percent = _clamp_pct(req.progress_percent)
        if req.status is not None:
            t.status = req.status
    else:
        try:
            req = MemberUpdate(**payload)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid update")
        if req.status is not None:
            if req.status not in MEMBER_STATUSES:
                raise HTTPException(
                    status_code=403,
                    detail=f"You may only set status to: {', '.join(MEMBER_STATUSES)}",
                )
            t.status = req.status
        if req.progress_percent is not None:
            t.progress_percent = _clamp_pct(req.progress_percent)
        if req.member_note is not None:
            t.member_note = req.member_note

    _apply_auto_state(t)
    db.commit()
    db.refresh(t)
    # If an admin reassigned the task to someone new, notify the new assignee.
    if t.assigned_to and t.assigned_to != prev_assignee:
        _notify_assignment(db, background_tasks, t)
    return to_dict(t)


@router.delete("/{task_id}")
def delete_team_task(
    task_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    t = db.query(TeamTask).filter(TeamTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
