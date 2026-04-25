from datetime import datetime, timezone, timedelta


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ts(days_ago: int = 0, hours_ago: int = 0):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)).isoformat()


def _confirm_all(client):
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})


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


# --- Pagination tests ---

def _make_confirmed_entry(client, hours_ago: int):
    """Create an entry timestamped hours_ago hours in the past and confirm it."""
    ts = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": ts})
    eid = r.json()["id"]
    # confirm by calling confirm-all with a cutoff after the entry
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})
    return eid


def test_list_entries_default_backward_compat(client):
    """Default call returns all entries (unconfirmed + up to 100 confirmed), newest-first."""
    ts1 = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    ts2 = datetime.now(timezone.utc).isoformat()
    client.post("/api/entries", json={"custom_name": "Old", "ml": 100, "abv": 5.0, "timestamp": ts1})
    client.post("/api/entries", json={"custom_name": "New", "ml": 100, "abv": 5.0, "timestamp": ts2})
    entries = client.get("/api/entries").json()
    assert len(entries) == 2
    assert entries[0]["custom_name"] == "New"
    assert entries[1]["custom_name"] == "Old"


def test_unconfirmed_always_returned_regardless_of_limit(client):
    """With limit=1, all unconfirmed entries still appear alongside 1 confirmed."""
    # Create 3 confirmed entries spread out in time
    for h in [10, 8, 6]:
        ts = (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()
        client.post("/api/entries", json={"custom_name": f"confirmed-{h}", "ml": 100, "abv": 5.0, "timestamp": ts})
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})

    # Create 2 unconfirmed entries
    ts_u1 = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    ts_u2 = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    client.post("/api/entries", json={"custom_name": "unconfirmed-1h", "ml": 100, "abv": 5.0, "timestamp": ts_u1})
    client.post("/api/entries", json={"custom_name": "unconfirmed-30m", "ml": 100, "abv": 5.0, "timestamp": ts_u2})

    entries = client.get("/api/entries?limit=1").json()
    names = [e["custom_name"] for e in entries]
    # Both unconfirmed must appear
    assert "unconfirmed-1h" in names
    assert "unconfirmed-30m" in names
    # Only 1 confirmed (the most recent one) should appear
    confirmed_entries = [e for e in entries if e["is_marked"]]
    assert len(confirmed_entries) == 1
    # After confirm-all, custom_name is cleared and template is set; check template name
    assert confirmed_entries[0]["template"]["name"] == "confirmed-6"


def test_default_mode_confirmed_capped_by_limit(client):
    """Without confirmed_only, confirmed entries are capped to limit; unconfirmed always included."""
    # Create 5 confirmed entries
    for h in range(5, 0, -1):
        ts = (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()
        client.post("/api/entries", json={"custom_name": f"conf-{h}h", "ml": 100, "abv": 5.0, "timestamp": ts})
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})

    # 1 unconfirmed
    client.post("/api/entries", json={"custom_name": "pending", "ml": 100, "abv": 5.0, "timestamp": _now()})

    entries = client.get("/api/entries?limit=3").json()
    confirmed = [e for e in entries if e["is_marked"]]
    unconfirmed = [e for e in entries if not e["is_marked"]]
    assert len(confirmed) == 3
    assert len(unconfirmed) == 1
    assert unconfirmed[0]["custom_name"] == "pending"


def test_confirmed_only_paginates(client):
    """confirmed_only=true with offset paginates correctly."""
    # Create 5 confirmed entries with distinct timestamps
    for h in range(5, 0, -1):
        ts = (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()
        client.post("/api/entries", json={"custom_name": f"conf-{h}h", "ml": 100, "abv": 5.0, "timestamp": ts})
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})

    # Also add an unconfirmed entry — should not appear in confirmed_only mode
    client.post("/api/entries", json={"custom_name": "pending", "ml": 100, "abv": 5.0, "timestamp": _now()})

    page1 = client.get("/api/entries?confirmed_only=true&limit=2&offset=0").json()
    page2 = client.get("/api/entries?confirmed_only=true&limit=2&offset=2").json()
    page3 = client.get("/api/entries?confirmed_only=true&limit=2&offset=4").json()

    assert len(page1) == 2
    assert len(page2) == 2
    assert len(page3) == 1

    # All returned entries must be confirmed
    for entry in page1 + page2 + page3:
        assert entry["is_marked"] is True
        assert entry["custom_name"] != "pending"

    # Combined pages cover all 5 confirmed entries with no duplicates
    all_ids = [e["id"] for e in page1 + page2 + page3]
    assert len(all_ids) == len(set(all_ids)) == 5


