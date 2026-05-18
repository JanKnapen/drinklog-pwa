MASTER_PASSWORD = "testmaster123"
_PASS = "securepassword1234"   # meets 16-char minimum


def _login(client) -> str:
    resp = client.post("/api/admin/login", json={"password": MASTER_PASSWORD})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_login_success(client):
    resp = client.post("/api/admin/login", json={"password": MASTER_PASSWORD})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client):
    resp = client.post("/api/admin/login", json={"password": "wrongpassword"})
    assert resp.status_code == 401


def test_users_requires_auth(client):
    resp = client.get("/api/admin/users")
    assert resp.status_code == 401


def test_users_empty(client):
    token = _login(client)
    resp = client.get("/api/admin/users", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_user(client):
    token = _login(client)
    resp = client.post(
        "/api/admin/users",
        json={"username": "alice", "password": _PASS},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    users = client.get("/api/admin/users", headers=_auth(token)).json()
    assert len(users) == 1
    assert users[0]["username"] == "alice"
    assert users[0]["alcohol_entries"] == 0
    assert users[0]["caffeine_entries"] == 0


def test_create_user_duplicate(client):
    token = _login(client)
    client.post("/api/admin/users", json={"username": "alice", "password": _PASS}, headers=_auth(token))
    resp = client.post("/api/admin/users", json={"username": "alice", "password": _PASS}, headers=_auth(token))
    assert resp.status_code == 409


def test_create_user_requires_auth(client):
    resp = client.post("/api/admin/users", json={"username": "bob", "password": _PASS})
    assert resp.status_code == 401


def test_create_user_password_too_short(client):
    token = _login(client)
    resp = client.post("/api/admin/users", json={"username": "bob", "password": "tooshort"}, headers=_auth(token))
    assert resp.status_code == 422


def test_change_password(client):
    token = _login(client)
    client.post("/api/admin/users", json={"username": "bob", "password": _PASS}, headers=_auth(token))
    user_id = client.get("/api/admin/users", headers=_auth(token)).json()[0]["id"]
    resp = client.patch(
        f"/api/admin/users/{user_id}/password",
        json={"new_password": "newlongenoughpass"},
        headers=_auth(token),
    )
    assert resp.status_code == 200


def test_change_password_not_found(client):
    token = _login(client)
    resp = client.patch(
        "/api/admin/users/9999/password",
        json={"new_password": "newlongenoughpass"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_delete_user(client):
    token = _login(client)
    client.post("/api/admin/users", json={"username": "carol", "password": _PASS}, headers=_auth(token))
    user_id = client.get("/api/admin/users", headers=_auth(token)).json()[0]["id"]
    resp = client.delete(f"/api/admin/users/{user_id}", headers=_auth(token))
    assert resp.status_code == 200
    users = client.get("/api/admin/users", headers=_auth(token)).json()
    assert users == []


def test_delete_user_not_found(client):
    token = _login(client)
    resp = client.delete("/api/admin/users/9999", headers=_auth(token))
    assert resp.status_code == 404


def _fail(client, n):
    """Make n failed login attempts, resetting the rate limiter between each so slowapi
    doesn't fire before the lockout handler can record failures."""
    from routers.admin import limiter
    for _ in range(n):
        limiter.reset()
        client.post("/api/admin/login", json={"password": "wrongpassword"})


def test_login_locked_out_after_10_failures(client):
    _fail(client, 10)
    from routers.admin import limiter
    limiter.reset()
    resp = client.post("/api/admin/login", json={"password": "wrongpassword"})
    assert resp.status_code == 423
    assert "Retry-After" in resp.headers


def test_login_lockout_cleared_on_success(client):
    _fail(client, 9)
    from routers.admin import limiter
    limiter.reset()
    resp = client.post("/api/admin/login", json={"password": MASTER_PASSWORD})
    assert resp.status_code == 200
    resp = client.post("/api/admin/login", json={"password": "wrongpassword"})
    assert resp.status_code == 401


def test_login_lockout_does_not_block_correct_password_before_threshold(client):
    _fail(client, 9)
    from routers.admin import limiter
    limiter.reset()
    resp = client.post("/api/admin/login", json={"password": MASTER_PASSWORD})
    assert resp.status_code == 200


# --- Template editing ----------------------------------------------------

import uuid as _uuid
from datetime import datetime as _dt

from shared.models import (
    User as _User,
    DrinkTemplate as _DrinkTemplate,
    DrinkEntry as _DrinkEntry,
    CaffeineTemplate as _CaffeineTemplate,
    CaffeineEntry as _CaffeineEntry,
)
from database import get_db as _get_db
from main import app as _app


def _seed_alcohol_template(client, *, with_confirmed_entry: bool = False) -> tuple[int, str]:
    db = next(_app.dependency_overrides[_get_db]())
    user = _User(username="seeded", hashed_password="x")
    db.add(user); db.commit(); db.refresh(user)
    tpl = _DrinkTemplate(
        id=str(_uuid.uuid4()), name="Heineken",
        default_ml=330, default_abv=5.0, usage_count=0, user_id=user.id,
    )
    db.add(tpl); db.commit(); db.refresh(tpl)
    if with_confirmed_entry:
        e = _DrinkEntry(
            id=str(_uuid.uuid4()), template_id=tpl.id, ml=330, abv=5.0,
            timestamp=_dt(2024, 1, 1), is_marked=True, user_id=user.id,
        )
        db.add(e); db.commit()
    return user.id, tpl.id


def _seed_caffeine_template(client, *, with_confirmed_entry: bool = False) -> tuple[int, str]:
    db = next(_app.dependency_overrides[_get_db]())
    user = _User(username="seeded-c", hashed_password="x")
    db.add(user); db.commit(); db.refresh(user)
    tpl = _CaffeineTemplate(
        id=str(_uuid.uuid4()), name="Espresso",
        default_mg=80, usage_count=0, user_id=user.id,
    )
    db.add(tpl); db.commit(); db.refresh(tpl)
    if with_confirmed_entry:
        e = _CaffeineEntry(
            id=str(_uuid.uuid4()), template_id=tpl.id, mg=80,
            timestamp=_dt(2024, 1, 1), is_marked=True, user_id=user.id,
        )
        db.add(e); db.commit()
    return user.id, tpl.id


def test_get_user_templates_includes_counts_and_barcode(client):
    token = _login(client)
    user_id, _ = _seed_alcohol_template(client, with_confirmed_entry=True)
    resp = client.get(f"/api/admin/users/{user_id}/templates?module=alcohol", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["barcode"] is None
    assert body[0]["entry_count"] == 1
    assert body[0]["confirmed_entry_count"] == 1


def test_admin_can_edit_alcohol_template_with_confirmed_entries(client):
    """The main app blocks ml/abv edits when confirmed entries exist; admin can override."""
    token = _login(client)
    user_id, tpl_id = _seed_alcohol_template(client, with_confirmed_entry=True)
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"default_ml": 500, "default_abv": 6.5, "name": "Heineken 500ml"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["default_ml"] == 500
    assert body["default_abv"] == 6.5
    assert body["name"] == "Heineken 500ml"


def test_admin_can_edit_caffeine_template_with_confirmed_entries(client):
    token = _login(client)
    user_id, tpl_id = _seed_caffeine_template(client, with_confirmed_entry=True)
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=caffeine",
        json={"default_mg": 120},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["default_mg"] == 120


def test_update_template_requires_auth(client):
    user_id, tpl_id = _seed_alcohol_template(client)
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"default_ml": 500},
    )
    assert resp.status_code == 401


def test_update_template_user_not_found(client):
    token = _login(client)
    resp = client.patch(
        f"/api/admin/users/9999/templates/{_uuid.uuid4()}?module=alcohol",
        json={"default_ml": 500},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_update_template_template_not_found(client):
    token = _login(client)
    user_id, _ = _seed_alcohol_template(client)
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{_uuid.uuid4()}?module=alcohol",
        json={"default_ml": 500},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_update_template_rejects_duplicate_name(client):
    token = _login(client)
    user_id, tpl_id = _seed_alcohol_template(client)
    # Seed a second template
    db = next(_app.dependency_overrides[_get_db]())
    other = _DrinkTemplate(
        id=str(_uuid.uuid4()), name="Other", default_ml=330, default_abv=5.0,
        usage_count=0, user_id=user_id,
    )
    db.add(other); db.commit()
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"name": "Other"},
        headers=_auth(token),
    )
    assert resp.status_code == 409


def test_update_template_rejects_cross_module_barcode(client):
    token = _login(client)
    user_id, tpl_id = _seed_alcohol_template(client)
    # Seed a caffeine template owning the barcode
    db = next(_app.dependency_overrides[_get_db]())
    c = _CaffeineTemplate(
        id=str(_uuid.uuid4()), name="Cola", default_mg=40,
        usage_count=0, user_id=user_id, barcode="123456",
    )
    db.add(c); db.commit()
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"barcode": "123456"},
        headers=_auth(token),
    )
    assert resp.status_code == 409


def test_update_template_can_clear_barcode(client):
    token = _login(client)
    user_id, tpl_id = _seed_alcohol_template(client)
    # First set it
    client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"barcode": "8718"}, headers=_auth(token),
    )
    # Now clear it
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"barcode": None}, headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["barcode"] is None


def test_update_template_omitted_fields_unchanged(client):
    """Only fields present in the payload should change."""
    token = _login(client)
    user_id, tpl_id = _seed_alcohol_template(client)
    resp = client.patch(
        f"/api/admin/users/{user_id}/templates/{tpl_id}?module=alcohol",
        json={"default_abv": 7.0},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["default_abv"] == 7.0
    assert body["default_ml"] == 330  # unchanged
    assert body["name"] == "Heineken"  # unchanged
