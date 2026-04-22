import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect as sa_inspect

from database import Base, engine
from routers import templates, entries, caffeine_templates, caffeine_entries
from routers import barcode
from config import PUBLIC_CONFIG

Base.metadata.create_all(bind=engine)

# Add barcode columns to existing DBs that pre-date this migration
def _migrate():
    inspector = sa_inspect(engine)
    for table in ("drink_templates", "caffeine_templates"):
        existing = {c["name"] for c in inspector.get_columns(table)}
        if "barcode" not in existing:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN barcode VARCHAR"))
                conn.commit()

_migrate()

app = FastAPI(title="DrinkLog API")

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost,http://localhost:5173"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(templates.router, prefix="/api")
app.include_router(entries.router, prefix="/api")
app.include_router(caffeine_templates.router, prefix="/api")
app.include_router(caffeine_entries.router, prefix="/api")
app.include_router(barcode.router, prefix="/api")


@app.get("/api/config")
def get_config() -> dict:
    return PUBLIC_CONFIG
