from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db
from auth import create_admin_token, hash_password
from routers.deps import get_admin_user
from config import ADMIN_MASTER_PASSWORD
from shared.models import User, DrinkEntry, DrinkTemplate, CaffeineEntry, CaffeineTemplate

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


class LoginRequest(BaseModel):
    password: str


class CreateUserRequest(BaseModel):
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("Password must be at least 16 characters")
        return v


class ChangePasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 16:
            raise ValueError("Password must be at least 16 characters")
        return v


@router.post("/admin/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest):
    if body.password != ADMIN_MASTER_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"access_token": create_admin_token()}


@router.get("/admin/users")
def list_users(db: Session = Depends(get_db), _: None = Depends(get_admin_user)):
    users = db.query(User).all()
    result = []
    for user in users:
        alcohol_count = db.query(DrinkEntry).filter(DrinkEntry.user_id == user.id).count()
        caffeine_count = db.query(CaffeineEntry).filter(CaffeineEntry.user_id == user.id).count()
        result.append({
            "id": user.id,
            "username": user.username,
            "alcohol_entries": alcohol_count,
            "caffeine_entries": caffeine_count,
        })
    return result


@router.post("/admin/users")
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    user = User(username=body.username, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username}


@router.patch("/admin/users/{user_id}/password")
def update_password(
    user_id: int,
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "updated"}


@router.delete("/admin/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(get_admin_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Explicit cascade — delete child rows before the user row
    db.query(DrinkEntry).filter(DrinkEntry.user_id == user_id).delete()
    db.query(CaffeineEntry).filter(CaffeineEntry.user_id == user_id).delete()
    db.query(DrinkTemplate).filter(DrinkTemplate.user_id == user_id).delete()
    db.query(CaffeineTemplate).filter(CaffeineTemplate.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"message": "deleted"}
