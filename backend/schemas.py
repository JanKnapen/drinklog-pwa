from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator, field_serializer


def _to_naive_utc(v: datetime | None) -> datetime | None:
    """Convert timezone-aware datetime to naive UTC for SQLite storage."""
    if v is None:
        return v
    if v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class DrinkTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    default_ml: float
    default_abv: float
    usage_count: int
    entry_count: int
    confirmed_entry_count: int
    barcode: Optional[str] = None


class DrinkTemplateCreate(BaseModel):
    name: str
    default_ml: float
    default_abv: float
    barcode: Optional[str] = None


class DrinkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    default_ml: Optional[float] = None
    default_abv: Optional[float] = None
    usage_count: Optional[int] = None
    barcode: Optional[str] = None


class DrinkEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: Optional[str] = None
    template: Optional[DrinkTemplateResponse] = None
    custom_name: Optional[str] = None
    ml: float
    abv: float
    timestamp: datetime
    is_marked: bool
    standard_units: float

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class DrinkEntryCreate(BaseModel):
    template_id: Optional[str] = None
    custom_name: Optional[str] = None
    ml: float
    abv: float
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class DrinkEntryUpdate(BaseModel):
    custom_name: Optional[str] = None
    ml: Optional[float] = None
    abv: Optional[float] = None
    timestamp: Optional[datetime] = None

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class EntrySummaryItem(BaseModel):
    date: str
    total: float


class ConfirmAllRequest(BaseModel):
    cutoff: datetime

    @field_validator("cutoff")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class CaffeineTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    default_mg: float
    usage_count: int
    entry_count: int
    confirmed_entry_count: int
    barcode: Optional[str] = None


class CaffeineTemplateCreate(BaseModel):
    name: str
    default_mg: float
    barcode: Optional[str] = None


class CaffeineTemplateUpdate(BaseModel):
    name: Optional[str] = None
    default_mg: Optional[float] = None
    usage_count: Optional[int] = None
    barcode: Optional[str] = None


class CaffeineEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: Optional[str] = None
    template: Optional[CaffeineTemplateResponse] = None
    custom_name: Optional[str] = None
    mg: float
    timestamp: datetime
    is_marked: bool
    caffeine_units: float

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class CaffeineEntryCreate(BaseModel):
    template_id: Optional[str] = None
    custom_name: Optional[str] = None
    mg: float
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class CaffeineEntryUpdate(BaseModel):
    custom_name: Optional[str] = None
    mg: Optional[float] = None
    timestamp: Optional[datetime] = None

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
