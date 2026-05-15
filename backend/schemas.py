from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, field_serializer


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
    name: str = Field(min_length=1, max_length=200)
    default_ml: float = Field(gt=0, le=5000)
    default_abv: float = Field(ge=0, le=100)
    barcode: Optional[str] = None


class DrinkTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    default_ml: Optional[float] = Field(default=None, gt=0, le=5000)
    default_abv: Optional[float] = Field(default=None, ge=0, le=100)
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
    fraction: Optional[float] = None

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class DrinkEntryCreate(BaseModel):
    template_id: Optional[str] = None
    custom_name: Optional[str] = Field(default=None, max_length=200)
    ml: float = Field(gt=0, le=5000)
    abv: float = Field(ge=0, le=100)
    timestamp: datetime
    fraction: Optional[float] = Field(default=None, gt=0, le=1)

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class DrinkEntryUpdate(BaseModel):
    custom_name: Optional[str] = Field(default=None, max_length=200)
    ml: Optional[float] = Field(default=None, gt=0, le=5000)
    abv: Optional[float] = Field(default=None, ge=0, le=100)
    timestamp: Optional[datetime] = None

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class EntrySummaryItem(BaseModel):
    date: str
    total: float


class SummaryRange(BaseModel):
    first_date: str | None = None
    last_date: str | None = None


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
    name: str = Field(min_length=1, max_length=200)
    default_mg: float = Field(gt=0, le=2000)
    barcode: Optional[str] = None


class CaffeineTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    default_mg: Optional[float] = Field(default=None, gt=0, le=2000)
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
    fraction: Optional[float] = None

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        return v.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


class CaffeineEntryCreate(BaseModel):
    template_id: Optional[str] = None
    custom_name: Optional[str] = Field(default=None, max_length=200)
    mg: float = Field(gt=0, le=2000)
    timestamp: datetime
    fraction: Optional[float] = Field(default=None, gt=0, le=1)

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)


class CaffeineEntryUpdate(BaseModel):
    custom_name: Optional[str] = Field(default=None, max_length=200)
    mg: Optional[float] = Field(default=None, gt=0, le=2000)
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
