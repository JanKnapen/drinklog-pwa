import logging
import time
from typing import Optional, Literal

logger = logging.getLogger(__name__)

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, CaffeineTemplate, User
from routers.deps import get_current_user
from routers.parsers import parse_ml_from_text, parse_abv_from_text, parse_caffeine_mg_from_text

router = APIRouter(tags=["barcode"])

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
AH_SEARCH_URL = "https://api.ah.nl/mobile-services/product/search/v2"
AH_HEADERS = {"X-Application": "AHWEBSHOP"}


class BarcodeResult(BaseModel):
    source: Literal["local", "off", "ah", "not_found"]
    module: Optional[Literal["alcohol", "caffeine"]] = None
    template_id: Optional[str] = None
    name: Optional[str] = None
    ml: Optional[float] = None
    abv: Optional[float] = None
    mg: Optional[float] = None
    latency_ms: Optional[float] = None
    strategy_used: Optional[int] = None
    actual_source: Optional[str] = None


async def _fetch_off(client: httpx.AsyncClient, code: str) -> dict:
    resp = await client.get(OFF_URL.format(code=code))
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != 1:
        return {}
    return data.get("product", {})


async def _fetch_ah(client: httpx.AsyncClient, code: str) -> dict:
    resp = await client.get(AH_SEARCH_URL, params={"query": code, "page": 0, "size": 1}, headers=AH_HEADERS)
    resp.raise_for_status()
    data = resp.json()
    products = data.get("products", [])
    return products[0] if products else {}


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


def _extract_ah(product: dict, module: str) -> tuple[Optional[str], Optional[float], Optional[float], Optional[float]]:
    name = product.get("title") or product.get("description") or None
    ml = parse_ml_from_text(product.get("unitSize"))
    abv: Optional[float] = None
    mg: Optional[float] = None
    if module == "alcohol":
        raw_abv = product.get("alcoholPercentage")
        if raw_abv is not None:
            try:
                abv = float(raw_abv)
            except (ValueError, TypeError):
                pass
    return name, ml, abv, mg


async def _strategy_off_plus(code: str, module: str, client: httpx.AsyncClient) -> BarcodeResult:
    try:
        product = await _fetch_off(client, code)
    except Exception:
        return BarcodeResult(source="not_found", actual_source="off")

    if not product:
        return BarcodeResult(source="not_found", actual_source="off")

    name = product.get("product_name") or product.get("product_name_en") or None
    if not name:
        return BarcodeResult(source="not_found", actual_source="off")

    if module == "alcohol":
        ml, abv, _ = _extract_off_alcohol(product)
        return BarcodeResult(source="off", name=name, ml=ml, abv=abv, actual_source="off")
    else:
        ml, _, mg = _extract_off_caffeine(product)
        return BarcodeResult(source="off", name=name, ml=ml, mg=mg, actual_source="off")


async def _strategy_ah(code: str, module: str, client: httpx.AsyncClient) -> BarcodeResult:
    try:
        product = await _fetch_ah(client, code)
    except Exception:
        return BarcodeResult(source="not_found", actual_source="ah")

    if not product:
        return BarcodeResult(source="not_found", actual_source="ah")

    name, ml, abv, mg = _extract_ah(product, module)
    if not name:
        return BarcodeResult(source="not_found", actual_source="ah")

    return BarcodeResult(source="ah", name=name, ml=ml, abv=abv, mg=mg, actual_source="ah")


