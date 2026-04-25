import re
from typing import Optional


def parse_ml_from_text(text: str | None) -> Optional[float]:
    """Parse volume in milliliters from text.

    Handles: "330 ml", "33 cl", "0.5 l", "0,5 l", "1 L", "500 ML"
    Returns float (ml) or None if no match found.
    """
    if not text:
        return None
    q = text.lower().replace(",", ".").strip()
    m = re.search(r"([\d.]+)\s*(cl|ml|l\b)", q)
    if not m:
        return None
    value, unit = float(m.group(1)), m.group(2)
    if unit == "cl":
        return value * 10
    if unit == "l":
        return value * 1000
    return value


def parse_abv_from_text(text: str | None) -> Optional[float]:
    """Parse alcohol by volume percentage from text.

    Handles patterns like:
    - "5.0% vol"
    - "alc. 4,5% vol."
    - "Alcohol: 12% alc/vol"
    - "7.2% ABV"
    - "bevat 0.5% alcohol"

    Returns float (percentage) or None if no match found.
    """
    if not text:
        return None
    q = text.lower().replace(",", ".").strip()

    # Pattern 1: number followed by % and alcohol-related word
    # Matches: "5.0% vol", "4.5% abv", "12% alc/vol"
    m = re.search(r"([\d.]+)\s*%\s*(?:vol|abv|alc)", q)
    if m:
        return float(m.group(1))

    # Pattern 2: alcohol word followed by number and %
    # Matches: "bevat 0.5% alcohol", "Alcohol: 12%"
    m = re.search(r"(?:alcohol|alc\.?)\s*:?\s*([\d.]+)\s*%", q)
    if m:
        return float(m.group(1))

    return None


def parse_caffeine_mg_from_text(text: str | None) -> Optional[float]:
    """Parse caffeine content in mg per 100ml from text.

    Handles patterns like:
    - "cafeïne 80 mg/100 ml"
    - "cafeïne 80 mg per 100ml"
    - "caffeine 32mg/100ml"
    - "koffein 30 mg/100 ml"
    - "caféine 80mg/100ml"

    Returns float (mg per 100ml) or None if no match found.
    """
    if not text:
        return None
    q = text.lower().replace(",", ".").strip()

    # Pattern: Match various caffeine spellings (cafeïne, caféine, caffeine, koffein)
    # followed by digits, "mg", optional spacing/slashes, and "100 ml" or "per 100ml"
    # With variations like: "80 mg/100 ml", "80 mg per 100ml", "80mg/100ml"
    m = re.search(r"(?:cafeïne|caféine|caffeine|koffein)\s+([\d.]+)\s*mg\s*(?:per\s*)?/?100\s*ml", q)
    if m:
        return float(m.group(1))

    return None
