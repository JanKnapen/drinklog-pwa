import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app
from models import User
from auth import pwd_context
from routers.auth import limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset the rate limiter before each test so limits don't bleed across tests."""
    limiter.reset()
    yield


@pytest.fixture
def auth_client():
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

    # Pre-create a user for login tests
    with TestSession() as db:
        user = User(username="alice", hashed_password=pwd_context.hash("password123"))
        db.add(user)
        db.commit()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)


def _login(client: TestClient) -> dict:
    """Helper: log in as alice and return {access_token, refresh_token}."""
    resp = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 200, resp.text
    # The refresh_token cookie has secure=True so httpx won't store it in the
    # cookie jar for http://testserver. Extract it from Set-Cookie directly.
    set_cookie = resp.headers.get("set-cookie", "")
    refresh_token = None
    for part in set_cookie.split(";"):
        part = part.strip()
        if part.startswith("refresh_token="):
            refresh_token = part[len("refresh_token="):]
    return {"access_token": resp.json()["access_token"], "refresh_token": refresh_token}


def test_login_success(auth_client):
    resp = auth_client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["username"] == "alice"
    # refresh_token cookie should be set in the Set-Cookie header
    assert "refresh_token" in resp.headers.get("set-cookie", "")


def test_login_wrong_password(auth_client):
    resp = auth_client.post("/api/auth/login", json={"username": "alice", "password": "wrongpass"})
    assert resp.status_code == 401


def test_login_wrong_username(auth_client):
    resp = auth_client.post("/api/auth/login", json={"username": "nobody", "password": "password123"})
    assert resp.status_code == 401


def test_refresh_with_valid_cookie(auth_client):
    tokens = _login(auth_client)
    # Pass the refresh_token cookie explicitly (secure=True prevents auto-send over http)
    refresh_resp = auth_client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh_resp.status_code == 200
    body = refresh_resp.json()
    assert "access_token" in body
    assert body["username"] == "alice"


def test_refresh_without_cookie(auth_client):
    resp = auth_client.post("/api/auth/refresh")
    assert resp.status_code == 401


def test_logout(auth_client):
    resp = auth_client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"message": "logged out"}


def test_me_with_valid_token(auth_client):
    tokens = _login(auth_client)
    me_resp = auth_client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me_resp.status_code == 200
    assert me_resp.json() == {"username": "alice"}


def test_me_without_token(auth_client):
    resp = auth_client.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_with_invalid_token(auth_client):
    resp = auth_client.get("/api/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
    assert resp.status_code == 401


def test_protected_endpoint_requires_auth(auth_client):
    resp = auth_client.get("/api/entries")
    assert resp.status_code == 401


def test_protected_endpoint_with_valid_token(auth_client):
    tokens = _login(auth_client)
    resp = auth_client.get("/api/entries", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert resp.status_code == 200
