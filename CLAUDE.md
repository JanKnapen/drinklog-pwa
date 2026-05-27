# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DrinkLog is a self-hosted PWA for tracking consumption. It supports two modes — **alcohol** and **caffeine** — switchable via Settings. Both modes share the same four tabs: **Home** (quick-log), **Log** (confirm/review), **Manage** (templates), **Data** (charts). Designed for a home server behind Tailscale. Authentication via JWT — see Authentication section below.

**Stack:** React 18 + Vite + TypeScript + TailwindCSS (frontend) · FastAPI + SQLAlchemy + SQLite (backend) · Docker Compose with nginx

## Supplementary Docs

- **`admin/CLAUDE.md`** — Admin interface details. Auto-loaded by Claude Code when working in `admin/`.
- **`docs/deployment.md`** — Docker setup, env vars, nginx, non-root containers, service worker. **Read this before any deployment, Docker, nginx, or env-var work.**

## Icons

PNG icons generated from `frontend/public/favicon.svg` via `npx sharp-cli` (dev dep in `frontend/`): resize to 192×192, 512×512, and 180×180 (apple-touch-icon). Also copy the SVG to `admin/frontend/public/favicon.svg`.

## Development Commands

**Backend** (from `backend/`):
```bash
PYTHONPATH=.. uvicorn main:app --reload          # runs on :8000
DEBUG=true PYTHONPATH=.. pytest                  # all tests (DEBUG=true required)
DEBUG=true PYTHONPATH=.. pytest tests/test_entries.py
DEBUG=true PYTHONPATH=.. pytest -k "test_confirm_all"
```

**Admin Backend** (from `admin/backend/`):
```bash
PYTHONPATH=../.. uvicorn main:app --reload --port 8001
PYTHONPATH=../.. pytest tests/
```

**Admin Frontend** (from `admin/frontend/`): `npm run dev` (:5174, proxies → :8001) · `npm run build`

**Frontend** (from `frontend/`): `npm run dev` (:5173, proxies → :8000) · `npm run build` (tsc + vite) · `npm test`

**Docker** (from root): `docker compose up --build`

## Architecture

### Data model

**Alcohol:** `DrinkTemplate` / `DrinkEntry`. `standard_units = (ml * abv / 100) / 15` — SQLAlchemy `@property`, mirrored in `frontend/src/utils.ts`.

**Caffeine:** `CaffeineTemplate` / `CaffeineEntry`. `caffeine_units = mg / 80` — same pattern. No `ml` or `abv` fields. Tables created by `Base.metadata.create_all()` on startup.

**Fractional entries:** Both entry tables have a nullable `fraction` float column (`NULL` = 1.0). Multiplied into `standard_units`/`caffeine_units` via ORM `@property` and summary SQL via `COALESCE(fraction, 1.0)`. A ½ drink is a **separate** DB entry with `fraction=0.5` — logging `2½` creates 3 rows. Added to existing DBs by `_migrate()`. The ½ toggle in `Stepper` bumps counter from 0→1 when disabled at 0 — intentional to prevent submitting 0 drinks.

Both modules share the same structural rules:
- An entry is either linked to a template (`template_id`) or has a free-text `custom_name`. `is_marked = true` means confirmed.
- "Confirm All" marks unconfirmed entries before a cutoff and auto-promotes `custom_name` entries into templates.
- **Router ordering:** `confirm-all` endpoint must be registered before `/{entry_id}` in both `routers/entries.py` and `routers/caffeine_entries.py` or FastAPI matches `"confirm-all"` as an ID.
- **Entry editing:** template-linked entries can only have their timestamp changed (HTTP 400 for any other field); enforced on both backend and frontend. The check strips `timestamp` from the payload and raises 400 only if non-timestamp fields remain.
- **Name / custom_name invariant:** a template name and an unconfirmed entry `custom_name` with the same value cannot coexist (HTTP 409). Multiple unconfirmed entries with the same `custom_name` are allowed — confirm-all links all to one template. The frontend enforces against duplicate names in `NewAlcohol/CaffeineModal` (inline error), but `logFromPendingEntry` intentionally creates duplicate-named entries.
- **`usage_count` is incremented server-side** — not client-writable. `DrinkTemplateUpdate` / `CaffeineTemplateUpdate` do not expose it.

### Frontend state management

All server state lives in **TanStack Query**. No global client-side state store. The sole app-level state in `App.tsx` is `activeTab` and `toast`.

