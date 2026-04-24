from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, DrinkEntry
from schemas import DrinkTemplateCreate, DrinkTemplateUpdate, DrinkTemplateResponse

router = APIRouter(tags=["templates"])


@router.get("/templates", response_model=list[DrinkTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    return db.query(DrinkTemplate).order_by(DrinkTemplate.usage_count.desc()).all()


@router.post("/templates", response_model=DrinkTemplateResponse, status_code=201)
def create_template(data: DrinkTemplateCreate, db: Session = Depends(get_db)):
    if db.query(DrinkTemplate).filter(DrinkTemplate.name == data.name).first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    if db.query(DrinkEntry).filter(DrinkEntry.custom_name == data.name, DrinkEntry.is_marked == False).first():
        raise HTTPException(status_code=409, detail="An unconfirmed entry with this name exists — confirm it first")
    if data.barcode and db.query(DrinkTemplate).filter(DrinkTemplate.barcode == data.barcode).first():
        raise HTTPException(status_code=409, detail="A template with this barcode already exists")
    template = DrinkTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=DrinkTemplateResponse)
def update_template(template_id: str, data: DrinkTemplateUpdate, db: Session = Depends(get_db)):
    template = db.query(DrinkTemplate).filter(DrinkTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.name is not None:
        conflict = db.query(DrinkTemplate).filter(
            DrinkTemplate.name == data.name, DrinkTemplate.id != template_id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        if db.query(DrinkEntry).filter(
            DrinkEntry.custom_name == data.name, DrinkEntry.is_marked == False
        ).first():
            raise HTTPException(status_code=409, detail="An unconfirmed entry with this name exists — confirm it first")
        template.name = data.name

    if data.usage_count is not None:
        template.usage_count = data.usage_count

    if data.barcode is not None:
        template.barcode = data.barcode

    has_confirmed = any(e.is_marked for e in template.entries)
    if not has_confirmed:
        if data.default_ml is not None:
            template.default_ml = data.default_ml
        if data.default_abv is not None:
            template.default_abv = data.default_abv

    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(DrinkTemplate).filter(DrinkTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.entries:
        raise HTTPException(status_code=409, detail="Cannot delete a template that has linked entries")
    db.delete(template)
    db.commit()
