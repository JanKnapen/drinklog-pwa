MASTER_PASSWORD = "testmaster123"


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
        json={"username": "alice", "password": "password123"},
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
    client.post("/api/admin/users", json={"username": "alice", "password": "pw"}, headers=_auth(token))
    resp = client.post("/api/admin/users", json={"username": "alice", "password": "pw2"}, headers=_auth(token))
    assert resp.status_code == 409


def test_create_user_requires_auth(client):
    resp = client.post("/api/admin/users", json={"username": "bob", "password": "pw"})
    assert resp.status_code == 401


def test_change_password(client):
    token = _login(client)
    client.post("/api/admin/users", json={"username": "bob", "password": "oldpass"}, headers=_auth(token))
    user_id = client.get("/api/admin/users", headers=_auth(token)).json()[0]["id"]
    resp = client.patch(
        f"/api/admin/users/{user_id}/password",
        json={"new_password": "newpass"},
        headers=_auth(token),
    )
    assert resp.status_code == 200


def test_change_password_not_found(client):
    token = _login(client)
    resp = client.patch(
        "/api/admin/users/9999/password",
        json={"new_password": "newpass"},
        headers=_auth(token),
    )
    assert resp.status_code == 404


def test_delete_user(client):
    token = _login(client)
    client.post("/api/admin/users", json={"username": "carol", "password": "pw"}, headers=_auth(token))
    user_id = client.get("/api/admin/users", headers=_auth(token)).json()[0]["id"]
    resp = client.delete(f"/api/admin/users/{user_id}", headers=_auth(token))
    assert resp.status_code == 200
    users = client.get("/api/admin/users", headers=_auth(token)).json()
    assert users == []


def test_delete_user_not_found(client):
    token = _login(client)
    resp = client.delete("/api/admin/users/9999", headers=_auth(token))
    assert resp.status_code == 404
