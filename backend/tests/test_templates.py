def test_list_templates_empty(client):
    r = client.get("/api/templates")
    assert r.status_code == 200
    assert r.json() == []


def test_create_template(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Lager"
    assert d["default_ml"] == 330.0
    assert d["default_abv"] == 5.0
    assert d["usage_count"] == 0
    assert d["entry_count"] == 0
    assert d["confirmed_entry_count"] == 0
    assert "id" in d


def test_create_template_duplicate_name_returns_409(client):
    client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 500, "default_abv": 4.0})
    assert r.status_code == 409


def test_update_template_name(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    r2 = client.put(f"/api/templates/{tid}", json={"name": "Craft Lager"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "Craft Lager"
    assert r2.json()["default_ml"] == 330.0  # unchanged


def test_update_template_duplicate_name_returns_409(client):
    client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    r2 = client.post("/api/templates", json={"name": "Wine", "default_ml": 150, "default_abv": 13.0})
    tid = r2.json()["id"]
    r = client.put(f"/api/templates/{tid}", json={"name": "Lager"})
    assert r.status_code == 409


def test_delete_template_no_entries(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    assert client.delete(f"/api/templates/{tid}").status_code == 204
    assert client.get("/api/templates").json() == []


def test_delete_template_with_entries_returns_409(client):
    from datetime import datetime, timezone
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    client.post("/api/entries", json={
        "template_id": tid, "ml": 330, "abv": 5.0,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    assert client.delete(f"/api/templates/{tid}").status_code == 409


def test_update_ml_abv_locked_when_confirmed_entries(client):
    from datetime import datetime, timezone, timedelta
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client.post("/api/entries", json={"template_id": tid, "ml": 330, "abv": 5.0, "timestamp": yesterday})
    today_midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": today_midnight})
    r2 = client.put(f"/api/templates/{tid}", json={"default_ml": 500.0})
    assert r2.status_code == 200
    assert r2.json()["default_ml"] == 330.0  # unchanged — locked
