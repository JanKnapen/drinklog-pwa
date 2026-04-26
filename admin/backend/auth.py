import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from config import ADMIN_JWT_SECRET, ADMIN_TOKEN_EXPIRE_MINUTES


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_admin_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ADMIN_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"exp": expire, "type": "admin"}, ADMIN_JWT_SECRET, algorithm="HS256")


def decode_admin_token(token: str) -> dict:
    return jwt.decode(token, ADMIN_JWT_SECRET, algorithms=["HS256"])