API layer in `frontend/src/api/`:
- `client.ts` — `apiFetch<T>()` wrapper + `ApiError`
- `entries.ts` / `templates.ts` — alcohol hooks
- `caffeine-entries.ts` / `caffeine-templates.ts` — caffeine hooks (PATCH instead of PUT)

Query keys: `['entries']`, `['templates']`, `['caffeine-entries']`, `['caffeine-templates']`. Mutations invalidate both entry and template keys for their module where needed.

**`mutate()` vs `mutateAsync()`** — use `mutate()` only for true fire-and-forget (deletes, timestamp updates). If a toast, callback, or state change must only happen on success, use `mutateAsync()` and `await` it. Catch blocks should narrow to the specific error type rather than swallowing all exceptions.

### Module adapter pattern

**All four tabs use only `useModuleAdapter()`** (`frontend/src/hooks/useModuleAdapter.ts`) — no direct API imports in the main tab component. The adapter reads `activeModule` from `SettingsContext`, calls all hooks unconditionally (React rules), and returns normalised data:

- `templates: TrackerTemplate[]` — includes `displayInfo`, `entryCount`, `confirmedEntryCount`
- `entries: TrackerEntry[]` — includes `value` (standard_units or caffeine_units), `displayInfo`, `name`
- Action methods: `logFromTemplate`, `logFromTemplateWithOptions(t, count, timestamp)`, `logFromPendingEntry(e, count, timestamp)`, `confirmAll`, `deleteEntry`, `updateEntryTimestamp`, `createTemplate`, `updateTemplate`, `deleteTemplate`

**Adapter bypasses** — Several components call API hooks directly:
- **Edit modals** (`EditAlcoholEntry`, `EditCaffeineEntry`, `EditAlcoholTemplate`, `EditCaffeineTemplate`): need raw ml/abv/mg fields not exposed by adapter.
- **DataTab**: calls `useEntrySummary` / `useCaffeineSummary` directly; summary shape `{ date, total }[]` depends on `period` state.
- **LogTab**: calls `useEntries` / `useCaffeineEntries` directly; needs pagination (`confirmedOnly`, `offset`).

`groupByDate` in `utils.ts` is generic (`<T extends { timestamp: string }>`).

### Component conventions

- Shared form primitives in `FormFields.tsx`: `Field`, `UnitPreview`, `inputCls`, `primaryBtn` — use these instead of one-off Tailwind classes.
- Tabs are lazy-loaded (`React.lazy`) in `App.tsx`. Each tab is a single file in `frontend/src/tabs/`.
- Modals are rendered inside the tab component that owns them (not portaled), using `Modal` from `components/Modal.tsx`.
- Toast notifications bubble up via `onToast` prop: `HomeTab` → `App` → `BottomNav` → `Toast`.

### Data tab

The `/summary` endpoints accept either `start`+`end` (ISO `YYYY-MM-DD`, inclusive) or legacy `period` shortcut. Explicit `start`/`end` win when both supplied. Window clamped to 5 years (`MAX_WINDOW_DAYS` in `backend/routers/summary_utils.py`). Summary includes both confirmed and unconfirmed entries.

`/summary/range` returns `{ first_date, last_date }` (both nullable) — used by frontend when period=All.

**Trailing moving-average padding:** DataTab fetches `(avgWindow - 1)` days before `windowStart` so the MA at the leftmost visible day has a full lookback. Padding days are sliced out before rendering. Stats cards use raw daily totals, not the smoothed series.

**Window navigation:** `anchorEnd` is the right edge of the visible window. `period` defines width; `stepUnit` defines shift size (independent of period). Forward shifts clamp to today. Switching period resets `anchorEnd` to today. Navigation strip hidden when period=All.

Composite index `ix_{drink,caffeine}_entries_user_id_timestamp` created by `_migrate()`.

### Home tab quick-log button logic

Shows exactly 5 buttons total, filled in order:
1. **"Most used"** — templates ranked by `usage_count`, most-recently-used as tiebreaker (max 5)
2. **"Today"** — templates logged today via existing template (max 2)
3. **"New drinks"** — single button if any entry today used a free-text `custom_name` (max 1)

Today and New drinks consume slots from the 5-button total.

**Snapshot refresh invariant:** Quick-log buttons derive from `snapshot` built by `refreshSnapshot()`. The `isEntriesFetched` effect is the primary trigger. `templates` is included in that effect's dep array so the snapshot rebuilds when templates arrive while entries are already fetched (e.g. after a logout/login cycle on LogTab). Do not remove `templates` from that dep array.

