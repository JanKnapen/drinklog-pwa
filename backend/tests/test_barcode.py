import pytest
from unittest.mock import AsyncMock, patch, MagicMock


def _make_off_response(name, quantity=None, alcohol=None, caffeine_100g=None, caffeine_serving=None):
    nutriments = {}
    if alcohol is not None:
        nutriments["alcohol"] = alcohol
    if caffeine_100g is not None:
        nutriments["caffeine_100g"] = caffeine_100g
    if caffeine_serving is not None:
        nutriments["caffeine_serving"] = caffeine_serving
    product = {"product_name": name, "nutriments": nutriments}
    if quantity:
        product["quantity"] = quantity
    return {"status": 1, "product": product}


def _mock_off(payload):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = payload

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)
    return mock_client


# --- _parse_ml unit tests ---

from routers.barcode import _parse_ml


@pytest.mark.parametrize("qty,expected", [
    ("330 ml", 330.0),
    ("330ml", 330.0),
    ("33 cl", 330.0),
    ("33cl", 330.0),
    ("0.5 l", 500.0),
    ("0,5 l", 500.0),
    ("1 L", 1000.0),
    ("500 ML", 500.0),
    (None, None),
    ("", None),
    ("no unit here", None),
])
def test_parse_ml(qty, expected):
    assert _parse_ml(qty) == expected


# --- barcode endpoint tests ---

def test_local_alcohol_match(client):
    r = client.post("/api/templates", json={"name": "Test Lager", "default_ml": 330, "default_abv": 5.0, "barcode": "1234567890"})
    assert r.status_code == 201

    r2 = client.get("/api/barcode/1234567890?module=alcohol")
    assert r2.status_code == 200
    d = r2.json()
    assert d["source"] == "local"
    assert d["template_id"] == r.json()["id"]
    assert d["name"] == "Test Lager"
    assert d["ml"] == 330.0
    assert d["abv"] == 5.0
    assert d["module"] == "alcohol"


def test_local_caffeine_match(client):
    r = client.post("/api/caffeine-templates", json={"name": "Espresso", "default_mg": 80.0, "barcode": "9876543210"})
    assert r.status_code == 201

    r2 = client.get("/api/barcode/9876543210?module=caffeine")
    assert r2.status_code == 200
    d = r2.json()
    assert d["source"] == "local"
    assert d["template_id"] == r.json()["id"]
    assert d["name"] == "Espresso"
    assert d["mg"] == 80.0
    assert d["module"] == "caffeine"


def test_off_alcohol_lookup(client):
    payload = _make_off_response("Heineken", quantity="330 ml", alcohol=5.0)
    mock_client = _mock_off(payload)

    with patch("routers.barcode.httpx.AsyncClient", return_value=mock_client):
        r = client.get("/api/barcode/8712100325953?module=alcohol")

    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "off"
    assert d["module"] is None
    assert d["name"] == "Heineken"
    assert d["ml"] == 330.0
    assert d["abv"] == 5.0
    assert d["mg"] is None


def test_off_caffeine_lookup_with_serving(client):
    payload = _make_off_response("Red Bull", quantity="250 ml", caffeine_serving=0.08)
    mock_client = _mock_off(payload)

    with patch("routers.barcode.httpx.AsyncClient", return_value=mock_client):
        r = client.get("/api/barcode/90162903?module=caffeine")

    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "off"
    assert d["name"] == "Red Bull"
    assert d["mg"] == pytest.approx(80.0)
    assert d["abv"] is None


def test_off_caffeine_lookup_from_100g(client):
    payload = _make_off_response("Cold Brew", quantity="250 ml", caffeine_100g=0.032)
    mock_client = _mock_off(payload)

    with patch("routers.barcode.httpx.AsyncClient", return_value=mock_client):
        r = client.get("/api/barcode/11111111?module=caffeine")

    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "off"
    assert d["mg"] == pytest.approx(80.0)  # 0.032 * 250 * 10


