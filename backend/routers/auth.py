import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
import jwt
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from models import User, RefreshToken
from auth import verify_password, create_access_token, create_refresh_token, decode_access_token, decode_refresh_token
from schemas import LoginRequest, TokenResponse
from config import REFRESH_TOKEN_EXPIRE_DAYS
from routers.deps import get_current_user

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()

_LOCKOUT_WINDOW = 15 * 60
_MAX_FAILURES = 10
_LOCKOUT_DURATION = 15 * 60

_failures: dict[str, list[float]] = defaultdict(list)
_failures_lock = Lock()


def _check_lockout(ip: str) -> None:
    now = time.time()
    with _failures_lock:
        _failures[ip] = [t for t in _failures[ip] if now - t < _LOCKOUT_WINDOW]
        if len(_failures[ip]) >= _MAX_FAILURES:
            raise HTTPException(
                status_code=423,
                detail="Too many failed login attempts. Try again later.",
                headers={"Retry-After": str(_LOCKOUT_DURATION)},
            )


def _record_failure(ip: str) -> None:
    with _failures_lock:
        _failures[ip].append(time.time())


def _clear_failures(ip: str) -> None:
    with _failures_lock:
        _failures.pop(ip, None)


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.set_cookie(
        key="refresh_token",
        value="",
        httponly=True,
        samesite="strict",
        secure=True,
        max_age=0,
    )


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    ip = get_remote_address(request)
    _check_lockout(ip)
    user = db.query(User).filter(User.username == data.username).first()
    if not user or not verify_password(data.password, user.hashed_password):
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _clear_failures(ip)
    access_token = create_access_token({"sub": user.username})
    refresh_token, jti, expires_at = create_refresh_token({"sub": user.username})
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at.replace(tzinfo=None)))
    db.commit()
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, username=user.username)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_refresh_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        username = payload.get("sub")
        jti = payload.get("jti")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Legacy tokens issued before rotation was introduced have no jti — force re-login
    if not jti:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    db_token = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if not db_token:
        # Reuse detected — invalidate all refresh tokens for this user
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete()
        db.commit()
        raise HTTPException(status_code=401, detail="Not authenticated")

    db.delete(db_token)
    db.commit()

    access_token = create_access_token({"sub": user.username})
    new_refresh_token, new_jti, new_expires = create_refresh_token({"sub": user.username})

    db.add(RefreshToken(jti=new_jti, user_id=user.id, expires_at=new_expires.replace(tzinfo=None)))
    db.commit()

    _set_refresh_cookie(response, new_refresh_token)
    return TokenResponse(access_token=access_token, username=user.username)


@router.post("/auth/logout")
async def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if token:
        try:
            payload = decode_refresh_token(token)
            jti = payload.get("jti")
            if jti:
                db.query(RefreshToken).filter(RefreshToken.jti == jti).delete()
                db.commit()
        except jwt.PyJWTError:
            pass

    _clear_refresh_cookie(response)
    return {"message": "logged out"}


@router.get("/auth/me")
async def me(user: User = Depends(get_current_user)):
    return {"username": user.username}
