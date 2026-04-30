# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DrinkLog is a self-hosted PWA for tracking consumption. It supports two modes — **alcohol** and **caffeine** — switchable via Settings. Both modes share the same four tabs: **Home** (quick-log), **Log** (confirm/review), **Manage** (templates), **Data** (charts). Designed for a home server behind Tailscale. Authentication via JWT — see Authentication section below.

**Stack:** React 18 + Vite + TypeScript + TailwindCSS (frontend) · FastAPI + SQLAlchemy + SQLite (backend) · Docker Compose with nginx

## Development Commands

**Backend** (from `backend/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=.. uvicorn main:app --reload          # runs on :8000
DEBUG=true PYTHONPATH=.. pytest                             # all tests (DEBUG=true required — startup check rejects missing JWT secrets)
DEBUG=true PYTHONPATH=.. pytest tests/test_entries.py       # single test file
DEBUG=true PYTHONPATH=.. pytest -k "test_confirm_all"       # single test by name
```

**Admin Backend** (from `admin/backend/`):
```bash
pip install -r requirements.txt
PYTHONPATH=../.. uvicorn main:app --reload --port 8001
PYTHONPATH=../.. pytest tests/
```

**Admin Frontend** (from `admin/frontend/`):
```bash
npm install
npm run dev      # runs on :5174, proxies /api → :8001
npm run build    # vite build
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

**Fractional entries:** Both entry tables have a nullable `fraction` float column (`NULL` = 1.0). It is multiplied into `standard_units`/`caffeine_units` in the ORM `@property` and into the summary SQL aggregation via `COALESCE(fraction, 1.0)`. A ½ drink is stored as a **separate** DB entry with `fraction=0.5` — logging `2½` creates 3 rows (two with `fraction=NULL`, one with `fraction=0.5`). The column is added to existing DBs by `_migrate()`. The ½ toggle in the `Stepper` component bumps the counter from 0 to 1 when disabled at 0 — this is intentional to prevent submitting 0 drinks.

Both modules share the same structural rules:
- An entry is either linked to a template (`template_id`) or has a free-text `custom_name`. `is_marked = true` means confirmed.
- "Confirm All" marks unconfirmed entries before a cutoff and auto-promotes `custom_name` entries into templates.
- **Router ordering:** `confirm-all` endpoint must be registered before `/{entry_id}` in both `routers/entries.py` and `routers/caffeine_entries.py` or FastAPI matches `"confirm-all"` as an ID.
- **Entry editing:** template-linked entries can only have their timestamp changed (HTTP 400 for any other field); enforced on both backend and frontend. Both `entries.py` and `caffeine_entries.py` implement this consistently — the check strips `timestamp` from the payload and raises 400 only if non-timestamp fields remain.
- **Name / custom_name invariant:** a template name and an unconfirmed entry `custom_name` with the same value cannot coexist (HTTP 409). Confirm-all auto-promotes pending entries into templates. Two unconfirmed entries also cannot share the same `custom_name` (HTTP 409 on `POST /entries` and `POST /caffeine-entries`); the frontend enforces this too with an inline error before the request is made.
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

**Adapter bypasses** — Several components call API hooks directly instead of going through `useModuleAdapter`:
- **Edit modals** (`EditAlcoholEntry`, `EditCaffeineEntry`, `EditAlcoholTemplate`, `EditCaffeineTemplate`): call hooks directly and fetch raw data by ID. The adapter doesn't expose raw ml/abv/mg fields.
- **DataTab**: calls `useEntrySummary` / `useCaffeineSummary` directly. Summary data has a different shape (`{ date, total }[]`) and depends on `period` (local UI state).
- **LogTab**: calls `useEntries` / `useCaffeineEntries` directly. Needs pagination state (`confirmedOnly`, `offset`) for "Load more" that the adapter doesn't support.

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

## Authentication

Two-token JWT pattern. All data endpoints require a valid access token.

### Token architecture
- **Access token** — 15-min lifetime. Returned in the login response body. Stored in a module-level variable in `frontend/src/api/client.ts` — never written to localStorage, sessionStorage, or any cookie. Sent as `Authorization: Bearer <token>` on every request.
- **Refresh token** — 30-day lifetime. Set by the server as an `httpOnly; SameSite=Strict; Secure` cookie named `refresh_token`. JavaScript cannot read it. Used only by `POST /api/auth/refresh` to issue a new access token silently.

### Backend

**`backend/auth.py`** — `hash_password` / `verify_password` (using `bcrypt` directly) and `create_access_token` / `create_refresh_token` / `decode_*` (using `PyJWT`). Do not use `passlib` or `python-jose` — both are abandoned and have known issues with modern Python environments.

**`backend/routers/deps.py`** — `get_current_user` dependency. Validates the `Authorization: Bearer` header and returns the `User` ORM object. Every data router (`entries`, `templates`, `caffeine_entries`, `caffeine_templates`, `barcode`) must include this as a dependency on every endpoint. Every query in those routers filters by `user_id == current_user.id` — no cross-user leakage is possible.

**`backend/routers/auth.py`** — login / refresh / logout / me endpoints. Login is rate-limited to 5 requests/minute per IP via `slowapi`. The `limiter` instance is created in `auth.py` and registered on the FastAPI app in `main.py`. To rate-limit any other endpoint, import this same `limiter` from `routers.auth` (don't create a new instance — only one can be registered on `app.state`) and add `request: Request` as the first parameter of the handler (slowapi requires it to extract the key).

**Logging** — use `logging.getLogger("uvicorn.error")` (not `__name__`) when adding log statements to any backend router. Using `__name__` produces unformatted output with no level prefix; `"uvicorn.error"` uses uvicorn's already-configured formatter so log lines are consistent with uvicorn's own output.

**Seed mechanism** — on startup, `_ensure_seed_user()` (called from `_migrate()`) checks if the `User` table is empty. If empty and `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` env vars are unset, it raises `RuntimeError` and refuses to start. If the env vars are set, it creates the seed user. Once any user exists the env vars are ignored.

**`_migrate_user_id_columns()`** — adds `user_id` column to all four data tables for existing databases and backfills `NULL` rows with the seed user's ID. Runs after `_ensure_seed_user()` so the seed user's ID is always available for the backfill. Both functions are idempotent.

### Frontend

**`apiFetch` 401 retry** — on a 401 response, `apiFetch` attempts one silent refresh via `POST /api/auth/refresh`. If the refresh succeeds, the original request is retried. If the refresh fails, the in-memory token is cleared and the page reloads to show the login screen. The retry is one-shot — it does not loop.

**`credentials: 'include'`** — all `fetch` calls in `client.ts` must use `credentials: 'include'` so the browser sends the `httpOnly` refresh cookie. This is already set in the `fetchWithAuth` helper. Any new API calls added outside `apiFetch` must also include this or refresh will silently fail.

**Startup flow** — `AppContent` in `App.tsx` calls `refreshAccessToken()` before rendering any tab. A blank screen is shown during this check to avoid a flash of the login screen. If refresh fails (cookie absent or expired), `<LoginView />` is rendered.

**`username` in `SettingsContext`** — session-only state, not persisted to localStorage. Populated from `GET /api/auth/me` after every successful refresh. Cleared on logout. The login/logout state of the app is derived solely from whether `username` is non-null.

**Query cache cleared on logout** — `AppContent` in `App.tsx` has a `useEffect` that calls `queryClient.clear()` whenever `username` becomes `null`. This prevents stale data from the previous session being visible to a different user who logs in on the same device. Do not remove it.

**`secure=True` on the refresh cookie** — the cookie is only sent over HTTPS. Local dev without TLS will not receive the cookie and the silent refresh will always fail. Use the Tailscale dev setup (`docker-compose.dev.yml`) for end-to-end auth testing.

### Tests

`backend/tests/test_auth.py` — uses a separate `auth_client` fixture with its own in-memory DB (does not use the shared `client` fixture from `conftest.py`). Has an autouse `reset_rate_limiter` fixture that clears slowapi's state before each test to prevent rate-limit state bleeding between tests.

`conftest.py` — `override_get_current_user` creates or reuses a `testadmin` user in the test DB. This means all non-auth tests run as `testadmin` without needing a token.

## Admin Interface

A separate service for server operators to manage user accounts. It is **not** the same as the main app's user-facing authentication.

### Architecture

The admin is two independent Docker services (`admin-backend`, `admin-frontend`) running alongside the main stack. They share the same `db_data` volume and therefore the same SQLite database. The admin backend imports models from `shared/models.py` (the same ORM models the main backend uses) — it does **not** have its own database or User table.

Admin services listen on ports `8001` (admin-backend) and `8002` (admin-frontend), restricted to Tailscale peers only via `DOCKER-USER` iptables rules on the host (see Deployment Notes).

### Authentication (admin-specific)

The admin uses a **single master password** pattern, not per-user credentials. This is separate from the main app's JWT system.

- **Login:** `POST /api/admin/login` with `{ password }`. Validated against `ADMIN_MASTER_PASSWORD` env var (plain string comparison — no hashing needed because this is a server secret, not a user password). Returns a short-lived JWT.
- **Admin token** — 60-minute lifetime (default). Signed with `ADMIN_JWT_SECRET`. Payload carries `{ type: "admin" }` — `get_admin_user` dependency in `routers/deps.py` validates this claim.
- **Token storage** — stored in `sessionStorage` (survives page refresh, cleared on tab close). Unlike the main app, there is no `httpOnly` cookie or refresh mechanism. Logging out clears `sessionStorage`.
- **Rate limiting** — login is rate-limited to 5 requests/minute per IP via `slowapi` (same library as the main backend).
- **`ADMIN_MASTER_PASSWORD` is required at startup** — `main.py` raises `RuntimeError` and refuses to start if the env var is unset or empty.
- **`ADMIN_JWT_SECRET`** — if unset, a random secret is generated per process restart (same pattern as main app JWT secrets). Always set this in production or the admin will require re-login after every restart.

### Backend

`admin/backend/routers/admin.py` — all endpoints are under the `/api/admin/` prefix and require `get_admin_user` dependency. Endpoints:
- `GET /api/admin/users` — lists all users with alcohol and caffeine entry counts
- `POST /api/admin/users` — creates a user (409 if username exists); passwords are hashed with `bcrypt`
- `PATCH /api/admin/users/{id}/password` — replaces password hash
- `DELETE /api/admin/users/{id}` — **explicitly** deletes all child rows (DrinkEntry, CaffeineEntry, DrinkTemplate, CaffeineTemplate) before deleting the user. There is no DB-level cascade; the explicit delete loop is intentional.

`ALLOWED_ORIGINS` env var (comma-separated) controls CORS. Defaults to `http://localhost,http://localhost:5174`.

### Frontend

`admin/frontend/` is a standalone Vite + React + TS + Tailwind project with no TanStack Query, no dark mode, and no PWA/service worker.

- `src/api/client.ts` — plain `fetch` wrapper; no `apiFetch` retry logic (no refresh token to retry with).
- `src/App.tsx` — checks `sessionStorage` for a token on mount; renders `LoginView` or `UsersView` accordingly.
- `src/views/UsersView.tsx` — inline modal components (`ModalOverlay`, `LabeledInput`, `ModalActions`) rather than a shared Modal component.

**Viewport:** `index.html` uses `maximum-scale=1` in the viewport meta tag (same as the main app) to prevent Chrome on iOS from rendering the page zoomed in. Modern iOS ignores `maximum-scale=1` when focusing an input, so input auto-zoom still works.

**`html, body, #root { height: 100%; overflow: hidden }`** in `index.css` — same pattern as the main app, required so the admin fills the full viewport on mobile without document-level scroll.

## Barcode Scanner

`BarcodeScanner.tsx` mounts/unmounts conditionally (`{modal === 'scanner' && <BarcodeScanner />}`) — it is never toggled with an `open` prop. `BottomNav` is hidden while the scanner is open (rendered conditionally in `App.tsx` via `scannerOpen` state lifted from `HomeTab`) because z-index stacking made it appear over the fullscreen camera overlay.

### Scanner library

Native `BarcodeDetector` Web API is unavailable in iOS WKWebView (the PWA runtime) even on iOS 18.7. `@zxing/browser` is used as the primary path for iOS; native `BarcodeDetector` is kept as the preferred path for Chrome/Android where it works. ZXing requires **2 consecutive matching reads** (streak ≥ 2) before firing `onScan` — this filters false positives that appeared reliably on iOS at default resolution. Native path has no confirmation delay; the asymmetry is intentional. ZXing runs at 1080p (`width: { ideal: 1920 }, height: { ideal: 1080 }`) — lower resolutions produced unreliable detection on iOS.

Camera requires `window.isSecureContext` (HTTPS). Dev setup uses Tailscale certs via `docker-compose.dev.yml` + `nginx.dev.conf.template` with `${TAILSCALE_HOSTNAME}` envsubst.

### Template uniqueness constraints

Both `name` and `barcode` on `DrinkTemplate` / `CaffeineTemplate` are unique **per user**, not globally. They are intentionally **not** marked `unique=True` on the model — that would create a global DB constraint and cause `IntegrityError` 500s when two users share the same name or barcode. Uniqueness is enforced via migration indexes instead.

**Name** — composite unique index `uq_{table}_user_name ON (user_id, name)` created by `_migrate()`. Older DBs may have the old global `uq_{table}_name` index — `_migrate()` drops it and replaces it.

**Barcode** — partial composite unique index `uq_{table}_barcode_user ON (barcode, user_id) WHERE barcode IS NOT NULL` created by `_migrate()`. Older DBs may have the global `uq_{table}_barcode` index — same drop-and-replace pattern.

Application-level uniqueness checks (the `if db.query(...).filter(...user_id...).first()` blocks before each write) catch the common case and return a clean 409 with a descriptive message. A global `IntegrityError` exception handler in `backend/main.py` acts as a safety net for race conditions — any constraint violation that slips through returns a 409 JSON response instead of a 500 traceback. Do not remove it; it keeps logs clean and provides a correct HTTP status to the frontend.

**Cross-table barcode:** `_check_barcode_cross_module()` helper in both `routers/templates.py` and `routers/caffeine_templates.py` queries the opposite module's table filtered by `user_id` and raises HTTP 409 before any write.

### Barcode lookup endpoint

`GET /api/barcode/{code}?module=alcohol|caffeine&strategy=1|2|3` searches **both** local DB tables first (barcodes are unique per user per module, so a match can only exist in one table for the requesting user). On a miss it calls an external API determined by `strategy`. The `module` param controls which nutrient fields to extract from external APIs. The response includes a `module` field (`"alcohol"` | `"caffeine"` | `null`) for local matches; `null` for external and not-found results.

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

**Not-found scan:** When the lookup returns `source: "not_found"`, `handleScan` opens `NewAlcohol/CaffeineModal` with `prefill=null` and `barcode` set (instead of toasting "Product not found"). The modal shows a prompt asking the user to fill in the details manually. On submit the same template-creation path runs, so the barcode is persisted for future scans.

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

App-level settings live in `SettingsContext` (`frontend/src/contexts/SettingsContext.tsx`), persisted to `localStorage` under key `drinklog-settings`. Fields: `theme` (`'light' | 'dark' | 'system'`) and `activeModule` (`'alcohol' | 'caffeine'`, default `'alcohol'`). The context also holds `username: string | null` and `setUsername` as **session-only state** (not persisted to localStorage — see Authentication section). The context provides `openSettings()` used by the gear icon in every tab header. `SettingsModal` is rendered once in `App.tsx` inside `SettingsProvider` but outside `QueryClientProvider`.

Tailwind uses `darkMode: 'class'` — the `dark` class is toggled on `<html>` by `SettingsContext`. **An inline script in `index.html`** applies the `dark` class synchronously before first render to prevent a flash of light mode on app launch. Do not remove it.

**`theme-color` meta tag limitation:** iOS PWA only reads `theme-color` at launch — dynamic JS updates to it have no effect while the app is running. The status bar color therefore follows the OS preference (via two `media`-based meta tags) and only reflects the user's in-app theme choice after a full app restart.

## Git Conventions

- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- No `Co-Authored-By` lines in commits
- **Never commit without explicit user instruction.** Do not commit after completing a task — always wait for the user to say "commit this" or similar before running any `git commit` command.
- **Before committing:** review whether the changes introduce anything non-obvious that future sessions would need to know (hidden constraints, invariants, intentional workarounds). If so, update CLAUDE.md first. Don't document UI details or anything self-evident from reading the code.

## Deployment Notes

`docker-compose.yml` runs four services on an `internal` bridge network:
- `backend` — FastAPI, no exposed ports, `DATABASE_URL` points to a named volume at `/data/drinklog.db`. Reads env vars from `.env` (via `env_file: .env`).
- `frontend` — nginx on port **80**, serves the Vite build, proxies `/api/` to `backend:8000`.
- `admin-backend` — FastAPI on port **8001**, shares the same `db_data` volume. Reads env vars from `.env`.
- `admin-frontend` — nginx on port **8002**, serves the admin Vite build, proxies `/api/` to `admin-backend:8000`.

Admin ports are bound to `0.0.0.0` but restricted to Tailscale peers only via `DOCKER-USER` iptables rules on the host:
```bash
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8001 -p tcp -j DROP
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8002 -p tcp -j DROP
```
Persisted with `netfilter-persistent save`. **Do not use UFW rules or `127.0.0.1` binding to restrict Docker ports** — Docker bypasses UFW by writing iptables rules directly, and `127.0.0.1` binding also blocks Tailscale (Tailscale traffic arrives with the Tailscale IP as destination, not loopback). The `DOCKER-USER` chain with `--ctorigdstport` (matches the pre-DNAT port) is the correct mechanism.

**`.env` and `.env.example`** — `.env` is the live deployment file (gitignored) that holds real secrets on the server. `.env.example` is the committed template. **Whenever a new env var is introduced, it must be added to `.env.example`** with a placeholder value and a short comment explaining what it is. Never read or suggest values from `.env` — treat it as a secret file that Claude should not inspect or expose.

**Env vars** (set in `.env` on the server, documented in `.env.example`):
- `DEBUG` — set to `true` to skip JWT secret validation at startup. `docker-compose.dev.yml` sets this automatically for `make dev`. Never set in production. Does **not** bypass the `ADMIN_MASTER_PASSWORD` check — that is always required regardless.
- `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` — bootstrap the first user on a fresh database. Ignored once any user exists. Backend refuses to start if the User table is empty and these are unset.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — secrets for signing tokens. Both backends refuse to start if these are unset and `DEBUG` is not `true`. If unset in dev, random values are generated per process restart (all sessions invalidated on restart).
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 15) / `REFRESH_TOKEN_EXPIRE_DAYS` (default: 30) — optional overrides.
- `ADMIN_MASTER_PASSWORD` — required unconditionally; admin backend refuses to start without it even in dev.
- `ADMIN_JWT_SECRET` — admin backend refuses to start if unset and `DEBUG` is not `true`. If unset in dev, random secret generated per restart.

