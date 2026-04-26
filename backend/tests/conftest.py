import os

os.environ.setdefault("ADMIN_SEED_USERNAME", "testadmin")
os.environ.setdefault("ADMIN_SEED_PASSWORD", "testpass123")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app
from models import User
from routers.deps import get_current_user


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        db = TestSession()
        try:
            user = db.query(User).first()
            if user is None:
                from auth import hash_password
                user = User(username="testadmin", hashed_password=hash_password("testpass123"))
                db.add(user)
                db.commit()
                db.refresh(user)
            yield user
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    Base.metadata.drop_all(engine)
