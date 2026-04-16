from datetime import datetime, timezone, timedelta


def _yesterday():
    return (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def _today_midnight():
    return datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()


def test_confirm_all_creates_template_for_new_entry(client):
    client.post("/api/entries", json={
        "custom_name": "Craft IPA", "ml": 440, "abv": 6.5, "timestamp": _yesterday()
    })
    r = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r.status_code == 200
    assert r.json()["confirmed"] == 1

    templates = client.get("/api/templates").json()
    assert len(templates) == 1
    assert templates[0]["name"] == "Craft IPA"
    assert templates[0]["default_ml"] == 440.0
    assert templates[0]["usage_count"] == 1

    entries = client.get("/api/entries").json()
    assert entries[0]["is_marked"] is True
    assert entries[0]["template_id"] is not None
    assert entries[0]["custom_name"] is None
    assert entries[0]["template"]["name"] == "Craft IPA"


def test_confirm_all_does_not_touch_todays_entries(client):
    now = datetime.now(timezone.utc).isoformat()
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": now})
    r = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r.json()["confirmed"] == 0
    assert client.get("/api/entries").json()[0]["is_marked"] is False


def test_confirm_all_enter_ml_confirmed_no_template_created(client):
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _yesterday()})
    client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert client.get("/api/templates").json() == []
    entries = client.get("/api/entries").json()
    assert entries[0]["is_marked"] is True
    assert entries[0]["template_id"] is None


def test_confirm_all_idempotent(client):
    client.post("/api/entries", json={
        "custom_name": "Wine", "ml": 150, "abv": 13.0, "timestamp": _yesterday()
    })
    client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    r2 = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r2.json()["confirmed"] == 0
    assert len(client.get("/api/templates").json()) == 1  # no duplicate template
