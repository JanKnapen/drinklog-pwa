import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text, inspect as sa_inspect
from sqlalchemy.orm import Session

from database import Base, engine
from routers import templates, entries, caffeine_templates, caffeine_entries
from routers import barcode
from routers.auth import router as auth_router, limiter
from config import PUBLIC_CONFIG, ADMIN_SEED_USERNAME, ADMIN_SEED_PASSWORD
from auth import pwd_context

Base.metadata.create_all(bind=engine)


def _ensure_seed_user():
    from models import User
    with Session(engine) as session:
        if session.query(User).count() == 0:
            if not ADMIN_SEED_USERNAME or not ADMIN_SEED_PASSWORD:
                raise RuntimeError(
                    "No users exist and ADMIN_SEED_USERNAME/ADMIN_SEED_PASSWORD env vars are not set. "
                    "Set them to bootstrap the first user."
                )
            user = User(
                username=ADMIN_SEED_USERNAME,
                hashed_password=pwd_context.hash(ADMIN_SEED_PASSWORD),
            )
            session.add(user)
            session.commit()


def _migrate_user_id_columns():
    from models import User
    inspector = sa_inspect(engine)
    with Session(engine) as session:
        seed_user = session.query(User).first()
        assert seed_user is not None  # guaranteed by _ensure_seed_user
        seed_user_id = seed_user.id

    tables = ["drink_entries", "drink_templates", "caffeine_entries", "caffeine_templates"]
    for table in tables:
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        if "user_id" not in existing_cols:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER"))
                conn.commit()
        # Backfill NULLs
        with engine.connect() as conn:
            conn.execute(text(
                f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"
            ), {"uid": seed_user_id})
            conn.commit()


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

    # Auth migration
    _ensure_seed_user()  # must run before backfill
    _migrate_user_id_columns()

_migrate()

app = FastAPI(title="DrinkLog API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(auth_router, prefix="/api")


@app.get("/api/config")
def get_config() -> dict:
    return PUBLIC_CONFIG
