import jwt
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def user_key(request: Request) -> str:
    """Rate limit key derived from the authenticated user; falls back to IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from auth import decode_access_token
            payload = decode_access_token(auth[7:])
            return f"user:{payload['sub']}"
        except (jwt.PyJWTError, KeyError):
            pass
    return get_remote_address(request)
