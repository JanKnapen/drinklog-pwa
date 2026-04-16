from datetime import datetime, timezone, timedelta


def _now():
    return datetime.now(timezone.utc).isoformat()


def test_list_entries_empty(client):
    assert client.get("/api/entries").json() == []


def test_create_enter_ml_entry(client):
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    assert r.status_code == 201
    d = r.json()
    assert d["template_id"] is None
    assert d["custom_name"] is None
    assert d["is_marked"] is False
    assert abs(d["standard_units"] - 1.1) < 0.001


def test_create_new_entry_with_custom_name(client):
    r = client.post("/api/entries", json={
        "custom_name": "Craft IPA", "ml": 440, "abv": 6.5, "timestamp": _now()
    })
    assert r.status_code == 201
    d = r.json()
    assert d["custom_name"] == "Craft IPA"
    assert d["template_id"] is None
    assert d["template"] is None


def test_create_entry_linked_to_template(client):
    t = client.post("/api/templates", json={
        "name": "Lager", "default_ml": 330, "default_abv": 5.0
    }).json()
    r = client.post("/api/entries", json={
        "template_id": t["id"], "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    assert r.status_code == 201
    d = r.json()
    assert d["template_id"] == t["id"]
    assert d["template"]["name"] == "Lager"


def test_entries_sorted_newest_first(client):
    older = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    newer = datetime.now(timezone.utc).isoformat()
    client.post("/api/entries", json={"custom_name": "A", "ml": 100, "abv": 5.0, "timestamp": older})
    client.post("/api/entries", json={"custom_name": "B", "ml": 100, "abv": 5.0, "timestamp": newer})
    entries = client.get("/api/entries").json()
    assert entries[0]["custom_name"] == "B"
    assert entries[1]["custom_name"] == "A"


def test_update_entry_custom_name_and_ml(client):
    r = client.post("/api/entries", json={
        "custom_name": "Beer", "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    eid = r.json()["id"]
    r2 = client.put(f"/api/entries/{eid}", json={"custom_name": "Craft Beer", "ml": 440})
    assert r2.status_code == 200
    assert r2.json()["custom_name"] == "Craft Beer"
    assert r2.json()["ml"] == 440.0


def test_update_template_linked_entry_returns_400(client):
    t = client.post("/api/templates", json={
        "name": "Lager", "default_ml": 330, "default_abv": 5.0
    }).json()
    r = client.post("/api/entries", json={
        "template_id": t["id"], "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    eid = r.json()["id"]
    r2 = client.put(f"/api/entries/{eid}", json={"ml": 500})
    assert r2.status_code == 400


def test_delete_unconfirmed_entry(client):
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    eid = r.json()["id"]
    assert client.delete(f"/api/entries/{eid}").status_code == 204
    assert client.get("/api/entries").json() == []


def test_delete_confirmed_entry_returns_400(client):
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": yesterday})
    eid = r.json()["id"]
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})
    assert client.delete(f"/api/entries/{eid}").status_code == 400
