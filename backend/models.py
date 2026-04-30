from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from shared.models import Base, User, DrinkTemplate, DrinkEntry, CaffeineTemplate, CaffeineEntry


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    jti: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


__all__ = ["Base", "User", "DrinkTemplate", "DrinkEntry", "CaffeineTemplate", "CaffeineEntry", "RefreshToken"]