def test_off_missing_fields_returns_nulls(client):
    payload = _make_off_response("Mystery Beer", quantity="500 ml")
    mock_client = _mock_off(payload)

    with patch("routers.barcode.httpx.AsyncClient", return_value=mock_client):
        r = client.get("/api/barcode/00000001?module=alcohol")

    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "off"
    assert d["name"] == "Mystery Beer"
    assert d["ml"] == 500.0
    assert d["abv"] is None


def test_off_product_not_found(client):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"status": 0}

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=mock_resp)

    with patch("routers.barcode.httpx.AsyncClient", return_value=mock_client):
        r = client.get("/api/barcode/99999999?module=alcohol")

    assert r.status_code == 200
    assert r.json()["source"] == "not_found"


def test_off_network_error_returns_not_found(client):
    import httpx as _httpx
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=_httpx.ConnectTimeout("timeout"))
    with patch("routers.barcode.httpx.AsyncClient") as mock_cls:
        mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        r = client.get("/api/barcode/9999999999999?module=alcohol")
    assert r.status_code == 200
    assert r.json()["source"] == "not_found"


def test_local_match_found_regardless_of_module_param(client):
    client.post("/api/templates", json={"name": "IPA", "default_ml": 330, "default_abv": 6.5, "barcode": "CROSSLOOK"})
    r = client.get("/api/barcode/CROSSLOOK?module=caffeine")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "local"
    assert d["module"] == "alcohol"
    assert d["name"] == "IPA"


def test_local_caffeine_match_found_in_alcohol_mode(client):
    client.post("/api/caffeine-templates", json={"name": "Cold Brew", "default_mg": 200.0, "barcode": "CROSSCAF"})
    r = client.get("/api/barcode/CROSSCAF?module=alcohol")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "local"
    assert d["module"] == "caffeine"
    assert d["name"] == "Cold Brew"
    assert d["mg"] == 200.0


def test_invalid_module_rejected(client):
    r = client.get("/api/barcode/123?module=wine")
    assert r.status_code == 422


def test_same_module_barcode_must_be_unique(client):
    client.post("/api/templates", json={"name": "Beer A", "default_ml": 330, "default_abv": 5.0, "barcode": "DUPCHECK"})
    r = client.post("/api/templates", json={"name": "Beer B", "default_ml": 500, "default_abv": 4.0, "barcode": "DUPCHECK"})
    assert r.status_code == 409


def test_cross_module_barcode_rejected_on_alcohol_create(client):
    client.post("/api/caffeine-templates", json={"name": "Espresso", "default_mg": 80.0, "barcode": "CROSSMOD"})
    r = client.post("/api/templates", json={"name": "Beer", "default_ml": 330, "default_abv": 5.0, "barcode": "CROSSMOD"})
    assert r.status_code == 409
    assert "caffeine" in r.json()["detail"].lower()


def test_cross_module_barcode_rejected_on_caffeine_create(client):
    client.post("/api/templates", json={"name": "Wine", "default_ml": 150, "default_abv": 12.0, "barcode": "CROSSMOD2"})
    r = client.post("/api/caffeine-templates", json={"name": "Tea", "default_mg": 40.0, "barcode": "CROSSMOD2"})
    assert r.status_code == 409
    assert "alcohol" in r.json()["detail"].lower()


def test_cross_module_barcode_rejected_on_alcohol_update(client):
    client.post("/api/caffeine-templates", json={"name": "Matcha", "default_mg": 70.0, "barcode": "UPDATEMOD"})
    r = client.post("/api/templates", json={"name": "Cider", "default_ml": 330, "default_abv": 4.5})
    template_id = r.json()["id"]
    r2 = client.put(f"/api/templates/{template_id}", json={"barcode": "UPDATEMOD"})
    assert r2.status_code == 409


def test_cross_module_barcode_rejected_on_caffeine_update(client):
    client.post("/api/templates", json={"name": "Stout", "default_ml": 440, "default_abv": 6.0, "barcode": "UPDATEMOD2"})
    r = client.post("/api/caffeine-templates", json={"name": "Green Tea", "default_mg": 30.0})
    template_id = r.json()["id"]
    r2 = client.patch(f"/api/caffeine-templates/{template_id}", json={"barcode": "UPDATEMOD2"})
    assert r2.status_code == 409
