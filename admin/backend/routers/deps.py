import jwt
from fastapi import HTTPException, Header
from auth import decode_admin_token


async def get_admin_user(authorization: str = Header(None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    try:
        payload = decode_admin_token(token)
        if payload.get("type") != "admin":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
