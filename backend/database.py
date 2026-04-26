import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from shared.models import Base  # noqa: F401 — re-exported for callers

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./drinklog.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
