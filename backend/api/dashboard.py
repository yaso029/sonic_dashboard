from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database.db import get_db
from backend.database.models import User, Lead, Activity
from backend.services.auth_service import get_current_user, require_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# Active = mid-pipeline; won = retainer or completed; lost = lost
ACTIVE_STAGES = ["discovery_call", "documents_requested", "documents_received", "in_progress", "review"]
WON_STAGES = ["completed", "monthly_retainer"]
LOST_STAGES = ["lost"]


@router.get("/stats")
def get_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    base = db.query(Lead)
    if current_user.role == "marketing_specialist":
        base = base.filter(Lead.assigned_to == current_user.id)
    elif current_user.role == "marketing_manager":
        team_ids = [u.id for u in db.query(User).filter(User.team_leader_id == current_user.id).all()]
        visible = team_ids + [current_user.id]
        base = base.filter((Lead.assigned_to.in_(visible)) | (Lead.created_by == current_user.id))

    total = base.count()
    new_leads = base.filter(Lead.stage == "inquiry").count()
    active = base.filter(Lead.stage.in_(ACTIVE_STAGES)).count()
    closed_won = base.filter(Lead.stage.in_(WON_STAGES)).count()
    closed_lost = base.filter(Lead.stage.in_(LOST_STAGES)).count()

    if current_user.role == "marketing_specialist":
        stage_counts = (
            db.query(Lead.stage, func.count(Lead.id))
            .filter(Lead.assigned_to == current_user.id)
            .group_by(Lead.stage)
            .all()
        )
    else:
        stage_counts = (
            db.query(Lead.stage, func.count(Lead.id))
            .group_by(Lead.stage)
            .all()
        )

    return {
        "total_leads": total,
        "new_leads": new_leads,
        "active_leads": active,
        "closed_won": closed_won,
        "closed_lost": closed_lost,
        "stage_breakdown": [{"stage": s, "count": c} for s, c in stage_counts],
    }


@router.get("/admin")
def admin_dashboard(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).filter(User.is_active == True).count()
    accountants = db.query(User).filter(User.role == "marketing_specialist", User.is_active == True).count()
    senior_accountants = db.query(User).filter(User.role == "marketing_manager", User.is_active == True).count()
    total_leads = db.query(Lead).count()
    closed_won = db.query(Lead).filter(Lead.stage.in_(WON_STAGES)).count()

    specialist_performance = (
        db.query(User.id, User.full_name, func.count(Lead.id).label("lead_count"))
        .outerjoin(Lead, Lead.assigned_to == User.id)
        .filter(User.role == "marketing_specialist", User.is_active == True)
        .group_by(User.id, User.full_name)
        .all()
    )

    source_breakdown = (
        db.query(Lead.source, func.count(Lead.id))
        .group_by(Lead.source)
        .all()
    )

    return {
        "total_users": total_users,
        "accountants": accountants,
        "senior_accountants": senior_accountants,
        "total_leads": total_leads,
        "closed_won": closed_won,
        "specialist_performance": [
            {"id": a.id, "name": a.full_name, "lead_count": a.lead_count}
            for a in specialist_performance
        ],
        "source_breakdown": [{"source": s or "unknown", "count": c} for s, c in source_breakdown],
    }