## Authentication

Two-token JWT pattern. All data endpoints require a valid access token.

### Token architecture
- **Access token** — 15-min lifetime. Returned in login response body. Stored in a module-level variable in `frontend/src/api/client.ts` — never written to localStorage/sessionStorage/cookie. Sent as `Authorization: Bearer <token>`.
- **Refresh token** — 30-day lifetime. `httpOnly; SameSite=Strict; Secure` cookie named `refresh_token`. Used only by `POST /api/auth/refresh` (rotation). Each token carries a `jti` stored in the `refresh_tokens` DB table. Old jti deleted on refresh, new one inserted. If jti not found (already consumed), all refresh tokens for that user are wiped — reuse/theft detected. Expired tokens purged on startup.

### Backend

**`backend/auth.py`** — `hash_password` / `verify_password` (bcrypt directly) and `create_access_token` / `create_refresh_token` / `decode_*` (PyJWT). Do not use `passlib` or `python-jose` — both abandoned. **`create_refresh_token` returns `(token, jti, expires_at)`** — all callers must unpack all three.

**`backend/routers/deps.py`** — `get_current_user` dependency. Every data router must include it on every endpoint. Every query filters by `user_id == current_user.id`.

**`backend/routers/auth.py`** — login / refresh / logout / me endpoints. Login rate-limited to 5 req/min per IP via `slowapi`. The `limiter` instance is created in `auth.py` and registered on the app in `main.py` — import it from `routers.auth` to rate-limit other endpoints (only one can be registered on `app.state`). Login also has in-memory per-IP **lockout**: 10 failures within 15 min → HTTP 423 with `Retry-After: 900`. **Test gotcha:** slowapi's rate limit fires before the lockout handler, so attempts 6+ never reach `_record_failure`. Call `limiter.reset()` before each failed request in lockout tests — see `test_login_locked_out_after_10_failures`.

**Rate limiter IP extraction** — `_get_real_ip(request)` reads `X-Real-IP` header nginx sets, falls back to `request.client.host`. Both auth routers use this as `Limiter(key_func=...)` and for lockout tracking. Do not use slowapi's default `get_remote_address` (returns nginx container's internal Docker IP).

**Logging** — use `logging.getLogger("uvicorn.error")`, not `__name__`. `__name__` produces unformatted output; `"uvicorn.error"` uses uvicorn's formatter.

**Seed mechanism** — `_ensure_seed_user()` (called from `_migrate()`) raises `RuntimeError` if User table empty and `ADMIN_SEED_USERNAME`/`ADMIN_SEED_PASSWORD` unset. Creates seed user if vars set; ignores them once any user exists.

**`_migrate_user_id_columns()`** — adds `user_id` to all four data tables and backfills with seed user ID. Runs after `_ensure_seed_user()`. Idempotent.

### Frontend

**`apiFetch` 401 retry** — one silent refresh via `POST /api/auth/refresh` on 401. If refresh succeeds, original request retries. If refresh fails, clears in-memory token and calls `window.location.reload()`. One-shot, no loop.

**`refreshPromise` deduplication lock** — `refreshAccessToken()` uses a module-level `refreshPromise` so concurrent 401s share one refresh call. Without it, parallel retries consume the jti, triggering reuse detection and wiping the session. Do not bypass or remove this lock.

**TanStack Query retry config** — `QueryClient` configured with `retry: false` for `AuthError`. Default `retry: 1` would cause a second 401 round → second refresh call → broken session. Do not replace with a plain number.

**`credentials: 'include'`** — all `fetch` calls must include this so the browser sends the `httpOnly` refresh cookie. Any new API calls outside `apiFetch` must also include it.

**Startup flow** — `AppContent` calls `refreshAccessToken()` before rendering any tab. Blank screen during this check avoids a flash of the login screen.

**Background resume refresh** — `visibilitychange` listener calls `refreshAccessToken()` after ≥14 min background (1-min buffer before token expiry). Pre-empts TQ's focus-refetches from all racing on 401.

**`username` in `SettingsContext`** — session-only, not persisted. Populated from `GET /api/auth/me` after every successful refresh. Cleared on logout. Login state derives from `username !== null`.

**Query cache cleared on logout** — `useEffect` in `AppContent` calls `queryClient.clear()`, `caches.delete('api-cache')`, and `clearMutations()` (offline queue) when `username === null`, gated on `authChecked` — so cold-start render (where `username` starts `null` before silent refresh resolves) does not wipe the queue. See Offline Support for `clearMutations`/`authChecked` rationale.

