import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text, inspect as sa_inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Base, engine
from routers import templates, entries, caffeine_templates, caffeine_entries
from routers import barcode
from routers.auth import router as auth_router, limiter
from config import PUBLIC_CONFIG, ADMIN_SEED_USERNAME, ADMIN_SEED_PASSWORD
from auth import hash_password

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
                hashed_password=hash_password(ADMIN_SEED_PASSWORD),
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


_TEMPLATE_TABLE_SCHEMAS = {
    "drink_templates": """
        CREATE TABLE drink_templates_new (
            id VARCHAR NOT NULL PRIMARY KEY,
            name VARCHAR NOT NULL,
            default_ml FLOAT NOT NULL,
            default_abv FLOAT NOT NULL,
            usage_count INTEGER,
            barcode VARCHAR,
            user_id INTEGER NOT NULL REFERENCES users(id)
        )
    """,
    "caffeine_templates": """
        CREATE TABLE caffeine_templates_new (
            id VARCHAR NOT NULL PRIMARY KEY,
            name VARCHAR NOT NULL,
            default_mg FLOAT NOT NULL,
            usage_count INTEGER,
            barcode VARCHAR,
            user_id INTEGER NOT NULL REFERENCES users(id)
        )
    """,
}


def _recreate_template_table_without_name_unique(table: str) -> None:
    """Recreate a template table to drop the inline UNIQUE on name.

    SQLite doesn't support DROP CONSTRAINT. When the original CREATE TABLE
    included UNIQUE on name, SQLite creates a sqlite_autoindex that can only
    be removed by recreating the table.
    """
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        conn.execute(text(_TEMPLATE_TABLE_SCHEMAS[table]))
        cols = [c[1] for c in conn.execute(text(f"PRAGMA table_info('{table}')")).fetchall()]
        col_list = ", ".join(cols)
        conn.execute(text(f"INSERT INTO {table}_new ({col_list}) SELECT {col_list} FROM {table}"))
        conn.execute(text(f"DROP TABLE {table}"))
        conn.execute(text(f"ALTER TABLE {table}_new RENAME TO {table}"))
        conn.execute(text("PRAGMA foreign_keys = ON"))
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
        old_index_name = f"uq_{table}_barcode"
        if old_index_name in existing_indexes:
            with engine.connect() as conn:
                conn.execute(text(f"DROP INDEX IF EXISTS {old_index_name}"))
                conn.commit()
            existing_indexes.discard(old_index_name)
        new_index_name = f"uq_{table}_barcode_user"
        if new_index_name not in existing_indexes:
            with engine.connect() as conn:
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {new_index_name} "
                    f"ON {table}(barcode, user_id) WHERE barcode IS NOT NULL"
                ))
                conn.commit()

        # Remove the global unique constraint on name. SQLAlchemy baked this into
        # the original CREATE TABLE as an inline UNIQUE, which SQLite names
        # sqlite_autoindex_{table}_N. These cannot be dropped with DROP INDEX —
        # the table must be recreated. We detect them by the sqlite_autoindex_
        # prefix + unique flag + covering only the name column.
        with engine.connect() as conn:
            indexes = conn.execute(text(f"PRAGMA index_list('{table}')")).fetchall()
            has_inline_name_unique = any(
                idx[1].startswith("sqlite_autoindex_") and idx[2] == 1
                and [c[2] for c in conn.execute(text(f"PRAGMA index_info('{idx[1]}')")).fetchall()] == ["name"]
                for idx in indexes
            )

        if has_inline_name_unique:
            _recreate_template_table_without_name_unique(table)

        # Per-user name uniqueness
        with engine.connect() as conn:
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA index_list('{table}')")).fetchall()
            }
        user_name_index = f"uq_{table}_user_name"
        if user_name_index not in existing:
            with engine.connect() as conn:
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {user_name_index} "
                    f"ON {table}(user_id, name)"
                ))
                conn.commit()

    # Add fraction column to entry tables if missing
    for table in ("drink_entries", "caffeine_entries"):
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        if "fraction" not in existing_cols:
            with engine.connect() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN fraction FLOAT"))
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


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"detail": "A record with this name or value already exists"},
    )

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
