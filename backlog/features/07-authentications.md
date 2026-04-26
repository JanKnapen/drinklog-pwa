# Feature: Production Authentication (JWT)

## Context
Transitioning from a "no-auth" local setup to a production-ready system. Authentication is managed internally via JWT (JSON Web Tokens). Users are pre-created via the Admin Page (Feature 08), with a seed mechanism to bootstrap the first user. All existing data is migrated to the seed user on first startup.

## Goals
1. Secure all app endpoints with JWT authentication and per-user data isolation.
2. Implement a seamless silent token refresh — friends never see a login screen unless inactive for 30 days.
3. Protect tokens against XSS using httpOnly cookies for the refresh token.
4. Implement rate limiting on login to prevent brute force attacks.
5. Display the username in the app settings.

---

## Token Architecture

Two-token pattern:

- **Access token** — short-lived (15 minutes), returned in the login response body, kept in memory only (never written to localStorage or a cookie). Injected as `Authorization: Bearer <token>` on every API request.
- **Refresh token** — long-lived (30 days), set by the server as an `httpOnly; SameSite=Strict; Secure` cookie. JavaScript cannot read it. Used exclusively by `/api/auth/refresh` to issue a new access token silently.

On app load, `client.ts` immediately calls `/api/auth/refresh`. If the cookie is present and valid, a fresh access token is returned and the app proceeds normally — no login screen. If the cookie is absent or expired (user inactive >30 days), the login view is shown.

---

## Backend Requirements

### 1. Database & Security
- **User Model:** Add `User` table to `models.py` with `id`, `username`, and `hashed_password`.
- **Hashing:** Use `passlib[bcrypt]` for password storage.
- **JWT:** Use `python-jose[cryptography]` for token generation/validation. Separate secrets and expiries for access and refresh tokens.
- **Migration:** `_migrate()` (runs on every startup, idempotent) adds `user_id` FK column to `DrinkEntry`, `DrinkTemplate`, `CaffeineEntry`, `CaffeineTemplate`. All existing rows are assigned to the seed user's ID.

### 2. Seed Mechanism
- On startup, if the `User` table is empty, create a user from `ADMIN_SEED_USERNAME` and `ADMIN_SEED_PASSWORD` env vars.
- If either env var is unset and the table is empty, log a warning and refuse to start — the app would be locked with no way in.
- Once at least one user exists, seed env vars are ignored.

### 3. Endpoints
- **POST `/api/auth/login`**:
  - Validates username/password.
  - Returns access token in response body (`{ access_token, token_type, username }`).
  - Sets refresh token as `httpOnly; SameSite=Strict; Secure` cookie (`refresh_token`, 30-day max-age).
  - **Rate Limiting:** `slowapi` — 5 attempts per minute per IP.
- **POST `/api/auth/refresh`**:
  - Reads `refresh_token` cookie (no request body needed).
  - Returns a new access token in response body.
  - Returns 401 if cookie is absent, expired, or invalid.
- **POST `/api/auth/logout`**:
  - Clears the `refresh_token` cookie by setting it with max-age=0.
  - No body required; always returns 200.
- **GET `/api/auth/me`**: Returns `{ username }` for the current user. Requires valid access token.

### 4. Protection Layer
- Create `get_current_user` dependency that validates the `Authorization: Bearer` header.
- Apply to all existing routers: `entries`, `templates`, `caffeine_entries`, `caffeine_templates`, `barcode`.
- All queries in those routers gain a `WHERE user_id = current_user.id` filter — no cross-user data leakage is possible.

### 5. Per-User Data Isolation
Every data table gets a non-nullable `user_id` INTEGER FK to `User.id`. Cascade delete is not applied — admin deletion of users is handled explicitly in the admin backend (Feature 08). Routers enforce isolation via the `get_current_user` dependency; no query may omit the `user_id` filter.

---

## Frontend Requirements

### 1. Token Storage & `client.ts`
- Access token lives in a module-level variable in `client.ts` — never written to localStorage or any cookie.
- `apiFetch<T>()` injects `Authorization: Bearer <token>` automatically.
- On 401 response: attempt one silent refresh via `POST /api/auth/refresh`. If refresh succeeds, retry the original request. If refresh fails, clear the in-memory token and redirect to login.
- Exported helpers: `setAccessToken(token: string)`, `clearAccessToken()`, `refreshAccessToken(): Promise<boolean>`.

### 2. App Startup Flow
In `App.tsx`, before rendering any tab:
1. Call `refreshAccessToken()`.
2. If it returns `true`, render the app normally.
3. If it returns `false`, render `<LoginView />`.
4. Show a neutral loading state during this check to avoid a flash of the login screen for users with a valid cookie.

### 3. Login Experience
- `LoginView.tsx` uses existing `FormFields.tsx` primitives (`Field`, `inputCls`, `primaryBtn`).
- On submit: `POST /api/auth/login`, call `setAccessToken()` with the returned token, transition to the main app.
- Show inline error on invalid credentials (no toast — the view is already isolated).

### 4. Settings Integration
- `SettingsContext` stores `username` (populated from `/api/auth/me` after login or refresh).
- `SettingsModal` displays "Logged in as [username]" at the top.
- "Logout" button calls `POST /api/auth/logout`, then `clearAccessToken()`, then renders `<LoginView />`.

---

## Success Criteria
- [ ] No data can be retrieved without a valid access token.
- [ ] Brute force attempts on login are throttled by the server.
- [ ] Users with a valid refresh token cookie never see the login screen on app open.
- [ ] Users inactive for >30 days are shown the login screen and can log back in themselves.
- [ ] Refresh token is `httpOnly` — not readable by JavaScript.
- [ ] Each user sees only their own entries and templates.
- [ ] Existing data is migrated to the seed user without data loss.
- [ ] Username is visible in the Settings modal with a working Logout button.
