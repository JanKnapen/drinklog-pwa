# Admin Interface

A separate service for server operators to manage user accounts. **Not** the same as the main app's user-facing authentication.

## Architecture

Two independent Docker services (`admin-backend`, `admin-frontend`) alongside the main stack. Share the same `db_data` volume and SQLite database. Admin backend imports models from `shared/models.py` — does **not** have its own User table.

Admin services on ports `8001` (backend) and `8002` (frontend), restricted to Tailscale peers via `DOCKER-USER` iptables rules (see `docs/deployment.md`).

## Authentication

Single master password pattern, separate from the main app's JWT system.

- **Login:** `POST /api/admin/login` with `{ password }`. Validated against `ADMIN_MASTER_PASSWORD` env var (plain string — no hashing needed; it's a server secret). Returns a short-lived JWT.
- **Admin token** — 60-min lifetime. Signed with `ADMIN_JWT_SECRET`. Payload `{ type: "admin" }` — `get_admin_user` dependency validates this claim.
- **Token storage** — `sessionStorage` (survives page refresh, cleared on tab close). No `httpOnly` cookie or refresh mechanism. Logout clears `sessionStorage`.
- **Import session handoff** — navigating to `/import-review` writes an `ImportSession` (including JWT) to `sessionStorage` under `drinklog-import-session`; review page reads and removes it on mount. `sessionStorage` is correct: persists through same-tab navigations, isolated, auto-cleared on tab close.
- **Rate limiting** — login rate-limited to 5 req/min per IP via `slowapi`.
- **`ADMIN_MASTER_PASSWORD` required at startup** — `main.py` raises `RuntimeError` if unset.
- **`ADMIN_JWT_SECRET`** — random secret per restart if unset. Always set in production.

## Backend

`admin/backend/routers/admin.py` — all endpoints under `/api/admin/`, require `get_admin_user`. Endpoints:
- `GET /api/admin/users` — users with entry counts
- `POST /api/admin/users` — create user (409 if exists); passwords hashed with `bcrypt`
- `PATCH /api/admin/users/{id}/password` — replace password hash
- `DELETE /api/admin/users/{id}` — **explicitly** deletes all child rows (DrinkEntry, CaffeineEntry, DrinkTemplate, CaffeineTemplate) before deleting user. No DB-level cascade; intentional.
- `GET /api/admin/users/{id}/templates?module=alcohol|caffeine` — templates for import mapping UI
- `POST /api/admin/users/{id}/import` — bulk import. Named + anonymous entries. Cap: 50,000 rows/request.

**Import entry types** — *Named* entries carry `name` → matched to a `DrinkMapping` (existing or new template). *Anonymous* entries carry only `ml`+`abv` or `mg`, inserted with `template_id=None, custom_name=None` — the one place in the codebase where both fields are intentionally null.

**`drink_name` vs `template_name` in `DrinkMapping`** — `drink_name` is the immutable key matching raw entries to their mapping. `template_name` is the user-editable name for finding/creating the template. Never swap them: using `template_name` as the lookup key breaks entry matching.

**Link mode is frontend-only** — `ImportReviewView` offers "Link" mode (merge two `drink_name`s to one template). Backend has no `link` mode. On submit, frontend resolves each link via `findLinkTarget` to the target's `drink_name`, rewrites `entry.name` on linked raw entries, and omits the link `DrinkMapping`. Do not add `link` to `DrinkMapping.mode` on the backend. Link targets must be complete `new` mappings (all numeric fields valid); `findLinkTarget` re-checks completeness on every call.

**Template ownership in import** — every template DB query must include `user_id == user_id`, including pre-fetch and `usage_count` batch-update. Omitting it allows cross-user template corruption via crafted `template_id`.

`ALLOWED_ORIGINS` env var (comma-separated) controls CORS. Defaults to `http://localhost,http://localhost:5174`.

## Frontend

`admin/frontend/` — standalone Vite + React + TS + Tailwind, no TanStack Query, no PWA/service worker. Dark mode via `ThemeContext` (`src/contexts/ThemeContext.tsx`), persisted to `localStorage` under `drinklog-admin-settings` (separate from main app's `drinklog-settings`).

- `src/api/client.ts` — plain `fetch` wrapper; no retry logic (no refresh token).
- `src/App.tsx` — checks `sessionStorage` on mount; renders `LoginView`, `UsersView`, or `ImportReviewView` based on auth + `window.location.pathname`. Every render path must be wrapped in `ThemeProvider`.
- `src/components/AdminHeader.tsx` — shared header for all admin pages. Add new pages by rendering `<AdminHeader onLogout={...} />` — do not write inline headers.
- `src/views/UsersView.tsx` — inline modal components (`ModalOverlay`, `LabeledInput`, `ModalActions`).

**CSP hash for inline dark-mode script** — `admin/nginx.conf` uses `script-src 'self' 'sha256-...'`. **If the inline script in `admin/frontend/index.html` changes, recompute the SHA-256 hash in `admin/nginx.conf`**, or browsers silently block it (flash-of-light-mode, no console error in strict CSP). Recompute: `python3 -c "import hashlib,base64,re; s=open('admin/frontend/index.html').read(); m=re.search(r'<script>(.*?)</script>',s,re.DOTALL); print('sha256-'+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode())"`

**Viewport:** `index.html` uses `viewport-fit=cover` — required because admin runs in browser (not standalone PWA), so `env(safe-area-inset-bottom)` returns a non-zero value. The main app's "do not re-add viewport-fit=cover" applies only to `frontend/index.html`.

**`pb-safe` utility** — `max(1rem, env(safe-area-inset-bottom, 0px))` inside `@layer utilities` in `index.css`. The `@layer utilities` wrapper is required or Tailwind overrides it. Apply to any fixed footer that would overlap the iPhone home indicator.

**`html, body, #root { height: 100%; overflow: hidden }`** in `index.css` — required for full-viewport mobile layout without document-level scroll.

**SPA routing** — no router library; sub-pages detected via `window.location.pathname`. Auth check in `App.tsx` must always run before pathname-based render branches — rendering a sub-page before `authed` resolves bypasses the login gate.
