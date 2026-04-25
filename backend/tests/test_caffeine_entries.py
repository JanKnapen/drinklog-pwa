from datetime import datetime, timezone, timedelta


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ts(hours_ago: int):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


def _confirm_all(client):
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/caffeine-entries/confirm-all", json={"cutoff": cutoff})


# --- Basic CRUD ---

def test_list_caffeine_entries_empty(client):
    assert client.get("/api/caffeine-entries").json() == []


def test_create_caffeine_entry(client):
    r = client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _now()})
    assert r.status_code == 201
    d = r.json()
    assert d["mg"] == 80
    assert d["is_marked"] is False
    assert abs(d["caffeine_units"] - 1.0) < 0.001


def test_caffeine_entries_sorted_newest_first(client):
    client.post("/api/caffeine-entries", json={"custom_name": "A", "mg": 80, "timestamp": _ts(2)})
    client.post("/api/caffeine-entries", json={"custom_name": "B", "mg": 80, "timestamp": _now()})
    entries = client.get("/api/caffeine-entries").json()
    assert entries[0]["custom_name"] == "B"
    assert entries[1]["custom_name"] == "A"


# --- Pagination tests ---

def test_caffeine_list_default_backward_compat(client):
    """Default call returns all entries, newest-first."""
    client.post("/api/caffeine-entries", json={"custom_name": "Old", "mg": 80, "timestamp": _ts(2)})
    client.post("/api/caffeine-entries", json={"custom_name": "New", "mg": 80, "timestamp": _now()})
    entries = client.get("/api/caffeine-entries").json()
    assert len(entries) == 2
    assert entries[0]["custom_name"] == "New"
    assert entries[1]["custom_name"] == "Old"


def test_caffeine_unconfirmed_always_returned_regardless_of_limit(client):
    """With limit=1, all unconfirmed entries still appear alongside 1 confirmed."""
    for h in [10, 8, 6]:
        client.post("/api/caffeine-entries", json={"custom_name": f"conf-{h}h", "mg": 80, "timestamp": _ts(h)})
    _confirm_all(client)

    client.post("/api/caffeine-entries", json={"custom_name": "pending-1h", "mg": 80, "timestamp": _ts(1)})
    client.post("/api/caffeine-entries", json={"custom_name": "pending-30m", "mg": 80, "timestamp": _ts(0)})

    entries = client.get("/api/caffeine-entries?limit=1").json()
    names = [e["custom_name"] for e in entries]
    assert "pending-1h" in names
    assert "pending-30m" in names
    confirmed_entries = [e for e in entries if e["is_marked"]]
    assert len(confirmed_entries) == 1
    # After confirm-all, custom_name is cleared and template is set; check template name
    assert confirmed_entries[0]["template"]["name"] == "conf-6h"


def test_caffeine_default_mode_confirmed_capped_by_limit(client):
    """confirmed entries capped to limit; unconfirmed always included."""
    for h in range(5, 0, -1):
        client.post("/api/caffeine-entries", json={"custom_name": f"conf-{h}h", "mg": 80, "timestamp": _ts(h)})
    _confirm_all(client)
    client.post("/api/caffeine-entries", json={"custom_name": "pending", "mg": 80, "timestamp": _now()})

    entries = client.get("/api/caffeine-entries?limit=3").json()
    confirmed = [e for e in entries if e["is_marked"]]
    unconfirmed = [e for e in entries if not e["is_marked"]]
    assert len(confirmed) == 3
    assert len(unconfirmed) == 1
    assert unconfirmed[0]["custom_name"] == "pending"


def test_caffeine_confirmed_only_paginates(client):
    """confirmed_only=true with offset paginates correctly."""
    for h in range(5, 0, -1):
        client.post("/api/caffeine-entries", json={"custom_name": f"conf-{h}h", "mg": 80, "timestamp": _ts(h)})
    _confirm_all(client)
    # unconfirmed — must not appear
    client.post("/api/caffeine-entries", json={"custom_name": "pending", "mg": 80, "timestamp": _now()})

    page1 = client.get("/api/caffeine-entries?confirmed_only=true&limit=2&offset=0").json()
    page2 = client.get("/api/caffeine-entries?confirmed_only=true&limit=2&offset=2").json()
    page3 = client.get("/api/caffeine-entries?confirmed_only=true&limit=2&offset=4").json()

    assert len(page1) == 2
    assert len(page2) == 2
    assert len(page3) == 1

    for entry in page1 + page2 + page3:
        assert entry["is_marked"] is True
        assert entry["custom_name"] != "pending"

    all_ids = [e["id"] for e in page1 + page2 + page3]
    assert len(all_ids) == len(set(all_ids)) == 5


def test_caffeine_confirmed_only_excludes_unconfirmed(client):
    """confirmed_only=true never returns unconfirmed entries."""
    client.post("/api/caffeine-entries", json={"custom_name": "pending", "mg": 80, "timestamp": _now()})
    entries = client.get("/api/caffeine-entries?confirmed_only=true").json()
    assert entries == []


def test_caffeine_confirmed_only_offset_counts_only_confirmed_rows(client):
    """offset in confirmed_only mode counts only confirmed rows."""
    for h in range(3, 0, -1):
        client.post("/api/caffeine-entries", json={"custom_name": f"conf-{h}h", "mg": 80, "timestamp": _ts(h)})
    _confirm_all(client)
    client.post("/api/caffeine-entries", json={"custom_name": "pending", "mg": 80, "timestamp": _now()})

    result = client.get("/api/caffeine-entries?confirmed_only=true&limit=10&offset=1").json()
    assert len(result) == 2
    for e in result:
        assert e["is_marked"] is True
