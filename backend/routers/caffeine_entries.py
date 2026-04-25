from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import CaffeineTemplate, CaffeineEntry
from schemas import (
    CaffeineEntryCreate, CaffeineEntryUpdate, CaffeineEntryResponse, ConfirmAllRequest
)

router = APIRouter(tags=["caffeine-entries"])


# IMPORTANT: /caffeine-entries/confirm-all must be registered BEFORE /caffeine-entries/{entry_id}
# so FastAPI doesn't treat "confirm-all" as an entry_id.


@router.post("/caffeine-entries/confirm-all")
def confirm_all_caffeine(req: ConfirmAllRequest, db: Session = Depends(get_db)):
    entries = (
        db.query(CaffeineEntry)
        .filter(CaffeineEntry.is_marked == False, CaffeineEntry.timestamp < req.cutoff)
        .all()
    )
    created_templates: dict[str, CaffeineTemplate] = {}
    for entry in entries:
        if entry.custom_name is not None and entry.template_id is None:
            name = entry.custom_name
            if name not in created_templates:
                existing = db.query(CaffeineTemplate).filter(
                    CaffeineTemplate.name == name
                ).first()
                if existing:
                    created_templates[name] = existing
                else:
                    template = CaffeineTemplate(
                        name=name,
                        default_mg=entry.mg,
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


@router.get("/caffeine-entries", response_model=list[CaffeineEntryResponse])
def list_caffeine_entries(
    limit: int = Query(default=100, ge=1),
    offset: int = Query(default=0, ge=0),
    confirmed_only: bool = False,
    db: Session = Depends(get_db),
):
    if confirmed_only:
        return (
            db.query(CaffeineEntry)
            .filter(CaffeineEntry.is_marked == True)
            .order_by(CaffeineEntry.timestamp.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
    # Default: all unconfirmed (no limit) + most recent N confirmed, newest-first
    unconfirmed = (
        db.query(CaffeineEntry)
        .filter(CaffeineEntry.is_marked == False)
        .order_by(CaffeineEntry.timestamp.desc())
        .all()
    )
    confirmed = (
        db.query(CaffeineEntry)
        .filter(CaffeineEntry.is_marked == True)
        .order_by(CaffeineEntry.timestamp.desc())
        .limit(limit)
        .all()
    )
    combined = sorted(unconfirmed + confirmed, key=lambda e: e.timestamp, reverse=True)
    return combined


@router.post("/caffeine-entries", response_model=CaffeineEntryResponse, status_code=201)
def create_caffeine_entry(data: CaffeineEntryCreate, db: Session = Depends(get_db)):
    entry = CaffeineEntry(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/caffeine-entries/{entry_id}", response_model=CaffeineEntryResponse)
def update_caffeine_entry(entry_id: str, data: CaffeineEntryUpdate, db: Session = Depends(get_db)):
    entry = db.query(CaffeineEntry).filter(CaffeineEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.template_id is not None:
        non_timestamp = {k: v for k, v in data.model_dump(exclude_none=True).items() if k != "timestamp"}
        if non_timestamp:
            raise HTTPException(status_code=400, detail="Template-linked entries: only timestamp is editable")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/caffeine-entries/{entry_id}", status_code=204)
def delete_caffeine_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.query(CaffeineEntry).filter(CaffeineEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.is_marked:
        raise HTTPException(status_code=400, detail="Cannot delete confirmed entries")
    db.delete(entry)
    db.commit()
