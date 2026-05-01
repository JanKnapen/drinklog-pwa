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
