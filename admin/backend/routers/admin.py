import logging
import time
import uuid
from collections import defaultdict
from datetime import datetime
from threading import Lock
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter

logger = logging.getLogger("uvicorn.error")

from database import get_db
from auth import create_admin_token, hash_password
from routers.deps import get_admin_user
from config import ADMIN_MASTER_PASSWORD
from shared.models import User, DrinkEntry, DrinkTemplate, CaffeineEntry, CaffeineTemplate


def _get_real_ip(request: Request) -> str:
    return request.headers.get("X-Real-IP") or (
        request.client.host if request.client else "127.0.0.1"
    )


limiter = Limiter(key_func=_get_real_ip)
router = APIRouter()

_LOCKOUT_WINDOW = 15 * 60
_MAX_FAILURES = 10
_LOCKOUT_DURATION = 15 * 60

_failures: dict[str, list[float]] = defaultdict(list)
_failures_lock = Lock()


def _check_lockout(ip: str) -> None:
    now = time.time()
    with _failures_lock:
        _failures[ip] = [t for t in _failures[ip] if now - t < _LOCKOUT_WINDOW]
        if len(_failures[ip]) >= _MAX_FAILURES:
            raise HTTPException(
                status_code=423,
                detail="Too many failed login attempts. Try again later.",
                headers={"Retry-After": str(_LOCKOUT_DURATION)},
            )


def _record_failure(ip: str) -> None:
    with _failures_lock:
        _failures[ip].append(time.time())


def _clear_failures(ip: str) -> None:
    with _failures_lock:
        _failures.pop(ip, None)


class LoginRequest(BaseModel):
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("Password must be at least 16 characters")
        return v


class ChangePasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("Password must be at least 16 characters")
        return v


