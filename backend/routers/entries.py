from datetime import datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import ALCOHOL_UNIT_DIVISOR
from database import get_db
from models import DrinkTemplate, DrinkEntry, User
from routers.deps import get_current_user
from schemas import (
    DrinkEntryCreate, DrinkEntryUpdate, DrinkEntryResponse, ConfirmAllRequest,
    EntrySummaryItem,
)

router = APIRouter(tags=["entries"])


# IMPORTANT: /entries/confirm-all must be registered BEFORE /entries/{entry_id}
# so FastAPI doesn't treat "confirm-all" as an entry_id.


@router.post("/entries/confirm-all")
def confirm_all(
    req: ConfirmAllRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entries = (
        db.query(DrinkEntry)
        .filter(
            DrinkEntry.user_id == current_user.id,
            DrinkEntry.is_marked == False,
            DrinkEntry.timestamp < req.cutoff,
        )
        .all()
    )
    created_templates: dict[str, DrinkTemplate] = {}
    for entry in entries:
        if entry.custom_name is not None and entry.template_id is None:
            name = entry.custom_name
            if name not in created_templates:
                existing = db.query(DrinkTemplate).filter(
                    DrinkTemplate.user_id == current_user.id,
                    DrinkTemplate.name == name,
                ).first()
                if existing:
                    created_templates[name] = existing
                else:
                    template = DrinkTemplate(
                        user_id=current_user.id,
                        name=name,
                        default_ml=entry.ml,
                        default_abv=entry.abv,
                        usage_count=0,
                    )
                    db.add(template)
                    db.flush()
                    created_templates[name] = template
            tpl = created_templates[name]
            tpl.usage_count += 1
            entry.template_id = tpl.id
            entry.custom_name = None
        entry.is_marked = True
    db.commit()
    return {"confirmed": len(entries)}


@router.get("/entries", response_model=list[DrinkEntryResponse])
def list_entries(
    limit: int = Query(default=100, ge=1),
    offset: int = Query(default=0, ge=0),
    confirmed_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if confirmed_only:
        return (
            db.query(DrinkEntry)
            .filter(DrinkEntry.user_id == current_user.id, DrinkEntry.is_marked == True)
            .order_by(DrinkEntry.timestamp.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
    # Default: all unconfirmed (no limit) + most recent N confirmed, newest-first
    unconfirmed = (
        db.query(DrinkEntry)
        .filter(DrinkEntry.user_id == current_user.id, DrinkEntry.is_marked == False)
        .order_by(DrinkEntry.timestamp.desc())
        .all()
    )
    confirmed = (
        db.query(DrinkEntry)
        .filter(DrinkEntry.user_id == current_user.id, DrinkEntry.is_marked == True)
        .order_by(DrinkEntry.timestamp.desc())
        .limit(limit)
        .all()
    )
    combined = sorted(unconfirmed + confirmed, key=lambda e: e.timestamp, reverse=True)
    return combined


@router.post("/entries", response_model=DrinkEntryResponse, status_code=201)
def create_entry(
    data: DrinkEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = DrinkEntry(**data.model_dump(), user_id=current_user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/entries/summary", response_model=list[EntrySummaryItem])
def entries_summary(
    period: Literal["week", "month", "year", "all"] = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(
            func.date(DrinkEntry.timestamp).label("date"),
            func.sum(DrinkEntry.ml * DrinkEntry.abv / 100.0 / ALCOHOL_UNIT_DIVISOR).label("total"),
        )
        .filter(DrinkEntry.user_id == current_user.id, DrinkEntry.is_marked == True)
    )
    if period != "all":
        days = {"week": 7, "month": 30, "year": 365}[period]
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        # timestamps stored as naive UTC
        q = q.filter(DrinkEntry.timestamp >= cutoff.replace(tzinfo=None))
    rows = (
        q.group_by(func.date(DrinkEntry.timestamp))
        .order_by(func.date(DrinkEntry.timestamp).asc())
        .all()
    )
    return [EntrySummaryItem(date=row.date, total=round(row.total, 6)) for row in rows]


@router.put("/entries/{entry_id}", response_model=DrinkEntryResponse)
def update_entry(
    entry_id: str,
    data: DrinkEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(DrinkEntry).filter(
        DrinkEntry.id == entry_id, DrinkEntry.user_id == current_user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.template_id is not None:
        non_ts = {k: v for k, v in data.model_dump(exclude_none=True).items() if k != "timestamp"}
        if non_ts:
            raise HTTPException(status_code=400, detail="Template-linked entries: only timestamp is editable")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(DrinkEntry).filter(
        DrinkEntry.id == entry_id, DrinkEntry.user_id == current_user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.is_marked:
        raise HTTPException(status_code=400, detail="Cannot delete confirmed entries")
    db.delete(entry)
    db.commit()
