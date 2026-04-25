# Cleanup: Remove Unused Barcode Retrieval Strategies

## Background

Branch `feat/improve-barcode-retrieval` added three switchable barcode retrieval strategies (OFF+, AH, Hybrid) for A/B/C testing. The strategy is selected in the barcode pre-fill modals via a pill button. Once you've decided which strategy to keep permanently, the other two should be removed along with all the switching UI and telemetry fields.

This document tells a future session exactly what was built and what to remove for each choice.

---

## What Was Built

### Backend — `backend/routers/barcode.py`

**New constants (lines 19–20):**
```python
AH_SEARCH_URL = "https://api.ah.nl/mobile-services/product/search/v2"
AH_HEADERS = {"X-Application": "AHWEBSHOP"}
```
Only needed if keeping AH or Hybrid.

**Extended `BarcodeResult` model (lines 31–33):**
```python
latency_ms: Optional[float] = None
strategy_used: Optional[int] = None
actual_source: Optional[str] = None
```
These three fields are dev-testing telemetry. Remove all three when cleaning up (also remove from the frontend `BarcodeResult` interface).

**Helper functions:**
- `_fetch_off(client, code)` — fetches from Open Food Facts API
- `_fetch_ah(client, code)` — fetches from Albert Heijn API (only needed for AH/Hybrid)
- `_extract_off_alcohol(product)` — parses OFF alcohol fields (keep for OFF+)
- `_extract_off_caffeine(product)` — parses OFF caffeine fields (keep for OFF+)
- `_extract_ah(product, module)` — parses AH fields (only needed for AH/Hybrid)

**Strategy functions:**
- `_strategy_off_plus(code, module, client)` — Strategy 1
- `_strategy_ah(code, module, client)` — Strategy 2
- `_strategy_hybrid(code, module, client)` — Strategy 3

**Endpoint (lines 225–263):**
```python
@router.get("/barcode/{code}", response_model=BarcodeResult)
async def lookup_barcode(
    code: str,
    module: str = Query(..., pattern="^(alcohol|caffeine)$"),
    strategy: int = Query(default=1, ge=1, le=3),   # ← remove this param
    db: Session = Depends(get_db),
):
    t0 = time.perf_counter()   # ← remove timing
    ...
    async with httpx.AsyncClient(timeout=8.0) as client:
        if strategy == 1:
            result = await _strategy_off_plus(code, module, client)
        elif strategy == 2:
            result = await _strategy_ah(code, module, client)
        else:
            result = await _strategy_hybrid(code, module, client)

    result.latency_ms = (time.perf_counter() - t0) * 1000   # ← remove
    result.strategy_used = strategy                          # ← remove
    return result
```

