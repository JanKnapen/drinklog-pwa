from datetime import datetime, timezone, timedelta


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ts(hours_ago: int = 0, days_ago: int = 0):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago, days=days_ago)).isoformat()


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


# --- Summary endpoint tests ---

def test_caffeine_summary_empty(client):
    """No confirmed entries → empty list."""
    r = client.get("/api/caffeine-entries/summary")
    assert r.status_code == 200
    assert r.json() == []


def test_caffeine_summary_excludes_unconfirmed(client):
    """Unconfirmed entries are not included in the summary."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _now()})
    r = client.get("/api/caffeine-entries/summary")
    assert r.json() == []


def test_caffeine_summary_daily_total_calculation(client):
    """Two entries on the same day are summed; caffeine_units = mg / 80."""
    # 80mg → 1.0 unit; 160mg → 2.0 units → total 3.0
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _now()})
    client.post("/api/caffeine-entries", json={"mg": 160, "timestamp": _now()})
    _confirm_all(client)

    r = client.get("/api/caffeine-entries/summary")
    data = r.json()
    assert len(data) == 1
    assert abs(data[0]["total"] - 3.0) < 0.0001


def test_caffeine_summary_groups_by_date(client):
    """Entries on different days produce separate rows sorted ascending."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=2)})
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=1)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary").json()
    assert len(data) == 2
    assert data[0]["date"] < data[1]["date"]


def test_caffeine_summary_period_week(client):
    """Period=week excludes entries older than 7 days."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=10)})
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=2)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary?period=week").json()
    assert len(data) == 1


def test_caffeine_summary_period_all(client):
    """Period=all returns all confirmed entries."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=400)})
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=2)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary?period=all").json()
    assert len(data) == 2


def test_caffeine_summary_period_month(client):
    """Period=month includes last 30 days, excludes older."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=40)})
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=15)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary?period=month").json()
    assert len(data) == 1


def test_caffeine_summary_period_year(client):
    """Period=year includes last 365 days, excludes older."""
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=400)})
    client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=100)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary?period=year").json()
    assert len(data) == 1


def test_caffeine_summary_sorted_ascending(client):
    """Summary rows are sorted by date ascending (chart-ready)."""
    for d in [5, 3, 1]:
        client.post("/api/caffeine-entries", json={"mg": 80, "timestamp": _ts(days_ago=d)})
    _confirm_all(client)

    data = client.get("/api/caffeine-entries/summary").json()
    dates = [row["date"] for row in data]
    assert dates == sorted(dates)
