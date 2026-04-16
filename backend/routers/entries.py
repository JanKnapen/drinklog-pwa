from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, DrinkEntry
from schemas import (
    DrinkEntryCreate, DrinkEntryUpdate, DrinkEntryResponse, ConfirmAllRequest
)

router = APIRouter(tags=["entries"])


# IMPORTANT: /entries/confirm-all must be registered BEFORE /entries/{entry_id}
# so FastAPI doesn't treat "confirm-all" as an entry_id.


@router.post("/entries/confirm-all")
def confirm_all(req: ConfirmAllRequest, db: Session = Depends(get_db)):
    entries = (
        db.query(DrinkEntry)
        .filter(DrinkEntry.is_marked == False, DrinkEntry.timestamp < req.cutoff)
        .all()
    )
    created_templates: dict[str, DrinkTemplate] = {}
    for entry in entries:
        if entry.custom_name is not None and entry.template_id is None:
            name = entry.custom_name
            if name not in created_templates:
                existing = db.query(DrinkTemplate).filter(
                    DrinkTemplate.name == name
                ).first()
                if existing:
                    created_templates[name] = existing
                else:
                    template = DrinkTemplate(
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
def list_entries(db: Session = Depends(get_db)):
    return db.query(DrinkEntry).order_by(DrinkEntry.timestamp.desc()).all()


@router.post("/entries", response_model=DrinkEntryResponse, status_code=201)
def create_entry(data: DrinkEntryCreate, db: Session = Depends(get_db)):
    entry = DrinkEntry(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/entries/{entry_id}", response_model=DrinkEntryResponse)
def update_entry(entry_id: str, data: DrinkEntryUpdate, db: Session = Depends(get_db)):
    entry = db.query(DrinkEntry).filter(DrinkEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.template_id is not None:
        raise HTTPException(status_code=400, detail="Cannot edit entries linked to a template")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.query(DrinkEntry).filter(DrinkEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.is_marked:
        raise HTTPException(status_code=400, detail="Cannot delete confirmed entries")
    db.delete(entry)
    db.commit()
