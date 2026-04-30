import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import ADMIN_MASTER_PASSWORD
from routers.admin import router as admin_router, limiter

if not ADMIN_MASTER_PASSWORD:
    raise RuntimeError(
        "ADMIN_MASTER_PASSWORD env var must be set. "
        "The admin backend refuses to start without it."
    )

app = FastAPI(title="DrinkLog Admin API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost,http://localhost:5174"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(admin_router, prefix="/api")
