import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import templates, entries, caffeine_templates, caffeine_entries
from config import PUBLIC_CONFIG

Base.metadata.create_all(bind=engine)

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


@app.get("/api/config")
def get_config() -> dict:
    return PUBLIC_CONFIG