@router.post("/admin/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest):
    ip = _get_real_ip(request)
    _check_lockout(ip)
    if body.password != ADMIN_MASTER_PASSWORD:
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid password")
    _clear_failures(ip)
    return {"access_token": create_admin_token()}


@router.get("/admin/users")
def list_users(db: Session = Depends(get_db), _: None = Depends(get_admin_user)):
    users = db.query(User).all()
    result = []
    for user in users:
        alcohol_count = db.query(DrinkEntry).filter(DrinkEntry.user_id == user.id).count()
        caffeine_count = db.query(CaffeineEntry).filter(CaffeineEntry.user_id == user.id).count()
        result.append({
            "id": user.id,
            "username": user.username,
            "alcohol_entries": alcohol_count,
            "caffeine_entries": caffeine_count,
        })
    return result


@router.post("/admin/users")
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=body.username, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.warning("admin: created user id=%d username=%s", user.id, user.username)
    return {"id": user.id, "username": user.username}


@router.patch("/admin/users/{user_id}/password")
def update_password(
    user_id: int,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    logger.warning("admin: changed password for user id=%d username=%s", user.id, user.username)
    return {"message": "updated"}


@router.delete("/admin/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Explicit cascade — delete child rows before the user row
    db.query(DrinkEntry).filter(DrinkEntry.user_id == user_id).delete()
    db.query(CaffeineEntry).filter(CaffeineEntry.user_id == user_id).delete()
    db.query(DrinkTemplate).filter(DrinkTemplate.user_id == user_id).delete()
    db.query(CaffeineTemplate).filter(CaffeineTemplate.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    logger.warning("admin: deleted user id=%d username=%s", user.id, user.username)
    return {"message": "deleted"}


@router.get("/admin/users/{user_id}/templates")
def get_user_templates(
    user_id: int,
    module: Literal["alcohol", "caffeine"] = "alcohol",
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if module == "alcohol":
        templates = db.query(DrinkTemplate).filter(DrinkTemplate.user_id == user_id).all()
        return [{"id": t.id, "name": t.name, "default_ml": t.default_ml, "default_abv": t.default_abv} for t in templates]
    else:
        templates = db.query(CaffeineTemplate).filter(CaffeineTemplate.user_id == user_id).all()
        return [{"id": t.id, "name": t.name, "default_mg": t.default_mg} for t in templates]


class ImportEntry(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    date: str | None = Field(default=None, max_length=50)
    timestamp: str | None = Field(default=None, max_length=50)
    count: float = Field(default=1.0, gt=0, le=1000)

    @field_validator("count")
    @classmethod
    def count_half_steps_only(cls, v: float) -> float:
        if abs(round(v * 2) - v * 2) > 1e-9 or round(v * 2) < 1:
            raise ValueError("count must be a positive whole number or x.5 (e.g. 1, 1.5, 2)")
        return v
    # Anonymous entry fields (used when name is absent)
    ml: float | None = Field(default=None, gt=0, le=5000)
    abv: float | None = Field(default=None, ge=0, le=100)
    mg: float | None = Field(default=None, gt=0, le=2000)


class DrinkMapping(BaseModel):
    drink_name: str = Field(max_length=200)
    mode: Literal["existing", "new"]
    template_id: str | None = Field(default=None, max_length=36)  # UUID length
    template_name: str | None = Field(default=None, max_length=200)
    ml: float | None = Field(default=None, gt=0, le=5000)
    abv: float | None = Field(default=None, ge=0, le=100)
    mg: float | None = Field(default=None, gt=0, le=2000)


class ImportRequest(BaseModel):
    module: Literal["alcohol", "caffeine"]
    mappings: list[DrinkMapping] = Field(max_length=500)
    entries: list[ImportEntry] = Field(max_length=10_000)


@router.post("/admin/users/{user_id}/import")
def import_entries(
    user_id: int,
    body: ImportRequest,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Build name → resolved template_id map, creating new templates as needed
    name_to_template_id: dict[str, str] = {}
    for mapping in body.mappings:
        if mapping.mode == "existing":
            if not mapping.template_id:
                raise HTTPException(status_code=422, detail=f"Missing template_id for '{mapping.drink_name}'")
            name_to_template_id[mapping.drink_name] = mapping.template_id
        else:
            effective_name = (mapping.template_name or mapping.drink_name).strip()
            if not effective_name:
                raise HTTPException(status_code=422, detail=f"Missing template name for '{mapping.drink_name}'")
            if body.module == "alcohol":
                if mapping.ml is None or mapping.abv is None:
                    raise HTTPException(status_code=422, detail=f"Missing ml/abv for '{mapping.drink_name}'")
                existing = db.query(DrinkTemplate).filter(
                    DrinkTemplate.user_id == user_id,
                    DrinkTemplate.name == effective_name,
                ).first()
                if existing:
                    raise HTTPException(status_code=409, detail=f"Template '{effective_name}' already exists")
                else:
                    t = DrinkTemplate(
                        id=str(uuid.uuid4()),
                        name=effective_name,
                        default_ml=mapping.ml,
                        default_abv=mapping.abv,
                        usage_count=0,
                        user_id=user_id,
                    )
                    db.add(t)
                    db.flush()
                    template_id = t.id
            else:
                if mapping.mg is None:
                    raise HTTPException(status_code=422, detail=f"Missing mg for '{mapping.drink_name}'")
                existing = db.query(CaffeineTemplate).filter(
                    CaffeineTemplate.user_id == user_id,
                    CaffeineTemplate.name == effective_name,
                ).first()
                if existing:
                    raise HTTPException(status_code=409, detail=f"Template '{effective_name}' already exists")
                else:
                    t = CaffeineTemplate(
                        id=str(uuid.uuid4()),
                        name=effective_name,
                        default_mg=mapping.mg,
                        usage_count=0,
                        user_id=user_id,
                    )
                    db.add(t)
                    db.flush()
                    template_id = t.id
            name_to_template_id[mapping.drink_name] = template_id

    # Pre-build lookup dicts to avoid O(N²) scans inside the entry loop
    name_to_mapping: dict[str, DrinkMapping] = {m.drink_name: m for m in body.mappings}

    # Pre-fetch templates for "existing" mappings so the inner loop makes no DB calls.
    # Filter by user_id to prevent cross-user template references (H1).
    template_id_to_defaults: dict[str, tuple] = {}
    existing_template_ids = {
        tid for m in body.mappings
        if m.mode == "existing"
        for tid in [name_to_template_id.get(m.drink_name)]
        if tid
    }
    if body.module == "alcohol":
        for t in db.query(DrinkTemplate).filter(
            DrinkTemplate.id.in_(existing_template_ids),
            DrinkTemplate.user_id == user_id,
        ).all():
            template_id_to_defaults[t.id] = (t.default_ml, t.default_abv)
    else:
        for t in db.query(CaffeineTemplate).filter(
            CaffeineTemplate.id.in_(existing_template_ids),
            CaffeineTemplate.user_id == user_id,
        ).all():
            template_id_to_defaults[t.id] = (t.default_mg,)

    # Reject any "existing" template_id that wasn't found for this user (H1).
    for m in body.mappings:
        if m.mode == "existing":
            tid = name_to_template_id.get(m.drink_name)
            if tid and tid not in template_id_to_defaults:
                raise HTTPException(status_code=404, detail=f"Template not found for '{m.drink_name}'")

    # Guard against very large imports: cap total DB rows before writing (M4).
    total_rows = sum(
        int(e.count) + (1 if round(e.count * 2) % 2 == 1 else 0)
        for e in body.entries
    )
    if total_rows > 50_000:
        raise HTTPException(status_code=422, detail=f"Import would create {total_rows} rows; maximum is 50,000")

    # Track usage_count increments per template
    usage_increments: dict[str, int] = {}

    inserted = 0
    for entry in body.entries:
        if entry.timestamp:
            try:
                ts = datetime.fromisoformat(entry.timestamp)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Invalid timestamp: {entry.timestamp}")
        elif entry.date:
            try:
                ts = datetime.strptime(entry.date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Invalid date: {entry.date}")
        else:
            raise HTTPException(status_code=422, detail="Each entry must have 'date' or 'timestamp'")

        full = int(entry.count)
        has_half = round(entry.count * 2) % 2 == 1  # True when count has a .5 part
        fractions: list[float | None] = [None] * full + ([0.5] if has_half else [])

        if entry.name:
            # Named entry — resolve via mapping
            template_id = name_to_template_id.get(entry.name)
            if not template_id:
                raise HTTPException(status_code=422, detail=f"No mapping for drink name '{entry.name}'")

            mapping = name_to_mapping[entry.name]
            usage_increments[template_id] = usage_increments.get(template_id, 0) + len(fractions)

            for fraction in fractions:
                if body.module == "alcohol":
                    ml = mapping.ml if mapping.mode == "new" else None
                    abv = mapping.abv if mapping.mode == "new" else None
                    if ml is None or abv is None:
                        ml, abv = template_id_to_defaults[template_id]
                    e = DrinkEntry(
                        id=str(uuid.uuid4()),
                        template_id=template_id,
                        ml=ml,
                        abv=abv,
                        fraction=fraction,
                        timestamp=ts,
                        is_marked=True,
                        imported=True,
                        user_id=user_id,
                    )
                else:
                    mg = mapping.mg if mapping.mode == "new" else None
                    if mg is None:
                        (mg,) = template_id_to_defaults[template_id]
                    e = CaffeineEntry(
                        id=str(uuid.uuid4()),
                        template_id=template_id,
                        mg=mg,
                        fraction=fraction,
                        timestamp=ts,
                        is_marked=True,
                        imported=True,
                        user_id=user_id,
                    )
                db.add(e)
                inserted += 1
        else:
            # Anonymous entry — no template, values carried inline
            if body.module == "alcohol":
                if entry.ml is None or entry.abv is None:
                    raise HTTPException(status_code=422, detail="Anonymous alcohol entry requires 'ml' and 'abv'")
                for fraction in fractions:
                    e = DrinkEntry(
                        id=str(uuid.uuid4()),
                        template_id=None,
                        custom_name=None,
                        ml=entry.ml,
                        abv=entry.abv,
                        fraction=fraction,
                        timestamp=ts,
                        is_marked=True,
                        imported=True,
                        user_id=user_id,
                    )
                    db.add(e)
                    inserted += 1
            else:
                if entry.mg is None:
                    raise HTTPException(status_code=422, detail="Anonymous caffeine entry requires 'mg'")
                for fraction in fractions:
                    e = CaffeineEntry(
                        id=str(uuid.uuid4()),
                        template_id=None,
                        custom_name=None,
                        mg=entry.mg,
                        fraction=fraction,
                        timestamp=ts,
                        is_marked=True,
                        imported=True,
                        user_id=user_id,
                    )
                    db.add(e)
                    inserted += 1

    # Batch-update usage_count — filter by user_id to prevent cross-user writes (H1).
    for template_id, increment in usage_increments.items():
        if body.module == "alcohol":
            t = db.query(DrinkTemplate).filter(
                DrinkTemplate.id == template_id,
                DrinkTemplate.user_id == user_id,
            ).first()
        else:
            t = db.query(CaffeineTemplate).filter(
                CaffeineTemplate.id == template_id,
                CaffeineTemplate.user_id == user_id,
            ).first()
        if t:
            t.usage_count = (t.usage_count or 0) + increment

    db.commit()
    logger.warning("admin: imported %d entries for user id=%d username=%s", inserted, user.id, user.username)
    return {"inserted": inserted}
