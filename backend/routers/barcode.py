import re
from typing import Optional, Literal

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, CaffeineTemplate

router = APIRouter(tags=["barcode"])

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"


class BarcodeResult(BaseModel):
    source: Literal["local", "off", "not_found"]
    module: Optional[Literal["alcohol", "caffeine"]] = None
    template_id: Optional[str] = None
    name: Optional[str] = None
    ml: Optional[float] = None
    abv: Optional[float] = None
    mg: Optional[float] = None


def _parse_ml(quantity: str | None) -> Optional[float]:
    if not quantity:
        return None
    q = quantity.lower().replace(",", ".").strip()
    m = re.search(r"([\d.]+)\s*(cl|ml|l\b)", q)
    if not m:
        return None
    value, unit = float(m.group(1)), m.group(2)
    if unit == "cl":
        return value * 10
    if unit == "l":
        return value * 1000
    return value


@router.get("/barcode/{code}", response_model=BarcodeResult)
async def lookup_barcode(
    code: str,
    module: str = Query(..., pattern="^(alcohol|caffeine)$"),
    db: Session = Depends(get_db),
):
    alcohol_match = db.query(DrinkTemplate).filter(DrinkTemplate.barcode == code).first()
    if alcohol_match:
        return BarcodeResult(
            source="local",
            module="alcohol",
            template_id=alcohol_match.id,
            name=alcohol_match.name,
            ml=alcohol_match.default_ml,
            abv=alcohol_match.default_abv,
        )

    caffeine_match = db.query(CaffeineTemplate).filter(CaffeineTemplate.barcode == code).first()
    if caffeine_match:
        return BarcodeResult(
            source="local",
            module="caffeine",
            template_id=caffeine_match.id,
            name=caffeine_match.name,
            mg=caffeine_match.default_mg,
        )

    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            resp = await client.get(OFF_URL.format(code=code))
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return BarcodeResult(source="not_found")

    if data.get("status") != 1:
        return BarcodeResult(source="not_found")

    product = data.get("product", {})
    nutriments = product.get("nutriments", {})

    name = product.get("product_name") or product.get("product_name_en") or None
    ml = _parse_ml(product.get("quantity"))

    abv: Optional[float] = None
    mg: Optional[float] = None

    if module == "alcohol":
        raw_abv = next((nutriments[k] for k in ("alcohol", "alcohol_value") if k in nutriments), None)
        if raw_abv is not None:
            try:
                abv = float(raw_abv)
            except (ValueError, TypeError):
                pass
    else:
        caffeine_100g = nutriments.get("caffeine_100g") or nutriments.get("caffeine")
        caffeine_serving = nutriments.get("caffeine_serving")
        if caffeine_serving is not None:
            try:
                mg = float(caffeine_serving) * 1000
            except (ValueError, TypeError):
                pass
        elif caffeine_100g is not None and ml is not None:
            try:
                mg = float(caffeine_100g) * ml * 10
            except (ValueError, TypeError):
                pass

    if not name:
        return BarcodeResult(source="not_found")

    return BarcodeResult(source="off", name=name, ml=ml, abv=abv, mg=mg)
