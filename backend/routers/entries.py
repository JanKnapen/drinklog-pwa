# backend/routers/entries.py (minimal stub for Task 5 tests)
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import DrinkEntry, DrinkTemplate
from schemas import DrinkEntryCreate, DrinkEntryResponse, ConfirmAllRequest

router = APIRouter(tags=["entries"])


@router.post("/entries/confirm-all")
def confirm_all(req: ConfirmAllRequest, db: Session = Depends(get_db)):
    entries = (
        db.query(DrinkEntry)
        .filter(DrinkEntry.is_marked == False, DrinkEntry.timestamp < req.cutoff)
        .all()
    )
    for entry in entries:
        if entry.custom_name is not None and entry.template_id is None:
            template = DrinkTemplate(
                name=entry.custom_name,
                default_ml=entry.ml,
                default_abv=entry.abv,
                usage_count=1,
            )
            db.add(template)
            db.flush()
            entry.template_id = template.id
            entry.custom_name = None
        entry.is_marked = True
    db.commit()
    return {"confirmed": len(entries)}


@router.post("/entries", response_model=DrinkEntryResponse, status_code=201)
def create_entry(data: DrinkEntryCreate, db: Session = Depends(get_db)):
    entry = DrinkEntry(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
