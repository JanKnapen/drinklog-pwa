# Archive: Barcode Retrieval Strategies (OFF+ / AH / Hybrid)

## What This Is

Git tag `archive/barcode-strategies-v1` points to the last `main` commit that contained
three switchable barcode retrieval strategies. This document explains what was there and
how to restore it if needed.

The multi-strategy code was introduced by `feat/improve-barcode-retrieval` for A/B/C
testing. OFF+ was chosen as the permanent strategy. AH and Hybrid were removed by
`chore/remove-strategy-switching`. See `05-remove-retrieval-alternatives.md` for the
original line-by-line removal guide (it documents every file and line that was touched).

---

## What Was Removed

### Backend — `backend/routers/barcode.py`

- `AH_SEARCH_URL`, `AH_HEADERS` constants
- `import logging`, `import time`, `logger`
- `_fetch_ah(client, code)` — AH API fetch
- `_extract_ah(product, module)` — AH field parser
- `_strategy_ah(code, module, client)` — Strategy 2 function
- `_strategy_hybrid(code, module, client)` — Strategy 3 function
- `latency_ms`, `strategy_used`, `actual_source` fields on `BarcodeResult`
- `'ah'` from `BarcodeResult.source` union
- `strategy: int` query param on `lookup_barcode` endpoint
- `time.perf_counter()` timing calls
- Strategy dispatch (`if strategy == 1 / elif / else`) — replaced with direct call to `_strategy_off_plus`

### Backend — `backend/tests/test_barcode.py`

- `_mock_ah()` and `_mock_hybrid()` helper functions
- `test_strategy_ah_alcohol`, `test_strategy_ah_not_found`
- `test_strategy_hybrid_ah_volume_off_caffeine`, `test_strategy_hybrid_regex_abv_fallback`
- `test_response_has_telemetry_fields`, `test_local_match_has_telemetry_fields`
- `test_strategy_out_of_range_rejected`

### Frontend — `frontend/src/contexts/SettingsContext.tsx`

- `BarcodeStrategy = 1 | 2 | 3` type
- `barcodeStrategy: BarcodeStrategy` field on `Settings` interface
- `barcodeStrategy: 1` in `DEFAULT_SETTINGS`
- `barcodeStrategy` validation in `loadSettings`

### Frontend — `frontend/src/contexts/SettingsContext.test.ts`

- `describe('barcodeStrategy', ...)` block (default/persist/fallback tests)
- `barcodeStrategy` field from all `toEqual` assertions

### Frontend — `frontend/src/api/barcode.ts`

- `latency_ms`, `strategy_used`, `actual_source` from `BarcodeResult`
- `'ah'` from `BarcodeResult.source` union
- `strategy: 1 | 2 | 3 = 1` param from `lookupBarcode()`
- `&strategy=${strategy}` from the fetch URL

### Frontend — `frontend/src/tabs/HomeTab.tsx`

- `barcodeStrategy` from settings destructure
- `isFetching` state and `setIsFetching` calls
- `handleStrategyChange` function
- `'ah'` from `handleScan` source condition
- `isFetching`, `onStrategyChange`, `barcodeStrategy` props on `NewAlcoholModal` and `NewCaffeineModal` call sites
- Same three props from both modal prop type signatures
- `StrategyPill` and dev-info badge block inside both modal bodies
- `isFetching` opacity wrapper `<div>` in both modals
- `|| !!isFetching` from Log button `disabled` condition in both modals
- `StrategyPill` component definition

---

## How to Restore Multi-Strategy Support

1. Check out `archive/barcode-strategies-v1`:
   ```bash
   git checkout archive/barcode-strategies-v1
   ```
   Or create a new branch from it:
   ```bash
   git checkout -b feat/restore-strategy-switching archive/barcode-strategies-v1
   ```

2. Cherry-pick or diff against `chore/remove-strategy-switching` to see exactly what changed:
   ```bash
   git diff archive/barcode-strategies-v1..chore/remove-strategy-switching
   ```

3. Refer to `05-remove-retrieval-alternatives.md` — it documents every line that was
   changed, with the original code shown. Reversing those changes restores the full
   three-strategy setup.

---

## AH API Details (for reference)

- **URL:** `https://api.ah.nl/mobile-services/product/search/v2`
- **Headers:** `{"X-Application": "AHWEBSHOP"}`
- **Query params:** `query=<barcode>&page=0&size=1`
- **Name field:** `product.title` or `product.description`
- **Volume field:** `product.unitSize` (parsed with `parse_ml_from_text`)
- **ABV field:** `product.alcoholPercentage`
- Caffeine is rarely available from AH.

The Hybrid strategy fetched both AH and OFF in parallel, preferring AH for volume/ABV
and OFF for caffeine, with regex fallback from `parsers.py` for missing fields.