**`secure=True` on the refresh cookie** — only sent over HTTPS. Local dev without TLS causes silent refresh failure. Use the Tailscale dev setup (`docker-compose.local.yml`) for end-to-end auth testing.

### Tests

`backend/tests/test_auth.py` — uses a separate `auth_client` fixture with its own in-memory DB. Has autouse `reset_rate_limiter` and `reset_lockout` fixtures clearing slowapi state and `_failures` dict before each test. Same two fixtures in `admin/backend/tests/conftest.py`.

`conftest.py` — `override_get_current_user` creates or reuses a `testadmin` user. All non-auth tests run as `testadmin` without needing a token.

## Barcode Scanner

`BarcodeScanner.tsx` mounts/unmounts conditionally (`{modal === 'scanner' && <BarcodeScanner />}`) — never toggled with an `open` prop. `BottomNav` hidden while scanner is open (via `scannerOpen` state lifted from `HomeTab`) to avoid z-index overlap.

### Scanner library

Native `BarcodeDetector` Web API unavailable in iOS WKWebView (PWA runtime) even on iOS 18.7. `@zxing/browser` is the primary path for iOS; native `BarcodeDetector` preferred on Chrome/Android. ZXing requires **2 consecutive matching reads** (streak ≥ 2) before firing `onScan` — filters false positives on iOS. Native path has no confirmation delay; asymmetry is intentional. ZXing runs at 1080p — lower resolutions produced unreliable detection on iOS.

Camera requires `window.isSecureContext` (HTTPS). Dev uses Tailscale certs via `docker-compose.dev.yml` + `nginx.dev.conf.template` with `${TAILSCALE_HOSTNAME}` envsubst.

### Template uniqueness constraints

`name` and `barcode` are unique **per user**, not globally. Intentionally **not** `unique=True` on the model — SQLite bakes a global `sqlite_autoindex` that `_migrate()` cannot remove, blocking two users sharing the same name/barcode. Uniqueness enforced via migration indexes instead.

**Name** — composite index `uq_{table}_user_name ON (user_id, name)`. Older DBs may have old global `uq_{table}_name` — `_migrate()` drops and replaces it.

**Barcode** — partial composite index `uq_{table}_barcode_user ON (barcode, user_id) WHERE barcode IS NOT NULL`. Same drop-and-replace pattern.

Application-level checks (the `if db.query(...).filter(...user_id...).first()` blocks) catch the common case with a clean 409. A global `IntegrityError` handler in `backend/main.py` acts as safety net for races — returns 409 instead of 500 traceback. Do not remove it.

**Cross-table barcode:** `_check_barcode_cross_module()` in both `routers/templates.py` and `routers/caffeine_templates.py` queries the opposite module's table and raises 409 before any write.

**Nullifying optional fields in PATCH/PUT** — Use `'field_name' in data.model_fields_set` (not `data.field is not None`) to detect explicit null vs absent. Required for any endpoint that supports clearing a nullable field (`{"barcode": null}` → NULL; omit `barcode` → untouched). Skip uniqueness checks when incoming value is null.

### Barcode lookup endpoint

`GET /api/barcode/{code}?module=alcohol|caffeine&strategy=1|2|3` — searches local DB first, then external API on miss. Response includes `module` field for local matches; `null` for external/not-found.

### Retrieval strategies (temporary)

Three strategies (OFF+/AH/Hybrid) exist for A/B/C comparison — **to be removed** per `backlog/changes/05-remove-retrieval-alternatives.md`. `barcodeStrategy` in `SettingsContext` and `StrategyPill` in `NewAlcohol/CaffeineModal` are part of this dev-testing UI. Regex helpers in `backend/routers/parsers.py`.

### Scan flow invariants

**`NewScanModal` handles all scan flows** — `HomeTab` renders it whenever `scanCode` is set. `NewAlcohol/CaffeineModal` receive `barcode={scanCode}` where `scanCode` is always `null` — their barcode code is unreachable. Do not add scan-flow logic to those modals. `NewScanModal` supports a module toggle and caches per-module results in a `useRef` map.

**New scan and not-found scan** — `handleSubmit` always creates a **template** so the barcode persists for future scans. Duplicate name → blocked with error, not silently attached. `source: "not_found"` → prompts user to fill details manually, same template-creation path.

