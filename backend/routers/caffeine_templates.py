from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import CaffeineTemplate, CaffeineEntry
from schemas import CaffeineTemplateCreate, CaffeineTemplateUpdate, CaffeineTemplateResponse

router = APIRouter(tags=["caffeine-templates"])


@router.get("/caffeine-templates", response_model=list[CaffeineTemplateResponse])
def list_caffeine_templates(db: Session = Depends(get_db)):
    return db.query(CaffeineTemplate).order_by(CaffeineTemplate.usage_count.desc()).all()


@router.post("/caffeine-templates", response_model=CaffeineTemplateResponse, status_code=201)
def create_caffeine_template(data: CaffeineTemplateCreate, db: Session = Depends(get_db)):
    if db.query(CaffeineTemplate).filter(CaffeineTemplate.name == data.name).first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    if db.query(CaffeineEntry).filter(CaffeineEntry.custom_name == data.name, CaffeineEntry.is_marked == False).first():
        raise HTTPException(status_code=409, detail="An unconfirmed entry with this name exists — confirm it first")
    if data.barcode and db.query(CaffeineTemplate).filter(CaffeineTemplate.barcode == data.barcode).first():
        raise HTTPException(status_code=409, detail="A template with this barcode already exists")
    template = CaffeineTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.patch("/caffeine-templates/{template_id}", response_model=CaffeineTemplateResponse)
def update_caffeine_template(template_id: str, data: CaffeineTemplateUpdate, db: Session = Depends(get_db)):
    template = db.query(CaffeineTemplate).filter(CaffeineTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.name is not None:
        conflict = db.query(CaffeineTemplate).filter(
            CaffeineTemplate.name == data.name, CaffeineTemplate.id != template_id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        if db.query(CaffeineEntry).filter(
            CaffeineEntry.custom_name == data.name, CaffeineEntry.is_marked == False
        ).first():
            raise HTTPException(status_code=409, detail="An unconfirmed entry with this name exists — confirm it first")
        template.name = data.name

    if data.usage_count is not None:
        template.usage_count = data.usage_count

    if data.barcode is not None:
        template.barcode = data.barcode

    has_confirmed = any(e.is_marked for e in template.entries)
    if not has_confirmed and data.default_mg is not None:
        template.default_mg = data.default_mg

    db.commit()
    db.refresh(template)
    return template


@router.delete("/caffeine-templates/{template_id}", status_code=204)
def delete_caffeine_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(CaffeineTemplate).filter(CaffeineTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.entries:
        raise HTTPException(status_code=409, detail="Cannot delete a template that has linked entries")
    db.delete(template)
    db.commit()
