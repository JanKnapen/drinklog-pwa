from fastapi import APIRouter, Depends, HTTPException, Request, Response, Header
from sqlalchemy.orm import Session
from jose import JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import User
from auth import pwd_context, create_access_token, create_refresh_token, decode_access_token, decode_refresh_token
from schemas import LoginRequest, TokenResponse
from config import REFRESH_TOKEN_EXPIRE_DAYS

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": user.username})
    refresh_token = create_refresh_token({"sub": user.username})

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )

    return TokenResponse(access_token=access_token, username=user.username)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_refresh_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    access_token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=access_token, username=user.username)


@router.post("/auth/logout")
async def logout(response: Response):
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=0,
    )
    return {"message": "logged out"}


async def get_current_user_from_header(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    try:
        payload = decode_access_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/auth/me")
async def me(user: User = Depends(get_current_user_from_header)):
    return {"username": user.username}