**The `Ⓑ` suffix** on prefilled names in `NewScanModal` is intentional — identifies barcode-originated templates.

**Connect mode** — lets user attach the scanned barcode to an existing template. `useUpdateTemplate` and `useUpdateCaffeineTemplate` are called unconditionally for this; they look unused in `handleSubmit` but `handleConnect` needs them. **Do not remove these hooks when merging.**

**`handleConnect` operation order** — barcode update fires first, entries second. Update is idempotent; reversing the order creates duplicate entries on retry.

**Cross-module local match** — when a scan returns `source: "local"` with `module !== activeModule`, `handleScan` calls `updateSettings({ activeModule })` and stores the template ID in `pendingScanTemplateId`. A `useEffect` watching `[templates, pendingScanTemplateId]` opens the modal once the adapter's `templates` has updated. This deferred pattern is necessary because the module switch is reflected in the adapter on the next render cycle, not immediately.

## Offline Support

Logging entries works offline. Reads use the service-worker `NetworkFirst` cache. Writes use a client-side IndexedDB queue that replays on reconnect. **Only `POST /api/alcohol-entries` and `POST /api/caffeine-entries` are queueable.** Edits, deletes, template CRUD, and Confirm All require live connectivity.

**Queue (`frontend/src/api/offline-queue.ts`)** — IndexedDB store `drinklog-offline.pending-mutations`, rows `{ id, url, method, body, createdAt, username }`. Capped at 1000. Exports `queueEvents` EventTarget firing `change` on enqueue/remove/clear. `enqueueMutation` refuses without `username`.

**`networkMode: 'always'`** on `useCreateEntry` / `useCreateCaffeineEntry` — TQ v5 default `'online'` pauses `mutationFn` when offline, bypassing our queue. Other mutations keep the default.

**`navigator.onLine` precheck + 5s `AbortController`** — precheck queues synchronously if already offline (fast path). For 'navigator lies' cases (fetch hangs despite `onLine = true`), queueable POSTs are wrapped in a 5s `AbortController`; the aborted fetch routes through `handleNetworkFailure` to the queue. Removing either path reintroduces the 'nothing happens when offline' bug.

**Queue is identity-bound** — `client.ts` mirrors `currentUsername` from `SettingsContext` via `setCurrentUsername()`. Each enqueue stamped with this value. `drainOfflineQueue` replays only matching stamps; foreign/missing stamps deleted as cleanup (security boundary against cross-user replay on shared devices). `usePendingEntries` also filters by current user.

**Logout-clear gated on `authChecked`** — prevents cold-start `username = null` (before silent refresh resolves) from wiping the queue. Real logout (username transitions to `null` after `authChecked = true`) still clears everything.

**Pending entries hydrated from the queue, not TQ optimistic updates** (`hooks/usePendingEntries.ts`) — subscribes to `queueEvents.change`, parses queued POST bodies, produces synthetic entries with `id = pending-<queueId>`. Adapter and `LogTab` prepend these to server entries — that's why pending entries appear in Unconfirmed and survive PWA cold restart. **Do not add `onMutate`/`onError` optimistic logic to `useCreateEntry`** — it double-renders every offline log.

**`isPending` in `TrackerEntry`** — `id.startsWith('pending-')` via `isPendingId()`. `LogTab` gives pending rows amber background + spinner, disables edit (no server id), reroutes trash to `removeMutation()`. `hasEligibleToConfirm` excludes pending entries.

**`HomeTab` snapshot must include `entries` in its refresh deps** — offline logs don't bump `usage_count` server-side, so without `entries` in the dep array the Quick Log buttons never reorder until reconnect. Both `entries` and `templates` are required in that dep array.

**Drain** — fires on `online` event and login. Refreshes token once on 401 via `refreshPromise` lock. Drops items on 4xx; bails on 5xx/network error (retries next `online` event). After progress, `App.tsx` invalidates entries/templates queries.

**Confirm All is intentionally not queueable** — semantics depend on the live unconfirmed set at the server. `LogTab` disables the button and relabels it `"Confirm All (offline)"`. Do not add `confirm-all` to the `QUEUEABLE` set.

**Toast text** — `loggedMsg = isOnline ? "Logged: X" : "Saved offline: X"`. The closure captures `isOnline` at click time.

**No idempotency keys (yet)** — no protection against double-logging if a request reaches the server but the response is lost. The common case (truly offline) is fine. Fix if needed: client-generated `request_id` UUID with backend uniqueness check.