**New file — `backend/routers/parsers.py`:**
Contains `parse_ml_from_text`, `parse_abv_from_text`, `parse_caffeine_mg_from_text`. These are used by both OFF+ and Hybrid. Keep if keeping either. Remove only if keeping AH exclusively (AH doesn't use regex fallback).

**Tests — `backend/tests/test_barcode.py`:**
Lines after the original tests contain strategy-specific tests: `test_off_plus_*`, `test_strategy_ah_*`, `test_strategy_hybrid_*`, `test_response_has_telemetry_fields`, `test_local_match_has_telemetry_fields`, `test_strategy_out_of_range_rejected`. Remove tests for the two dropped strategies. Remove telemetry tests.

**Tests — `backend/tests/test_parsers.py`:**
New file. Remove entirely if `parsers.py` is removed (i.e., keeping AH only).

---

### Frontend — `frontend/src/contexts/SettingsContext.tsx`

**Lines 5, 10, 22, 29:**
```typescript
export type BarcodeStrategy = 1 | 2 | 3        // line 5 — remove
...
barcodeStrategy: BarcodeStrategy                 // line 10 — remove from Settings interface
...
const DEFAULT_SETTINGS = { ..., barcodeStrategy: 1 }   // line 22 — remove field
...
if (![1, 2, 3].includes(parsed.barcodeStrategy)) parsed.barcodeStrategy = 1  // line 29 — remove
```

Remove all four. Also remove the corresponding test block in `SettingsContext.test.ts` (the `describe('barcodeStrategy', ...)` block).

---

### Frontend — `frontend/src/api/barcode.ts`

**Telemetry fields (lines 11–13):**
```typescript
latency_ms: number | null
strategy_used: number | null
actual_source: string | null
```
Remove all three from `BarcodeResult`.

**`'ah'` source (line 4):**
```typescript
source: 'local' | 'off' | 'ah' | 'not_found'
```
If keeping OFF+ or Hybrid, change back to `'local' | 'off' | 'not_found'`. If keeping AH, change to `'local' | 'ah' | 'not_found'`.

**Strategy param (lines 19, 22):**
```typescript
strategy: 1 | 2 | 3 = 1,           // remove param
...
`...&strategy=${strategy}`           // remove from URL
```

---

### Frontend — `frontend/src/tabs/HomeTab.tsx`

**In the `HomeTab` function body:**
- Line 32: `const barcodeStrategy = settings.barcodeStrategy` — remove
- Line 41: `const [isFetching, setIsFetching] = useState(false)` — remove
- Lines 112: `lookupBarcode(code, activeModule, barcodeStrategy)` → revert to `lookupBarcode(code, activeModule)`
- Lines 138–150: entire `handleStrategyChange` function — remove
- Lines 249–251 and 261–263: the three new props on `NewAlcoholModal` and `NewCaffeineModal` calls — remove `isFetching`, `onStrategyChange`, `barcodeStrategy` from both

**In `NewAlcoholModal` (and `NewCaffeineModal` symmetrically):**
- Line 334: remove `isFetching?`, `onStrategyChange?`, `barcodeStrategy?` from the prop type
- Lines 412–422 (and 525–535 for caffeine): the entire combined `{prefill && (...)}` block. Replace with the original simple badge or remove entirely:
  ```tsx
  {/* remove or replace with a simple badge if desired */}
  ```
- Line 424 (and 537): remove the `<div className={isFetching ? 'opacity-40 pointer-events-none' : ''}>` wrapper — unwrap the fields
- Line 440 (and 549): remove `|| !!isFetching` from the Log button disabled condition

**`StrategyPill` component (lines 763–782):**
Remove the entire component definition.

Also remove `'ah'` from the `handleScan` condition if not keeping AH:
```typescript
// line ~125 — revert to:
if ((result.source === 'off' || result.source === 'local') && result.name) {
```

---

## Cleanup Matrix — What to Keep per Strategy Choice

| | Keep OFF+ | Keep AH | Keep Hybrid |
|---|---|---|---|
| `parsers.py` | ✅ keep | ❌ delete | ✅ keep |
| `test_parsers.py` | ✅ keep | ❌ delete | ✅ keep |
| `_fetch_off` | ✅ keep | ❌ delete | ✅ keep |
| `_fetch_ah` | ❌ delete | ✅ keep | ✅ keep |
| `_extract_off_*` | ✅ keep | ❌ delete | ✅ keep |
| `_extract_ah` | ❌ delete | ✅ keep | ✅ keep |
| `AH_SEARCH_URL/HEADERS` | ❌ delete | ✅ keep | ✅ keep |
| `_strategy_off_plus` | inline → endpoint | ❌ delete | ❌ delete |
| `_strategy_ah` | ❌ delete | inline → endpoint | ❌ delete |
| `_strategy_hybrid` | ❌ delete | ❌ delete | inline → endpoint |
| `import logging / logger` | ❌ delete | ❌ delete | ✅ keep |
| `'ah'` in `BarcodeResult.source` | ❌ remove | ✅ keep | ✅ keep |
| `'ah'` in `handleScan` condition | ❌ remove | ✅ keep | ✅ keep |

All of the following are removed **regardless** of which strategy is kept:
- `strategy` query param on the endpoint
- `latency_ms`, `strategy_used`, `actual_source` on `BarcodeResult` (backend + frontend)
- `import time` / `time.perf_counter()` in `barcode.py` (if no other timing remains)
- `barcodeStrategy` from `SettingsContext` (type, field, default, validation)
- `isFetching` state and `handleStrategyChange` from `HomeTab`
- `StrategyPill` component
- `isFetching`, `onStrategyChange`, `barcodeStrategy` props on both modals
- Dev-info badge section in both modals (or simplify back to just a static line)
- All strategy-specific backend tests; telemetry tests

---

## Recommended Approach for the Cleanup Session

1. Decide which strategy to keep and inline its logic directly into the `lookup_barcode` endpoint function (replace the `if strategy == 1 / elif / else` dispatch).
2. Delete the two unused strategy functions and their helper functions.
3. Strip `strategy` param, telemetry fields, and `import time` from the backend.
4. Update `BarcodeResult` in both backend and frontend.
5. Strip all strategy UI from the frontend (`SettingsContext`, `barcode.ts`, `HomeTab.tsx`).
6. Run `pytest` and `tsc --noEmit` to confirm nothing broke.
