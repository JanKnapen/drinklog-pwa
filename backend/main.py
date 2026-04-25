import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, inspect as sa_inspect

from database import Base, engine
from routers import templates, entries, caffeine_templates, caffeine_entries
from routers import barcode
from config import PUBLIC_CONFIG

Base.metadata.create_all(bind=engine)

def _migrate():
    inspector = sa_inspect(engine)
    for table in ("drink_templates", "caffeine_templates"):
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        if "barcode" not in existing_cols:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN barcode VARCHAR"))
                conn.commit()
        existing_indexes = {i["name"] for i in inspector.get_indexes(table)}
        index_name = f"uq_{table}_barcode"
        if index_name not in existing_indexes:
            with engine.connect() as conn:
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} "
                    f"ON {table}(barcode) WHERE barcode IS NOT NULL"
                ))
                conn.commit()

    # Create indexes on entry tables for pagination, filtering, and joins
    for table, columns in [
        ("drink_entries", ["timestamp", "is_marked", "template_id"]),
        ("caffeine_entries", ["timestamp", "is_marked", "template_id"]),
    ]:
        existing_indexes = {i["name"] for i in inspector.get_indexes(table)}
        for column in columns:
            index_name = f"ix_{table}_{column}"
            if index_name not in existing_indexes:
                with engine.connect() as conn:
                    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table}({column})"))
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
