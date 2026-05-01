# Security Audit 2 — DrinkLog PWA

**Date:** 2026-05-01
**Scope:** JWT/auth flow, DEBUG flag, admin isolation, SQLAlchemy queries, nginx headers, service worker cache, dependency CVEs
**Auditor:** Manual review + automated scanning (pip-audit, npm audit)

---

## Critical

None found.

---

## High

### H1 — Service worker caches auth endpoints, enabling phantom sessions offline

**Affected:** `frontend/vite.config.ts:36`

The Workbox `NetworkFirst` URL pattern `/^\/api\/.*/` matches every `/api/*` request, including `/api/auth/refresh` and `/api/auth/me`. After a user authenticates and browses the app, both responses are written to the `api-cache` Cache Storage bucket. On logout, `queryClient.clear()` runs (`App.tsx:39`) but the service worker cache is not touched.

If the device then goes offline (or network latency exceeds the 10-second fallback), a new visitor opening the app triggers `refreshAccessToken()` — which the service worker answers with the prior user's cached refresh response. `refreshAccessToken()` returns `true`, the stale access token is set in memory, `/api/auth/me` is answered from cache with the prior user's username, `setUsername()` is called, and the app renders fully without ever showing `<LoginView>`. All data endpoints are also served from cache.

**Reproduction:** Log in, browse all four tabs. Log out. Take the device offline. Open the app URL — the app renders as the previous user without a login prompt.

**Fix — apply both parts:**

`vite.config.ts:36` — exclude auth endpoints from the cache pattern:
```js
urlPattern: /^\/api\/(?!auth\/).*/,   // exclude /api/auth/*
```

`App.tsx:39` — clear the SW cache alongside the React Query cache:
```js
if (!username) {
  queryClient.clear()
  caches.delete('api-cache')
}
```

---

### H2 — PyJWT CVE-2026-32597

**Affected:** `backend/requirements.txt`, `admin/backend/requirements.txt` — `PyJWT==2.10.1`

A known CVE exists against PyJWT 2.10.1. The specific vulnerability class is not publicly documented at the time of this review, but PyJWT is the library that signs and verifies every access token and refresh token in both backends. It sits on the authentication critical path for every authenticated request. The risk of not upgrading outweighs the risk of a minor version bump.

**Fix:** `PyJWT==2.10.1` → `PyJWT==2.12.0` in both requirements files. No breaking API changes in the 2.x series.

---

### H3 — Starlette CVE-2024-47874 and CVE-2025-54121

**Affected:** `backend/requirements.txt`, `admin/backend/requirements.txt` — `starlette==0.38.6` (transitive via `fastapi==0.115.0`)

Two CVEs against Starlette, FastAPI's underlying ASGI framework:
- **CVE-2024-47874** (fix: 0.40.0): DoS via crafted `multipart/form-data` requests causing unbounded memory consumption in Starlette's multipart parser. Not directly reachable in this app — no endpoint declares `Form()` parameters or `UploadFile`; all request bodies are JSON and FastAPI rejects unexpected content types before the multipart parser is reached.
- **CVE-2025-54121** (fix: 0.47.2): Vulnerability class not publicly documented at time of review.

Starlette is on the request-handling critical path for every API call regardless of reachability of the specific vulnerable code paths.

**Fix:** Starlette is pinned transitively by FastAPI. Upgrade `fastapi` to the latest stable release; it will pull a compatible starlette version. Getting to starlette 0.47.2 requires a substantially newer FastAPI than 0.115.0 — run the test suite after upgrading.

---

## Medium

### M1 — `fraction` field accepts out-of-range float values

**Affected:** `backend/schemas.py:69` (`DrinkEntryCreate`), `backend/schemas.py:151` (`CaffeineEntryCreate`)

Every other numeric field in both schemas has explicit bounds (`ml: Field(gt=0, le=5000)`, `abv: Field(ge=0, le=100)`, `mg: Field(gt=0, le=2000)`). `fraction` has none:

```python
fraction: Optional[float] = None
```

The ORM property in `shared/models.py` multiplies `fraction` directly into the unit calculation with no clamping. An authenticated user can submit:
- `fraction=-1` → negative `standard_units`; the daily total decreases rather than increases
- `fraction=0` → zero units recorded regardless of `ml`/`abv`; the drink is silently hidden from all summaries
- `fraction=50` → 50× multiplier; distorts chart data

The `/entries/summary` SQL aggregation uses `COALESCE(fraction, 1.0)` without bounds, so invalid values propagate into all chart queries.

**Fix:** `backend/schemas.py:69` and `:151`:
```python
fraction: Optional[float] = Field(default=None, ge=0, le=1)
```

---

### M2 — Admin ports exposed to internet if iptables rules are absent

**Affected:** `docker-compose.yml:38, 51`; `Makefile:6–7`

Both admin services bind to `0.0.0.0`:
```yaml
ports:
  - "8001:8000"   # admin-backend
  - "8002:8080"   # admin-frontend
```