**Non-root containers:**
- Backend containers use a `gosu` entrypoint (`backend/entrypoint.sh`, `admin/backend/entrypoint.sh`) that runs as root, `chown -R app:app /data` (handles existing root-owned volumes), then `exec gosu app uvicorn` to drop privileges. Do not remove the `chown` — it is what allows existing databases to survive the transition.
- Frontend containers use `nginxinc/nginx-unprivileged:alpine` (not `nginx:alpine`) — the standard image lacks pre-configured permissions for non-root operation and crashes with permission errors on `/var/cache/nginx`. nginx configs are copied with `COPY --chown=nginx:nginx` so the nginx entrypoint's envsubst step can overwrite them at startup.
- Nginx listens on port **8080** internally; docker-compose maps host 80 → container 8080 and host 8002 → container 8080. Do not change `listen` back to 80 — the non-root nginx user cannot bind to privileged ports.
- `docker-compose.dev.yml` overrides `user: "0"` on the frontend service — the Tailscale SSL cert key on the host (`/etc/ssl/`) is root-only readable, so dev must run as root. Production does not mount certs and stays non-root.

`nginx.conf` is at the project root and is baked into the frontend image at build time (`frontend/Dockerfile`). `admin/nginx.conf` is baked into the admin-frontend image. To change proxy behavior or headers, edit the relevant config and rebuild with `docker compose up --build`.

Both configs include security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) and `client_max_body_size 64k`. **Do not tighten the CSP without accounting for these two constraints:**
- `style-src 'unsafe-inline'` — required by Tailwind (injects inline styles at runtime)
- `script-src 'wasm-unsafe-eval'` — required by the ZXing barcode scanner (uses WebAssembly); main app only, not admin

HSTS is not set in nginx — it is handled by Cloudflare for the main app. Do not add it; Cloudflare and nginx both setting it causes duplicate headers.

The Vite build uses `build:docker` script (skips `tsc`) inside Docker; the full `build` script (with type-checking) is for local CI.

Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) caches API responses with a NetworkFirst strategy, 10s timeout.
