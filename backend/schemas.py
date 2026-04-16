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


class DrinkTemplateCreate(BaseModel):
    name: str
    default_ml: float
    default_abv: float


class DrinkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    default_ml: Optional[float] = None
    default_abv: Optional[float] = None
    usage_count: Optional[int] = None


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


class ConfirmAllRequest(BaseModel):
    cutoff: datetime

    @field_validator("cutoff")
    @classmethod
    def strip_tz(cls, v: datetime | None) -> datetime | None:
        return _to_naive_utc(v)
