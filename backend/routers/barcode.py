import logging
from typing import Optional, Literal

import httpx
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, CaffeineTemplate, User
from routers.deps import get_current_user
from routers.auth import limiter
from routers.parsers import parse_ml_from_text

router = APIRouter(tags=["barcode"])
logger = logging.getLogger("uvicorn.error")

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"


class BarcodeResult(BaseModel):
    source: Literal["local", "off", "not_found"]
    module: Optional[Literal["alcohol", "caffeine"]] = None
    template_id: Optional[str] = None
    name: Optional[str] = None
    ml: Optional[float] = None
    abv: Optional[float] = None
    mg: Optional[float] = None


async def _fetch_off(client: httpx.AsyncClient, code: str) -> dict:
    resp = await client.get(OFF_URL.format(code=code))
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != 1:
        return {}
    return data.get("product", {})


def _extract_off_alcohol(product: dict) -> tuple[Optional[float], Optional[float], Optional[float]]:
    nutriments = product.get("nutriments", {})
    ml = parse_ml_from_text(product.get("quantity")) or parse_ml_from_text(product.get("serving_size"))
    abv: Optional[float] = None
    for key in ("alcohol", "alcohol_value", "alcohol_100g"):
        raw = nutriments.get(key)
        if raw is not None:
            try:
                abv = float(raw)
                break
            except (ValueError, TypeError):
                pass
    return ml, abv, None


def _extract_off_caffeine(product: dict) -> tuple[Optional[float], Optional[float], Optional[float]]:
    nutriments = product.get("nutriments", {})
    ml = parse_ml_from_text(product.get("quantity")) or parse_ml_from_text(product.get("serving_size"))
    mg: Optional[float] = None
    caffeine_serving = nutriments.get("caffeine_serving")
    caffeine_100g = nutriments.get("caffeine_100g") or nutriments.get("caffeine")
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
    return ml, None, mg


async def _strategy_off_plus(code: str, module: str, client: httpx.AsyncClient) -> BarcodeResult:
    try:
        product = await _fetch_off(client, code)
    except Exception as exc:
        logger.warning("OFF lookup failed for barcode %s: %s", code, exc)
        return BarcodeResult(source="not_found")

    if not product:
        return BarcodeResult(source="not_found")

    name = product.get("product_name") or product.get("product_name_en") or None
    if not name:
        return BarcodeResult(source="not_found")

    if module == "alcohol":
        ml, abv, _ = _extract_off_alcohol(product)
        return BarcodeResult(source="off", name=name, ml=ml, abv=abv)
    else:
        ml, _, mg = _extract_off_caffeine(product)
        return BarcodeResult(source="off", name=name, ml=ml, mg=mg)


@router.get("/barcode/{code}", response_model=BarcodeResult)
@limiter.limit("15/minute")
async def lookup_barcode(
    request: Request,
    code: str,
    module: str = Query(..., pattern="^(alcohol|caffeine)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    alcohol_match = db.query(DrinkTemplate).filter(
        DrinkTemplate.barcode == code, DrinkTemplate.user_id == current_user.id
    ).first()
    if alcohol_match:
        return BarcodeResult(
            source="local", module="alcohol",
            template_id=alcohol_match.id, name=alcohol_match.name,
            ml=alcohol_match.default_ml, abv=alcohol_match.default_abv,
        )

    caffeine_match = db.query(CaffeineTemplate).filter(
        CaffeineTemplate.barcode == code, CaffeineTemplate.user_id == current_user.id
    ).first()
    if caffeine_match:
        return BarcodeResult(
            source="local", module="caffeine",
            template_id=caffeine_match.id, name=caffeine_match.name,
            mg=caffeine_match.default_mg,
        )

    async with httpx.AsyncClient(timeout=8.0) as client:
        result = await _strategy_off_plus(code, module, client)
    return result