The sole protection against internet access is the host-level `DOCKER-USER` iptables rules documented in CLAUDE.md. Nothing in the repository verifies these rules exist before the stack starts — no systemd dependency, no Makefile pre-check, no in-app IP allowlist. If the server reboots and `netfilter-persistent` is not installed or its service fails to run before Docker, port 8001 is open to the internet. The remaining protection is a single-factor password and a 5/minute rate limit with no account lockout.

**Fix 1 — add iptables liveness check to `make prod`:**
```makefile
prod:
	@iptables -L DOCKER-USER -n 2>/dev/null | grep -q 'ctorigdstport 8001' || \
		{ echo "ERROR: DOCKER-USER rule for port 8001 missing. See CLAUDE.md."; exit 1; }
	@iptables -L DOCKER-USER -n 2>/dev/null | grep -q 'ctorigdstport 8002' || \
		{ echo "ERROR: DOCKER-USER rule for port 8002 missing. See CLAUDE.md."; exit 1; }
	docker compose up --build -d
```

Note: `127.0.0.1:` port binding is not a viable alternative here — Tailscale traffic arrives via the `tailscale0` interface with a routed Tailscale IP, not loopback, so loopback binding would block legitimate Tailscale access.

**Fix 2 — add account lockout on the admin login endpoint** (`admin/backend/routers/admin.py:48`):

The current `@limiter.limit("5/minute")` allows 300 attempts per hour indefinitely. Add a short-term lockout (e.g. via a Redis or in-memory counter) after N consecutive failures per IP to raise the cost of brute-force to an impractical level. Alternatively, record failed attempts and respond with a progressively longer `Retry-After`.

---

### M3 — Service worker `api-cache` not cleared on logout

**Affected:** `frontend/src/App.tsx:38–40`

On logout (or any transition to `username === null`), `queryClient.clear()` clears React Query's in-memory store but the Workbox `api-cache` Cache Storage bucket is not touched. Cached responses — entries, templates, summary data — remain on the device after logout. This is the prerequisite for the phantom-session scenario described in H1, and is independently a data-at-rest concern on shared devices.

**Fix:** `App.tsx:39`:
```js
if (!username) {
  queryClient.clear()
  caches.delete('api-cache')
}
```

---

### M4 — CSP missing `object-src 'none'` and `base-uri 'self'`

**Affected:** `nginx.conf:12`, `admin/nginx.conf:12`

Two standard CSP hardening directives are absent from both configs.

**`object-src`** is unset, so it falls back to `default-src 'self'` — allowing `<object>` and `<embed>` elements served from the same origin. Neither app uses these elements.

**`base-uri`** is unset. An injected `<base href="https://attacker.com">` tag (XSS prerequisite) would redirect all relative resource fetches to the attacker's origin. This affects any relative URL in the page, including dynamically constructed API calls. Neither ZXing nor Tailwind requires a permissive `base-uri`.

**Fix:** Append to the `Content-Security-Policy` value in both nginx configs:
```
object-src 'none'; base-uri 'self';
```

---

## Low

### L1 — `custom_name` field has no length constraint

**Affected:** `backend/schemas.py:65, 78, 148, 160`

`custom_name: Optional[str] = None` across all four schemas that accept it. The value is safely parameterized in all ORM queries — no injection risk. However, an authenticated user can submit an arbitrarily large string that is stored verbatim, returned in paginated list responses, and included in confirm-all promotion queries. No column-level length constraint exists in the database schema either.

**Fix:**
```python
custom_name: Optional[str] = Field(default=None, max_length=200)
```
Apply to `DrinkEntryCreate`, `DrinkEntryUpdate`, `CaffeineEntryCreate`, `CaffeineEntryUpdate`.

---

### L2 — Dev nginx open redirect via unvalidated `$host`

**Affected:** `nginx.dev.conf.template:23`

The HTTP→HTTPS redirect block:
```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```
has no `server_name` restriction. `$host` is populated from the incoming `Host` header. A request with `Host: evil.com` produces `301 https://evil.com/...`. Exploitation requires a Tailscale peer (the dev config is Tailscale-only) and the attacker would be redirecting themselves, so practical risk is minimal. Trivially fixed.

**Fix:** Replace `$host` with the literal template variable already in scope:
```nginx
return 301 https://${TAILSCALE_HOSTNAME}$request_uri;
```

---

### L3 — Nginx configs have no dotfile deny rule

**Affected:** `nginx.conf`, `admin/nginx.conf`

Neither config contains a `location ~ /\.` deny block. Currently safe by construction — `root /usr/share/nginx/html` contains only the compiled Vite `dist/` output, no dotfiles. However, there is no explicit barrier: if a dotfile ever ended up in the dist output (e.g. a misconfigured build step copying a `.env` adjacent to assets), nginx would serve it.

**Fix:** Add to both configs, before the `location /` block:
```nginx
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}
```

---

### L4 — Service worker timeout too long and no cache expiry

**Affected:** `frontend/vite.config.ts:39–43`

`networkTimeoutSeconds: 10` is generous for a LAN/Tailscale deployment where round-trips are typically single-digit milliseconds. On a degraded connection that stays alive long enough to timeout, stale cached responses are served while a live request is in-flight. No `expiration` is set, so `api-cache` grows unbounded and entries never expire.

