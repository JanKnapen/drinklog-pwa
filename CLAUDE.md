# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DrinkLog is a self-hosted PWA for tracking consumption. It supports two modes — **alcohol** and **caffeine** — switchable via Settings. Both modes share the same four tabs: **Home** (quick-log), **Log** (confirm/review), **Manage** (templates), **Data** (charts). Designed for a home server behind Tailscale — no auth.

**Stack:** React 18 + Vite + TypeScript + TailwindCSS (frontend) · FastAPI + SQLAlchemy + SQLite (backend) · Docker Compose with nginx

## Development Commands

**Backend** (from `backend/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload          # runs on :8000
pytest                             # all tests
pytest tests/test_entries.py       # single test file
pytest -k "test_confirm_all"       # single test by name
```

**Frontend** (from `frontend/`):
```bash
npm install
npm run dev      # runs on :5173, proxies /api → :8000
npm run build    # tsc + vite build
npm test         # vitest
```

**Docker** (from root):
```bash
docker compose up --build   # full stack on :80
```

## Architecture

### Data model

**Alcohol:** `DrinkTemplate` / `DrinkEntry`. `standard_units = (ml * abv / 100) / 15` — SQLAlchemy `@property`, mirrored in `frontend/src/utils.ts`.

**Caffeine:** `CaffeineTemplate` / `CaffeineEntry`. `caffeine_units = mg / 80` — same pattern. No `ml` or `abv` fields. Tables are created automatically by `Base.metadata.create_all()` on startup.

Both modules share the same structural rules:
- An entry is either linked to a template (`template_id`) or has a free-text `custom_name`. `is_marked = true` means confirmed.
- "Confirm All" marks unconfirmed entries before a cutoff and auto-promotes `custom_name` entries into templates.
- **Router ordering:** `confirm-all` endpoint must be registered before `/{entry_id}` in both `routers/entries.py` and `routers/caffeine_entries.py` or FastAPI matches `"confirm-all"` as an ID.
- **Entry editing:** template-linked entries can only have their timestamp changed (HTTP 400 for any other field); enforced on both backend and frontend. Both `entries.py` and `caffeine_entries.py` implement this consistently — the check strips `timestamp` from the payload and raises 400 only if non-timestamp fields remain.
- **Name / custom_name invariant:** a template name and an unconfirmed entry `custom_name` with the same value cannot coexist (HTTP 409). Confirm-all auto-promotes pending entries into templates.
- **`CaffeineTemplateUpdate` includes `usage_count`** (same as `DrinkTemplateUpdate`) — needed so the frontend can increment it when logging from a template button.

### Frontend state management

All server state lives in **TanStack Query**. No global client-side state store. The sole app-level state in `App.tsx` is `activeTab` and `toast`.

API layer lives in `frontend/src/api/`:
- `client.ts` — `apiFetch<T>()` wrapper + `ApiError`
- `entries.ts` / `templates.ts` — alcohol hooks
- `caffeine-entries.ts` / `caffeine-templates.ts` — caffeine hooks (same patterns, PATCH instead of PUT)

Query keys: `['entries']`, `['templates']`, `['caffeine-entries']`, `['caffeine-templates']`. Mutations invalidate both entry and template keys for their module where needed.

### Module adapter pattern

**All four tabs use only `useModuleAdapter()`** (`frontend/src/hooks/useModuleAdapter.ts`) — no direct API imports in the main tab component. The adapter reads `activeModule` from `SettingsContext`, calls all hooks unconditionally (React rules), then returns module-appropriate normalised data:

- `templates: TrackerTemplate[]` — includes `displayInfo` (pre-formatted string), `entryCount`, `confirmedEntryCount`
- `entries: TrackerEntry[]` — includes `value` (standard_units or caffeine_units), `displayInfo`, `name` (template name or custom_name)
- Action methods: `logFromTemplate`, `logFromTemplateWithOptions(t, count, timestamp)`, `logFromPendingEntry(e, count, timestamp)`, `confirmAll`, `deleteEntry`, `updateEntryTimestamp`, `createTemplate`, `updateTemplate`, `deleteTemplate`

**Edit modals bypass the adapter** — `EditAlcoholEntry`, `EditCaffeineEntry`, `EditAlcoholTemplate`, `EditCaffeineTemplate` call their own API hooks directly and fetch raw data by ID. This is intentional; the adapter doesn't expose raw ml/abv/mg fields.

`groupByDate` in `utils.ts` is generic (`<T extends { timestamp: string }>`).

### Component conventions

- Shared form primitives are in `FormFields.tsx`: `Field`, `UnitPreview`, `inputCls`, `primaryBtn` — use these instead of writing one-off Tailwind classes for inputs/buttons.
- Tabs are lazy-loaded (`React.lazy`) in `App.tsx`. Each tab is a single file in `frontend/src/tabs/`.
- Modals are rendered inside the tab component that owns them (not portaled), using `Modal` from `components/Modal.tsx`.
- Toast notifications bubble up via `onToast` prop from `HomeTab` → `App` → `BottomNav` → `Toast`.

### Home tab quick-log button logic

The quick-log section shows exactly 5 buttons total, filled in this order:

1. **"Most used"** — templates ranked by all-time `usage_count`, most-recently-used as tiebreaker (max 5)
2. **"Today"** — templates logged today via an existing template (max 2)
3. **"New drinks"** — a single button if any entry today used a free-text `custom_name` (max 1)

The Today and New drinks buttons consume slots from the 5-button total, pushing out lower-ranked Most used buttons.

## Barcode Scanner

`BarcodeScanner.tsx` mounts/unmounts conditionally (`{modal === 'scanner' && <BarcodeScanner />}`) — it is never toggled with an `open` prop. `BottomNav` is hidden while the scanner is open (rendered conditionally in `App.tsx` via `scannerOpen` state lifted from `HomeTab`) because z-index stacking made it appear over the fullscreen camera overlay.

### Scanner library

Native `BarcodeDetector` Web API is unavailable in iOS WKWebView (the PWA runtime) even on iOS 18.7. `@zxing/browser` is used as the primary path for iOS; native `BarcodeDetector` is kept as the preferred path for Chrome/Android where it works. ZXing requires **2 consecutive matching reads** (streak ≥ 2) before firing `onScan` — this filters false positives that appeared reliably on iOS at default resolution. Native path has no confirmation delay; the asymmetry is intentional. ZXing runs at 1080p (`width: { ideal: 1920 }, height: { ideal: 1080 }`) — lower resolutions produced unreliable detection on iOS.

Camera requires `window.isSecureContext` (HTTPS). Dev setup uses Tailscale certs via `docker-compose.dev.yml` + `nginx.dev.conf.template` with `${TAILSCALE_HOSTNAME}` envsubst.

### Barcode column and uniqueness

`barcode` column exists on both `DrinkTemplate` and `CaffeineTemplate`. Uniqueness is enforced in two layers:

1. **Per-table (DB level):** `unique=True` on the SQLAlchemy column + a partial unique index `uq_{table}_barcode` (`WHERE barcode IS NOT NULL`) created by `_migrate()` for existing DBs. `_migrate()` runs on every startup and is idempotent.
2. **Cross-table (application level):** `_check_barcode_cross_module()` helper in both `routers/templates.py` and `routers/caffeine_templates.py` queries the opposite module's table and raises HTTP 409 before any write.

### Barcode lookup endpoint

`GET /api/barcode/{code}?module=alcohol|caffeine&strategy=1|2|3` searches **both** local DB tables first (barcodes are globally unique, match can only exist in one table). On a miss it calls an external API determined by `strategy`. The `module` param controls which nutrient fields to extract from external APIs. The response includes a `module` field (`"alcohol"` | `"caffeine"` | `null`) for local matches; `null` for external and not-found results.

### Retrieval strategies (dev-testing infrastructure)

Three strategies exist for A/B/C comparison — **this is temporary**. Once a preferred strategy is chosen, the other two and all switching UI should be removed per `backlog/changes/05-remove-retrieval-alternatives.md`.

- **Strategy 1 — OFF+** (default): Open Food Facts with improved field parsing (`serving_size` fallback for volume, `alcohol_100g` fallback for ABV, g→mg conversion for caffeine).
- **Strategy 2 — AH**: Albert Heijn unofficial API (`api.ah.nl`). High accuracy for Dutch product volume/ABV; caffeine rarely available.
- **Strategy 3 — Hybrid**: Queries both AH and OFF in parallel, stitches best available data, falls back to regex on `ingredients_text` for still-missing fields.

Regex parsing helpers live in `backend/routers/parsers.py` (`parse_ml_from_text`, `parse_abv_from_text`, `parse_caffeine_mg_from_text`). Used by OFF+ and Hybrid; not needed if keeping AH only.

The response includes dev-testing telemetry fields (`latency_ms`, `strategy_used`, `actual_source`) and `source` can be `"ah"` in addition to `"local"` / `"off"` / `"not_found"`.

`barcodeStrategy: 1 | 2 | 3` in `SettingsContext` (persisted to localStorage) and the `StrategyPill` component inside `NewAlcohol/CaffeineModal` are part of this dev-testing UI — both should be removed during cleanup.

### Scan flow invariants

**New scan (OFF result):** `NewAlcohol/CaffeineModal` receives a `barcode` prop. When `handleSubmit` runs, it always creates a **template** (never a `custom_name` entry) and stores the barcode on it. This ensures the next scan of the same product returns `source: "local"` and goes straight to `ScanMatchModal`. If this path used `custom_name` entries instead, barcodes would never be persisted and every scan would hit OFF.

**The `Ⓑ` suffix** on prefilled names in `NewAlcohol/CaffeineModal` is intentional — it identifies barcode-originated templates to the user. Users can edit the name before submitting.

**Cross-module local match:** When a scan returns `source: "local"` with `module !== activeModule`, `handleScan` calls `updateSettings({ activeModule })` and stores the template ID in `pendingScanTemplateId` state rather than opening `ScanMatchModal` immediately. A `useEffect` watching `[templates, pendingScanTemplateId]` opens the modal once the module adapter's `templates` array has updated on the next render. This deferred pattern is necessary because the module switch is reflected in the adapter synchronously on the next render cycle, not immediately.

## iOS Safari Scroll/Touch Quirks

These fixes are intentional — do not revert them:

**`html, body { overflow: hidden }`** (`index.css`): Required on iOS. If body can scroll, iOS intercepts touch events at the document level and the inner scroll containers don't receive them reliably.

**Scroll containers** use `overflow-y-auto touch-pan-y` (not `overflow-y-scroll`). Each tab has a `data-dbg-zone="LIST"` div as its scrollable region. The `data-dbg-zone` attributes are also used for CSS targeting.

**CSS rules tied to `data-dbg-zone`:**
- `[data-dbg-zone="HEADER"], [data-dbg-zone="FOOTER"]` → `touch-action: manipulation` (eliminates 300ms tap delay without breaking scroll)
- `[data-dbg-zone="LIST"] *` → `-webkit-user-select: none; -webkit-touch-callout: none` (prevents long-press callout from interrupting scrolls)
- `[data-dbg-zone="LIST"] p, span` → `pointer-events: none` (prevents text nodes from entering iOS scroll-chain hit-test, which caused the scroll container to stop scrolling when a touch started on text)

**Do not add** `-webkit-overflow-scrolling: touch` (deprecated, causes conflicts) or broad `touch-action: pan-y` on children of the LIST zone (breaks tap recognition on list items).

**Safe-area utilities** (`pt-safe`, `pb-safe`, `pb-safe-nav`) are defined in `index.css` using `env(safe-area-inset-*)`. The main app container uses `pt-safe pb-safe-nav`; the bottom nav uses `pb-4` (fixed 16px) rather than `pb-safe` — see note below.

**`viewport-fit=cover` is intentionally absent** from the viewport meta tag. In iOS standalone PWA mode the viewport always extends to the physical screen bottom regardless of this setting, so `env(safe-area-inset-bottom)` would return 34px and produce excessive space below the nav. Without `viewport-fit=cover` the env value is 0, and `pb-4` (16px) provides just enough clearance for the home indicator. Do not re-add `viewport-fit=cover` or replace `pb-4` with `pb-safe` on the nav.

## Settings & Dark Mode

App-level settings live in `SettingsContext` (`frontend/src/contexts/SettingsContext.tsx`), persisted to `localStorage` under key `drinklog-settings`. Fields: `theme` (`'light' | 'dark' | 'system'`) and `activeModule` (`'alcohol' | 'caffeine'`, default `'alcohol'`). The context provides `openSettings()` used by the gear icon in every tab header. `SettingsModal` is rendered once in `App.tsx` inside `SettingsProvider` but outside `QueryClientProvider`.

Tailwind uses `darkMode: 'class'` — the `dark` class is toggled on `<html>` by `SettingsContext`. **An inline script in `index.html`** applies the `dark` class synchronously before first render to prevent a flash of light mode on app launch. Do not remove it.

**`theme-color` meta tag limitation:** iOS PWA only reads `theme-color` at launch — dynamic JS updates to it have no effect while the app is running. The status bar color therefore follows the OS preference (via two `media`-based meta tags) and only reflects the user's in-app theme choice after a full app restart.

## Git Conventions

- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- No `Co-Authored-By` lines in commits
- **Never commit without explicit user instruction.** Do not commit after completing a task — always wait for the user to say "commit this" or similar before running any `git commit` command.
- **Before committing:** review whether the changes introduce anything non-obvious that future sessions would need to know (hidden constraints, invariants, intentional workarounds). If so, update CLAUDE.md first. Don't document UI details or anything self-evident from reading the code.

## Deployment Notes

`docker-compose.yml` runs two services on an `internal` bridge network:
- `backend` — FastAPI, no exposed ports, `DATABASE_URL` points to a named volume at `/data/drinklog.db`
- `frontend` — nginx on port 80, serves the Vite build, proxies `/api/` to `backend:8000`

`nginx.conf` is at the project root and is baked into the frontend image at build time (`frontend/Dockerfile`). To change proxy behavior, edit `nginx.conf` and rebuild with `docker compose up --build`.

The Vite build uses `build:docker` script (skips `tsc`) inside Docker; the full `build` script (with type-checking) is for local CI.

Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) caches API responses with a NetworkFirst strategy, 10s timeout.
