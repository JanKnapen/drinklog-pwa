import pytest
from routers.parsers import parse_ml_from_text, parse_abv_from_text, parse_caffeine_mg_from_text


@pytest.mark.parametrize("text,expected", [
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
def test_parse_ml_from_text(text, expected):
    assert parse_ml_from_text(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("5.0% vol", 5.0),
    ("alc. 4,5% vol.", 4.5),
    ("Alcohol: 12% alc/vol", 12.0),
    ("7.2% ABV", 7.2),
    ("bevat 0.5% alcohol", 0.5),
    (None, None),
    ("geen alcohol", None),
])
def test_parse_abv_from_text(text, expected):
    assert parse_abv_from_text(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("cafeïne 80 mg/100 ml", 80.0),
    ("cafeïne 80 mg per 100ml", 80.0),
    ("caffeine 32mg/100ml", 32.0),
    ("koffein 30 mg/100 ml", 30.0),
    ("caféine 80mg/100ml", 80.0),
    (None, None),
    ("geen cafeïne", None),
])
def test_parse_caffeine_per_100ml(text, expected):
    assert parse_caffeine_mg_from_text(text) == expected
