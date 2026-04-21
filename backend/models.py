import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class DrinkTemplate(Base):
    __tablename__ = "drink_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    default_ml: Mapped[float] = mapped_column(Float, nullable=False)
    default_abv: Mapped[float] = mapped_column(Float, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    entries: Mapped[list["DrinkEntry"]] = relationship(
        "DrinkEntry", back_populates="template", lazy="selectin"
    )

    @property
    def entry_count(self) -> int:
        return len(self.entries)

    @property
    def confirmed_entry_count(self) -> int:
        return sum(1 for e in self.entries if e.is_marked)


class DrinkEntry(Base):
    __tablename__ = "drink_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("drink_templates.id"), nullable=True
    )
    custom_name: Mapped[str | None] = mapped_column(String, nullable=True)
    ml: Mapped[float] = mapped_column(Float, nullable=False)
    abv: Mapped[float] = mapped_column(Float, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_marked: Mapped[bool] = mapped_column(Boolean, default=False)

    template: Mapped["DrinkTemplate | None"] = relationship(
        "DrinkTemplate", back_populates="entries"
    )

    @property
    def standard_units(self) -> float:
        return (self.ml * self.abv / 100.0) / 15.0


class CaffeineTemplate(Base):
    __tablename__ = "caffeine_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    default_mg: Mapped[float] = mapped_column(Float, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    entries: Mapped[list["CaffeineEntry"]] = relationship(
        "CaffeineEntry", back_populates="template", lazy="selectin"
    )

    @property
    def entry_count(self) -> int:
        return len(self.entries)

    @property
    def confirmed_entry_count(self) -> int:
        return sum(1 for e in self.entries if e.is_marked)


class CaffeineEntry(Base):
    __tablename__ = "caffeine_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("caffeine_templates.id"), nullable=True
    )
    custom_name: Mapped[str | None] = mapped_column(String, nullable=True)
    mg: Mapped[float] = mapped_column(Float, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_marked: Mapped[bool] = mapped_column(Boolean, default=False)

    template: Mapped["CaffeineTemplate | None"] = relationship(
        "CaffeineTemplate", back_populates="entries"
    )

    @property
    def caffeine_units(self) -> float:
        return self.mg / 80.0
