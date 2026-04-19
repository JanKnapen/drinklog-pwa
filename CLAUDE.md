# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DrinkLog is a self-hosted PWA for tracking alcohol consumption. It has four tabs: **Home** (quick-log drinks), **Log** (confirm/review entries), **Manage** (drink templates), **Data** (charts). Designed for a home server behind Tailscale — no auth.

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

Two tables: `DrinkTemplate` and `DrinkEntry`. An entry is either linked to a template (`template_id`) or has a free-text `custom_name`. `is_marked = true` means confirmed. `standard_units = (ml * abv / 100) / 15` — computed as a SQLAlchemy `@property` on the model and mirrored in `frontend/src/utils.ts`.

"Confirm All" (POST `/api/entries/confirm-all`) marks all unconfirmed entries with timestamps before the given cutoff, and auto-promotes any `custom_name` entries into templates.

**Important router ordering:** `/entries/confirm-all` must be registered before `/entries/{entry_id}` in `backend/routers/entries.py` or FastAPI matches `"confirm-all"` as an entry ID.

**Entry editing constraint:** template-linked entries (`template_id != null`) can only have their timestamp changed, not ml/abv/name. This is enforced on both backend (HTTP 400) and frontend (EditEntryModal renders different fields based on `isTemplateEntry`).

### Frontend state management

All server state lives in **TanStack Query**. No global client-side state store. The sole app-level state in `App.tsx` is `activeTab` and `toast`.

API layer lives in `frontend/src/api/`:
- `client.ts` — `apiFetch<T>()` wrapper + `ApiError`
- `entries.ts` / `templates.ts` — typed hooks (`useEntries`, `useCreateEntry`, etc.)

Query keys: `ENTRIES_KEY = ['entries']`, `TEMPLATES_KEY = ['templates']`. Mutations invalidate both keys where needed (e.g. creating an entry also invalidates templates because `usage_count` may change).

### Component conventions

- Shared form primitives are in `FormFields.tsx`: `Field`, `UnitPreview`, `inputCls`, `primaryBtn` — use these instead of writing one-off Tailwind classes for inputs/buttons.
- Tabs are lazy-loaded (`React.lazy`) in `App.tsx`. Each tab is a single file in `frontend/src/tabs/`.
- Modals are rendered inside the tab component that owns them (not portaled), using `Modal` from `components/Modal.tsx`.
- Toast notifications bubble up via `onToast` prop from `HomeTab` → `App` → `BottomNav` → `Toast`.

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

## Git Conventions

- Conventional commit messages: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- No `Co-Authored-By` lines in commits
- **Never commit without explicit user instruction.** Do not commit after completing a task — always wait for the user to say "commit this" or similar before running any `git commit` command.

## Deployment Notes

`docker-compose.yml` runs two services on an `internal` bridge network:
- `backend` — FastAPI, no exposed ports, `DATABASE_URL` points to a named volume at `/data/drinklog.db`
- `frontend` — nginx on port 80, serves the Vite build, proxies `/api/` to `backend:8000`

`nginx.conf` is at the project root and is baked into the frontend image at build time (`frontend/Dockerfile`). To change proxy behavior, edit `nginx.conf` and rebuild with `docker compose up --build`.

The Vite build uses `build:docker` script (skips `tsc`) inside Docker; the full `build` script (with type-checking) is for local CI.

Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) caches API responses with a NetworkFirst strategy, 10s timeout.
