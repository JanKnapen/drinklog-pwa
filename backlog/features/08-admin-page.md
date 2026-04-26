# Feature: Isolated Admin Page (Custom React)

## Context
Administrative tasks (user creation, password management, data browsing) are handled through a dedicated interface that is physically isolated from the public-facing app. It runs in its own Docker services, is never exposed through the Cloudflared tunnel, and is protected by a separate master password. It shares the same SQLite database volume as the main app.

## Goals
1. Create a fully isolated admin service (separate backend + frontend containers) on a local-only port.
2. Implement a custom React-based Admin UI with its own Vite build.
3. Provide user management to support Feature 07 authentication.
4. Lay the groundwork for future data injection/import tools.

---

## Infrastructure Requirements

### 1. Docker Service Isolation
- **`admin-backend`**: Second FastAPI instance (`admin/backend/`). Exposed on host port `8001` only — no Cloudflared tunnel mapping. Shares the `drinklog-data` named volume (same `/data/drinklog.db`).
- **`admin-frontend`**: Separate Nginx container serving its own Vite/React build (`admin/frontend/`). Exposed on host port `8002` only. Proxies `/api/` to `admin-backend:8001` via the internal Docker network.
- **Networking**: Both admin services join the existing `internal` bridge network so they can reach the database volume, but their ports (`8001`, `8002`) are bound to `127.0.0.1` only in `docker-compose.yml` — not accessible from outside the host.
- **Shared Storage**: `admin-backend` mounts `drinklog-data` at `/data/` read-write. SQLAlchemy models are shared via a top-level `shared/` directory (`shared/models.py`) that is bind-mounted into both the main backend and admin backend containers at build time — this is the single source of truth for the schema.

### 2. Admin Authentication
- Access is protected by `ADMIN_MASTER_PASSWORD` environment variable — a single shared secret for admin access, independent of user accounts.
- Login issues a short-lived admin session token (1 hour, in-memory on the server — a simple signed JWT is fine, no DB storage needed). The token is stored in `sessionStorage` on the frontend (tab-close = logged out, intentional).
- The admin session token is completely separate from the main app's user JWTs — the admin backend does not call `get_current_user` from the main app.

---

## Backend Requirements (`admin/backend/`)

### 1. Shared Models
- Import `User`, `DrinkEntry`, `DrinkTemplate`, `CaffeineEntry`, `CaffeineTemplate` from `shared/models.py` (mounted at `/app/shared/models.py` in both backend containers). Do not redefine them — schema drift between main and admin backends is not acceptable.
- `shared/models.py` is the single source of truth. The main backend's `models.py` is replaced by (or re-exports from) this shared file as part of Feature 08 setup.
- Connect to the same `DATABASE_URL` (pointing at `/data/drinklog.db`).
- The admin backend does **not** run `_migrate()` — migration is the main backend's responsibility.

### 2. Endpoints
- **POST `/api/admin/login`**: Validates `ADMIN_MASTER_PASSWORD`, returns a signed 1-hour JWT. Rate limited to 5 attempts per minute per IP (`slowapi`).
- **GET `/api/admin/users`**: Lists all users (`id`, `username`, entry counts per module).
- **POST `/api/admin/users`**: Creates a new user. Accepts `username` + `password`, hashes with bcrypt, inserts into `User` table. Returns 409 if username already exists.
- **PATCH `/api/admin/users/{user_id}/password`**: Changes a user's password. Accepts `new_password`, re-hashes and updates.
- **DELETE `/api/admin/users/{user_id}`**: Deletes a user and all their associated entries and templates (explicit cascade, not DB-level).
- **GET `/api/admin/entries`**: Returns paginated entries across all users. Supports query params: `username`, `module` (`alcohol` | `caffeine`), `date_from`, `date_to`, `offset`, `limit` (max 100).

All endpoints except `/api/admin/login` require the admin session token via `Authorization: Bearer`.

---

## Frontend Requirements (`admin/frontend/`)

Standalone Vite + React 18 + TypeScript + TailwindCSS project. No shared code with the main frontend — this is intentional to keep the two builds fully decoupled.

### 1. Login Screen
- Simple centered form: master password input + submit.
- On success, stores the admin session token in `sessionStorage` and renders the admin dashboard.
- On failure, shows an inline error. No toast system needed.

### 2. User Management
- Table view: username, alcohol entry count, caffeine entry count, actions.
- **Create User** form (modal): username + password fields. Submits to `POST /api/admin/users`.
- **Change Password** (per row): opens a modal with a new password field. Submits to `PATCH /api/admin/users/{id}/password`.
- **Delete User** (per row): confirmation dialog before calling `DELETE /api/admin/users/{id}`. Clearly states that all their data will be deleted.

### 3. Data Browser (Read-Only)
- Tabbed view: Alcohol / Caffeine.
- Filterable by username and date range.
- Paginated table showing entry timestamp, user, name, value (standard units or mg), confirmed status.
- No editing — read-only for now.

### 4. Data Injection (Framework Only)
- A placeholder "Import" section with a file upload input (CSV / JSON).
- On upload, sends the file to a stub endpoint that returns a dry-run validation result (list of rows, matched/unmatched template names, projected row count).
- No commit path yet — this is scaffolding for a future feature.

---

## Success Criteria
- [ ] Admin services are not reachable from the public Cloudflare URL.
- [ ] Admin login is rate-limited and protected by `ADMIN_MASTER_PASSWORD`.
- [ ] Admin can create a new user who can immediately log into the main PWA.
- [ ] Admin can change a user's password and delete a user with all their data.
- [ ] Data browser shows entries across all users with working filters.
- [ ] Main app and admin backend share the same `models.py` — no schema duplication.
- [ ] Admin session expires on tab close (sessionStorage) and after 1 hour server-side.
