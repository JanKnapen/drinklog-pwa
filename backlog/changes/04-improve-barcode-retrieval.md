# Change Plan: Improved Barcode Retrieval (NL Focus & A/B/C Testing)

## Context
The current barcode retrieval system relies solely on Open Food Facts (OFF). Testing in the Netherlands has shown that OFF data is often incomplete (missing volume, ABV, or caffeine content). The goal of this change is to implement three different retrieval strategies that can be toggled in the frontend during a "dev-testing" phase. This will allow the user to compare data quality and latency across sources to determine the best production path.

## Strategies to Test

### Strategy 1: "OFF+" (Improved Open Food Facts)
- **Goal:** Fix parsing gaps in the existing implementation.
- **Improvements:**
  - Check `product.serving_size` if `product.quantity` is missing for volume.
  - Map `alcohol_100g` and `alcohol_value` as fallbacks for `alcohol`.
  - Check `caffeine`, `caffeine_100g`, and `caffeine_serving` with unit-aware normalization (e.g., handling grams vs. milligrams).

### Strategy 2: "AH" (Albert Heijn API)
- **Goal:** Use a local "Source of Truth" for the Dutch market.
- **Logic:** 
  - Query the (unofficial) Albert Heijn search API using the EAN barcode.
  - Map `unitSize` to `ml` and `alcoholPercentage` to `abv`.
  - **Note:** Caffeine is rarely a structured field in AH; it will primarily test volume/ABV accuracy.

### Strategy 3: "Hybrid" (Smart Waterfall + Regex)
- **Goal:** Maximum data recovery using multiple sources and "fuzzy" text parsing.
- **Logic:**
  - **Waterfall:** Query AH first (best for volume/ABV), then OFF (best for caffeine).
  - **Regex Parser:** If caffeine/ABV is still missing, parse the `ingredients_text` or `description` from both sources for patterns like:
    - `(\d+(\.\d+)?)\s*%\s*(vol|alc)`
    - `(\d+)\s*mg\s*/\s*100\s*ml`
    - `"cafeïne"` / `"koffein"` matches.

---

## Backend Requirements

### 1. Latency Measurement
- Wrap the retrieval logic in `time.perf_counter()`.
- Return `latency_ms` in the API response.
- Return `strategy_used` and `actual_source` (e.g., "ah", "off", "regex") in the response.

### 2. API Endpoint Update
- Update `GET /api/barcode/{code}` to accept a `strategy: int` (1, 2, or 3) query parameter.
- Default to `1` if not provided.

### 3. Modular Parsers
- Create `backend/routers/parsers.py` to house the regex logic for extracting data from raw strings.

---

## Frontend Requirements

### 1. Strategy Persistence
- Add `barcodeStrategy: 1 | 2 | 3` to `SettingsContext` (defaults to `1`).
- Persist to `localStorage`.

### 2. Strategy Switcher
- Add a UI toggle in `HomeTab` (e.g., a pill-button group) visible near the barcode scanner icon.
- This allows the user to switch strategies instantly before/during testing.

### 3. Dev Info Badge
- In `NewAlcoholModal` and `NewCaffeineModal`, if the data was prefilled via barcode, show a "Dev Info" section:
  - `Strategy: [Name] | Source: [Source] | Latency: [X]ms`

---

## Success Criteria
1. The user can switch between strategies in the UI.
2. Strategy 1 (OFF+) correctly identifies volume from `serving_size`.
3. Strategy 2 (AH) provides high-accuracy ABV for Dutch products.
4. Strategy 3 (Hybrid) successfully extracts caffeine/ABV from ingredient text when structured data is missing.
5. Latency is tracked and displayed for comparison.
