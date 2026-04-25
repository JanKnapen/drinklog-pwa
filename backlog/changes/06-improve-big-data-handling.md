# Change Plan: Improved Big Data Handling

## Context
The application currently retrieves the entire history of entries (alcohol and caffeine) on every load and performs all filtering and aggregation (for charts) client-side. As the dataset grows (especially with 2+ years of historical data), this will lead to increased latency, high memory usage, and poor battery performance on mobile devices.

## Goals
1. Optimize database lookups using indexes.
2. Reduce data transfer by implementing pagination/limits for activity logs.
3. Move heavy aggregation logic (for charts) from the frontend to the backend.

---

## Decisions & Constraints

- **Unconfirmed entries (Log tab):** No pagination limit on the unconfirmed list. The Log tab fetches all `is_marked=false` entries in full — users are expected to confirm regularly. Only the historical confirmed-entry view gets a limit.
- **Log tab history:** Add a "Load more" button for browsing older confirmed entries (not infinite scroll).
- **DataTab bypasses the module adapter:** Summary data has a different shape (`{ date, total }[]`) and depends on period (local UI state in DataTab). DataTab calls `useEntrySummary` / `useCaffeineSummary` directly and reads `activeModule` from `SettingsContext` to pick which hook to use — same pattern as edit modals bypassing the adapter for raw fields.
- **TanStack Query key granularity:** `limit`, `offset`, and `period` must be included in query keys wherever they are used, so switching periods or pages triggers a refetch.
- **Stale time on historical summaries:** Daily totals for past periods are immutable. Set `staleTime: Infinity` for any period that does not include today.
- **`keepPreviousData`:** Use `placeholderData: keepPreviousData` on summary hooks so the previous chart stays visible while a new period loads.

---

## Phase 1: Database Optimization

### 1. Add Indexes
- **Models:** `backend/models.py`
- **Action:** Add `index=True` to the following columns:
  - `timestamp` on `DrinkEntry` and `CaffeineEntry` (range queries for pagination and aggregation)
  - `is_marked` on `DrinkEntry` and `CaffeineEntry` (filtering unconfirmed entries)
  - `template_id` on `DrinkEntry` and `CaffeineEntry` (join lookups)
- **Migration:** Extend `_migrate()` in `backend/main.py` to create these indexes on existing databases. `_migrate()` is already idempotent — follow the existing pattern.

---

## Phase 2: Backend API Enhancements

### 1. Pagination for Confirmed Entry Lists
- **Endpoints:** `GET /api/entries` and `GET /api/caffeine-entries`
- **New params:** `limit: int = 100`, `offset: int = 0`, `confirmed_only: bool = False`
- **Behaviour:**
  - When `confirmed_only=False` (default): return all unconfirmed (`is_marked=false`) entries with no limit, plus the most recent confirmed entries up to `limit`. This keeps the Log tab correct — all pending entries always appear.
  - When `confirmed_only=True`: apply `limit`/`offset` to confirmed entries only (used by the "load more" flow).
- **Ordering:** always newest-first (`ORDER BY timestamp DESC`).

### 2. Aggregation Endpoints (Summary)
- **New Endpoints:** `GET /api/entries/summary` and `GET /api/caffeine-entries/summary`
- **Router ordering:** register `/summary` before `/{entry_id}` to avoid FastAPI matching `"summary"` as an ID — same rule as `confirm-all`.
- **Params:** `period: Literal['week', 'month', 'year', 'all']`
- **Logic:** SQL `GROUP BY date(timestamp)` to produce daily totals. Return `[{ date: str, total: float }]` sorted ascending (chart-ready).
- **Benefit:** Reduces data transfer for the "Year" view from ~365+ raw entries to 365 daily total objects. For `period=all` this is still bounded by number of distinct days.

---

## Phase 3: Frontend Optimization

### 1. Update API Hooks
- **Files:** `frontend/src/api/entries.ts` and `caffeine-entries.ts`
- **`useEntries` / `useCaffeineEntries`:**
  - Add `limit`, `offset`, `confirmedOnly` params.
  - Include them in the query key: `['entries', { limit, offset, confirmedOnly }]`.
- **New hooks `useEntrySummary` / `useCaffeineSummary`:**
  - Accept `period: 'week' | 'month' | 'year' | 'all'`.
  - Query key: `['entries', 'summary', period]` / `['caffeine-entries', 'summary', period]`.
  - `staleTime: Infinity` when `period` does not include today's date (i.e. `period !== 'week'` is not safe — compute whether the period window includes today and set staleTime accordingly). Simplest heuristic: only `period='all'` and `period='year'` for past data can use `Infinity`; `'week'` and `'month'` always include today so use default staleTime.
  - `placeholderData: keepPreviousData` on all summary hooks.

### 2. Update DataTab
- **File:** `frontend/src/tabs/DataTab.tsx`
- **Action:**
  - Remove client-side `groupByDate` and `reduce` aggregation logic.
  - Read `activeModule` from `SettingsContext`.
  - Call `useEntrySummary(period)` or `useCaffeineSummary(period)` directly based on `activeModule` — do **not** go through `useModuleAdapter`. This is the same bypass pattern as edit modals (which need raw fields the adapter doesn't expose).
  - Show a loading skeleton while switching periods (`isLoading` / `isFetching`).
  - Previous chart data stays visible during the transition (`keepPreviousData`).

### 3. Update Log Tab
- **File:** `frontend/src/tabs/LogTab.tsx`
- **Action:**
  - Default fetch: all unconfirmed + last 100 confirmed (default endpoint behaviour, no extra params needed).
  - Add a **"Load more"** button below the confirmed-entry list. On click, increment `offset` by 100 and fetch `confirmedOnly=true` entries, appending results to local state.
  - Show a loading state on the button while fetching.

### 4. Update Home Tab
- **File:** `frontend/src/tabs/HomeTab.tsx`
- **Action:** The quick-log button logic only needs today's entries. Pass `limit=100` explicitly (today's entries will never realistically exceed this). No other changes needed — the module adapter handles the rest.

---

## Success Criteria
1. Database queries for entries use the `timestamp`, `is_marked`, and `template_id` indexes.
2. Initial app load transfers significantly less JSON data.
3. The Data tab chart remains fast even with thousands of historical entries.
4. All unconfirmed entries always appear in the Log tab regardless of volume.
5. Users can browse full history via "Load more" in the Log tab.
6. No regressions in "Confirm All" or "Quick Log" logic.
7. Period switching in DataTab is smooth — no flash of empty content.