def test_confirmed_only_excludes_unconfirmed(client):
    """confirmed_only=true never returns unconfirmed entries."""
    client.post("/api/entries", json={"custom_name": "pending", "ml": 100, "abv": 5.0, "timestamp": _now()})
    entries = client.get("/api/entries?confirmed_only=true").json()
    assert entries == []


def test_confirmed_only_offset_ignores_unconfirmed(client):
    """offset in confirmed_only mode counts only confirmed rows."""
    for h in range(3, 0, -1):
        ts = (datetime.now(timezone.utc) - timedelta(hours=h)).isoformat()
        client.post("/api/entries", json={"custom_name": f"conf-{h}h", "ml": 100, "abv": 5.0, "timestamp": ts})
    cutoff = (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})
    client.post("/api/entries", json={"custom_name": "pending", "ml": 100, "abv": 5.0, "timestamp": _now()})

    result = client.get("/api/entries?confirmed_only=true&limit=10&offset=1").json()
    assert len(result) == 2
    for e in result:
        assert e["is_marked"] is True


# --- Summary endpoint tests ---

def test_summary_empty(client):
    """No confirmed entries → empty list."""
    r = client.get("/api/entries/summary")
    assert r.status_code == 200
    assert r.json() == []


def test_summary_excludes_unconfirmed(client):
    """Unconfirmed entries are not included in the summary."""
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    r = client.get("/api/entries/summary")
    assert r.status_code == 200
    assert r.json() == []


def test_summary_daily_total_calculation(client):
    """Two entries on the same day are summed; standard_units = (ml * abv / 100) / 15."""
    # 330ml @ 5.0 ABV → 330*5/100/15 = 1.1 units
    # 500ml @ 6.0 ABV → 500*6/100/15 ≈ 2.0 units
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    client.post("/api/entries", json={"ml": 500, "abv": 6.0, "timestamp": _now()})
    _confirm_all(client)

    r = client.get("/api/entries/summary")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    expected_total = (330 * 5.0 / 100 / 15) + (500 * 6.0 / 100 / 15)
    assert abs(data[0]["total"] - expected_total) < 0.0001


def test_summary_groups_by_date(client):
    """Entries on different days produce separate rows sorted ascending."""
    ts_old = _ts(days_ago=2)
    ts_new = _ts(days_ago=1)
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": ts_old})
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": ts_new})
    _confirm_all(client)

    r = client.get("/api/entries/summary")
    data = r.json()
    assert len(data) == 2
    # Sorted ascending: older date first
    assert data[0]["date"] < data[1]["date"]


def test_summary_period_week_excludes_old_entries(client):
    """Period=week excludes entries older than 7 days."""
    old_ts = _ts(days_ago=10)
    recent_ts = _ts(days_ago=2)
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": old_ts})
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": recent_ts})
    _confirm_all(client)

    r = client.get("/api/entries/summary?period=week")
    data = r.json()
    assert len(data) == 1
    assert data[0]["date"] == recent_ts[:10]


def test_summary_period_all_includes_all(client):
    """Period=all returns all confirmed entries regardless of age."""
    old_ts = _ts(days_ago=400)
    recent_ts = _ts(days_ago=2)
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": old_ts})
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": recent_ts})
    _confirm_all(client)

    r = client.get("/api/entries/summary?period=all")
    data = r.json()
    assert len(data) == 2


def test_summary_period_month(client):
    """Period=month includes last 30 days, excludes older."""
    old_ts = _ts(days_ago=40)
    recent_ts = _ts(days_ago=15)
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": old_ts})
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": recent_ts})
    _confirm_all(client)

    r = client.get("/api/entries/summary?period=month")
    data = r.json()
    assert len(data) == 1


def test_summary_period_year(client):
    """Period=year includes last 365 days, excludes older."""
    old_ts = _ts(days_ago=400)
    recent_ts = _ts(days_ago=100)
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": old_ts})
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": recent_ts})
    _confirm_all(client)

    r = client.get("/api/entries/summary?period=year")
    data = r.json()
    assert len(data) == 1


def test_summary_sorted_ascending(client):
    """Summary rows are sorted by date ascending (chart-ready)."""
    for d in [5, 3, 1]:
        client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _ts(days_ago=d)})
    _confirm_all(client)

    data = client.get("/api/entries/summary").json()
    dates = [row["date"] for row in data]
    assert dates == sorted(dates)