**Fix:**
```js
options: {
  cacheName: 'api-cache',
  networkTimeoutSeconds: 5,
  expiration: { maxEntries: 50, maxAgeSeconds: 300 },
}
```

---

### L5 — pytest CVE-2025-71176 (test dependency only)

**Affected:** `backend/requirements.txt`, `admin/backend/requirements.txt` — `pytest==8.3.3`

Known CVE in pytest, fix available at 9.0.3. pytest is never invoked in the deployed application — it is a test runner only, absent from all Docker image execution paths. Zero production risk.

**Fix:** `pytest==8.3.3` → `pytest==9.0.3` in both requirements files.

---

### L6 — serialize-javascript HIGH CVE via vite-plugin-pwa (build-time only)

**Affected:** `frontend/package.json` — `vite-plugin-pwa@^0.20.1` → `workbox-build` → `@rollup/plugin-terser` → `serialize-javascript ≤7.0.4`

npm audit reports two HIGH CVEs: GHSA-5c6j-r48x-rmvq (RCE via crafted RegExp/Date objects) and GHSA-qj8w-gfj5-8c6v (CPU exhaustion). Both affect `serialize-javascript`, which is invoked by terser during `npm run build` to serialize AST nodes. It processes the project's own source code — not network input. Neither CVE is reachable in the deployed application. The "RCE" would require an attacker to inject malicious code into the source files being compiled.

**Fix:** `npm audit fix --force` upgrades `vite-plugin-pwa` to `1.2.0` (breaking change — major version jump from 0.20.1). Review the `workbox` config in `vite.config.ts` against the 1.x migration guide before applying; the `runtimeCaching` API changed between major versions.

---

## Informational

### I1 — `POST /auth/logout` requires no authentication

**Affected:** `backend/routers/auth.py:101`

The logout endpoint has no `Depends(get_current_user)`. It reads the `refresh_token` cookie and attempts to delete the corresponding jti from the `refresh_tokens` table. Without a valid cookie, the DB delete finds nothing and returns 200. An unauthenticated caller cannot invalidate another user's session — the endpoint is a no-op without a matching cookie. Not exploitable, but logout events are not auditable (cannot be attributed to an authenticated identity).

**Fix (optional):** Add `Depends(get_current_user)` if audit logging of logout events becomes a requirement. No security impact otherwise.

---

### I2 — `DEBUG=true` in `docker-compose.dev.yml` bypasses JWT secret startup validation

**Affected:** `docker-compose.dev.yml:6, 10`; `backend/main.py:20–26`; `admin/backend/main.py:16–20`; `.env.example`

Both backends skip JWT secret startup validation when `DEBUG=true`. If the dev compose file were accidentally used on the production server, both backends start with ephemeral `secrets.token_hex(32)` secrets — different on every restart, invalidating all sessions. This does not weaken signature verification or algorithm enforcement; it only makes sessions non-persistent.

**Recommended fixes:**
1. Add `DEBUG=false` with a prominent comment to `.env.example` making it explicit this must never be `true` in production.
2. Consider renaming `docker-compose.dev.yml` to `docker-compose.override.yml.dev` or moving it to a `dev/` subdirectory so it cannot be picked up by a plain `docker compose up`.

---

### I3 — All four Docker services share one bridge network

**Affected:** `docker-compose.yml:61–63`

`frontend`, `backend`, `admin-backend`, and `admin-frontend` are all on the single `internal` bridge network. The frontend nginx container can resolve and reach `admin-backend` by hostname. The current `nginx.conf` contains no `proxy_pass` to `admin-backend` — but if the config were misconfigured, admin routes could be exposed through port 80 with no additional barrier.

**Fix (hardening):** Define a separate `admin-internal` network for `admin-backend` and `admin-frontend`, removing them from the `internal` network shared with the public-facing frontend. This makes any accidental cross-proxy physically impossible at the network layer rather than relying solely on nginx config correctness.

---

### I4 — f-strings used in migration `text()` SQL calls

**Affected:** `backend/main.py:61, 66, 106, 108–110, 121, 127, 133–135, 145, 148, 159, 164–166, 175, 188`

The `_migrate()` and `_migrate_user_id_columns()` functions build raw SQL strings via f-string interpolation and execute them through SQLAlchemy's `text()`. All interpolated values (table names, index names) originate from hardcoded Python lists in the same file — never from user input or runtime data. Not exploitable. The pattern is worth noting because copying it elsewhere with a non-hardcoded source would introduce SQL injection.

---

### I5 — esbuild/vite moderate CVE (dev server only)

**Affected:** `frontend/node_modules`, `admin/frontend/node_modules` — `esbuild ≤0.24.2`

GHSA-67mh-4wv8-2f99: esbuild's built-in dev server accepts cross-origin requests, allowing any website to issue requests to it and read responses. Applies only when running `npm run dev`. The production build is served by nginx with correct CSP and no esbuild dev server. Not relevant to the deployed application.