async def _strategy_hybrid(code: str, module: str, client: httpx.AsyncClient) -> BarcodeResult:
    ah_product: dict = {}
    off_product: dict = {}

    try:
        ah_product = await _fetch_ah(client, code)
    except Exception as exc:
        logger.warning("AH lookup failed for %s: %s", code, exc)

    try:
        off_product = await _fetch_off(client, code)
    except Exception as exc:
        logger.warning("OFF lookup failed for %s: %s", code, exc)

    # Name resolution — track which source it came from
    name = (ah_product.get("title") or ah_product.get("description")) or None
    name_source: Literal["ah", "off"] = "ah"
    if not name:
        name = (off_product.get("product_name") or off_product.get("product_name_en")) or None
        name_source = "off"
    if not name:
        return BarcodeResult(source="not_found", actual_source="hybrid")

    actual_source = "hybrid"

    if module == "alcohol":
        ml = parse_ml_from_text(ah_product.get("unitSize"))
        if ml is None and off_product:
            ml = parse_ml_from_text(off_product.get("quantity")) or parse_ml_from_text(off_product.get("serving_size"))

        abv: Optional[float] = None
        raw_abv = ah_product.get("alcoholPercentage")
        if raw_abv is not None:
            try:
                abv = float(raw_abv)
            except (ValueError, TypeError):
                pass

        if abv is None and off_product:
            nutriments = off_product.get("nutriments", {})
            for key in ("alcohol", "alcohol_value", "alcohol_100g"):
                raw = nutriments.get(key)
                if raw is not None:
                    try:
                        abv = float(raw)
                        break
                    except (ValueError, TypeError):
                        pass

        if abv is None:
            for field in ("ingredients_text", "description", "generic_name"):
                for source_dict in (ah_product, off_product):
                    text = source_dict.get(field)
                    abv = parse_abv_from_text(text)
                    if abv is not None:
                        actual_source = "hybrid+regex"
                        break
                if abv is not None:
                    break

        return BarcodeResult(source=name_source, name=name, ml=ml, abv=abv, actual_source=actual_source)

    else:
        ml = parse_ml_from_text(ah_product.get("unitSize"))
        if ml is None and off_product:
            ml = parse_ml_from_text(off_product.get("quantity")) or parse_ml_from_text(off_product.get("serving_size"))

        mg: Optional[float] = None
        if off_product:
            _, _, mg = _extract_off_caffeine(off_product)

        if mg is None:
            for field in ("ingredients_text", "description", "generic_name"):
                for source_dict in (ah_product, off_product):
                    text = source_dict.get(field)
                    mg_per_100ml = parse_caffeine_mg_from_text(text)
                    if mg_per_100ml is not None and ml is not None:
                        mg = mg_per_100ml * ml / 100
                        actual_source = "hybrid+regex"
                        break
                if mg is not None:
                    break

        return BarcodeResult(source=name_source, name=name, ml=ml, mg=mg, actual_source=actual_source)


@router.get("/barcode/{code}", response_model=BarcodeResult)
async def lookup_barcode(
    code: str,
    module: str = Query(..., pattern="^(alcohol|caffeine)$"),
    strategy: int = Query(default=1, ge=1, le=3),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t0 = time.perf_counter()

    alcohol_match = db.query(DrinkTemplate).filter(
        DrinkTemplate.barcode == code, DrinkTemplate.user_id == current_user.id
    ).first()
    if alcohol_match:
        latency_ms = (time.perf_counter() - t0) * 1000
        return BarcodeResult(
            source="local", module="alcohol",
            template_id=alcohol_match.id, name=alcohol_match.name,
            ml=alcohol_match.default_ml, abv=alcohol_match.default_abv,
            latency_ms=latency_ms, strategy_used=strategy, actual_source="local",
        )

    caffeine_match = db.query(CaffeineTemplate).filter(
        CaffeineTemplate.barcode == code, CaffeineTemplate.user_id == current_user.id
    ).first()
    if caffeine_match:
        latency_ms = (time.perf_counter() - t0) * 1000
        return BarcodeResult(
            source="local", module="caffeine",
            template_id=caffeine_match.id, name=caffeine_match.name,
            mg=caffeine_match.default_mg,
            latency_ms=latency_ms, strategy_used=strategy, actual_source="local",
        )

    async with httpx.AsyncClient(timeout=8.0) as client:
        if strategy == 1:
            result = await _strategy_off_plus(code, module, client)
        elif strategy == 2:
            result = await _strategy_ah(code, module, client)
        else:
            result = await _strategy_hybrid(code, module, client)

    result.latency_ms = (time.perf_counter() - t0) * 1000
    result.strategy_used = strategy
    return result