## iOS Safari Scroll/Touch Quirks

These fixes are intentional — do not revert them:

**`html, body { overflow: hidden }`** (`index.css`): Required on iOS — if body can scroll, iOS intercepts touch events at the document level and inner scroll containers don't receive them.

**Scroll containers** use `overflow-y-auto touch-pan-y`. Each tab has a `data-dbg-zone="LIST"` div as scrollable region.

**CSS rules tied to `data-dbg-zone`:**
- `[data-dbg-zone="HEADER"], [data-dbg-zone="FOOTER"]` → `touch-action: manipulation` (eliminates 300ms tap delay)
- `[data-dbg-zone="LIST"] *` → `-webkit-user-select: none; -webkit-touch-callout: none` (prevents long-press callout interrupting scrolls)
- `[data-dbg-zone="LIST"] p, span` → `pointer-events: none` (prevents text nodes from entering iOS scroll-chain hit-test)

**Do not add** `-webkit-overflow-scrolling: touch` (deprecated, causes conflicts) or broad `touch-action: pan-y` on LIST children (breaks tap recognition).

**Safe-area utilities** (`pt-safe`, `pb-safe`, `pb-safe-nav`) in `index.css` using `env(safe-area-inset-*)`. Bottom nav uses `pb-4` (fixed 16px), not `pb-safe`.

**`viewport-fit=cover` is intentionally absent** from the main app viewport meta tag. In iOS standalone PWA mode, `env(safe-area-inset-bottom)` returns 34px with it, producing excessive space. Without it the value is 0 and `pb-4` provides just enough clearance. Do not re-add it or replace `pb-4` with `pb-safe` on the nav.

## Settings & Dark Mode

App-level settings in `SettingsContext` (`frontend/src/contexts/SettingsContext.tsx`), persisted to `localStorage` under `drinklog-settings`. Fields: `theme` (`'light' | 'dark' | 'system'`), `activeModule` (`'alcohol' | 'caffeine'`, default `'alcohol'`). Also holds `username: string | null` as session-only state (not persisted). Provides `openSettings()` used by gear icons in tab headers. `SettingsModal` rendered once in `App.tsx` inside `SettingsProvider` but outside `QueryClientProvider`.

Tailwind uses `darkMode: 'class'`. **An inline script in `index.html`** applies the `dark` class before first render to prevent flash of light mode. Do not remove it.

**`theme-color` meta tag:** iOS PWA only reads it at launch — JS updates have no effect while running.

## Refactoring and Simple Changes

For mechanical changes where the "what" is fully determined — renames, URL changes, moving files, extracting constants — implement directly without brainstorming or planning workflows.

Only use brainstorming/planning/subagent workflows when the task involves genuine design choices, multiple independent subsystems, or non-obvious trade-offs.

Good code quality and refactoring are always welcome when touching existing code. Do not hold back on quality — just don't gate simple tasks behind unnecessary process.

## Git Conventions

- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- No `Co-Authored-By` lines in commits
- **Never commit without explicit user instruction.**

## Post-Implementation Workflow

After completing an implementation and pushing, follow this sequence. Each step gates the next — do not advance without explicit user confirmation. Do not run steps in parallel.

### 1. Testing confirmation
Wait for the user to confirm they've tested on the deployed app and no further changes are needed. If issues arise, fix and return to this step.

### 2. Security review
Changes warrant a review if they touch: auth/session/secrets, user input/validation, cross-user data, network surface (new endpoints/headers/CORS/CSP), file handling, third-party APIs, cryptography, or dependencies. If yes (or user requests it), invoke the `security-review` skill. If not needed, explain why and ask user to confirm before skipping.

### 3. CLAUDE.md review
Update `CLAUDE.md` (and/or `admin/CLAUDE.md`, `docs/deployment.md`) if any of the following were discovered: new conventions/patterns, non-obvious technical decisions (why, not what), reusable utilities a future context needs, pitfalls/footguns. **Do not add** things already documented, generic best practices, or step-by-step summaries. Commit if any changes.

## Security Constraints

- **Never read, print, or suggest values from `.env`** — treat as a secret file.
- **Never set `DEBUG=true` in any production config** — bypasses JWT secret validation. Only valid in tests and `docker-compose.dev.yml`.
- **Admin ports `:8001`/`:8002` are Tailscale-only** — restricted via `DOCKER-USER` iptables rules. Never suggest binding them to `0.0.0.0` without those rules, exposing through nginx, or making public.
