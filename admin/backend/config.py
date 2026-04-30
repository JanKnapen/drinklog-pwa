import os
import secrets

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./admin_test.db")
ADMIN_MASTER_PASSWORD = os.getenv("ADMIN_MASTER_PASSWORD", "")
DEBUG = os.getenv("DEBUG", "false").lower() in ("1", "true")

ADMIN_JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", secrets.token_hex(32))
ADMIN_TOKEN_EXPIRE_MINUTES = int(os.getenv("ADMIN_TOKEN_EXPIRE_MINUTES", "60"))
