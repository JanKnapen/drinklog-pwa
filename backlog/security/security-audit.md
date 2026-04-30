# Security Audit — DrinkLog PWA

**Date:** 2026-04-26  
**Scope:** Full codebase review before public exposure via Cloudflare Tunnel  
**Deployment context:** Main app (port 80) tunneled via cloudflared; admin (ports 8001/8002) Tailscale-only; multi-user (friends + potential app store)

---

## Priority summary

| # | Severity | Issue | File(s) |
|---|----------|-------|---------|
| 1 | CRITICAL | Admin ports exposed to public internet | `docker-compose.yml:38,51` |
| 2 | CRITICAL | No security headers in nginx | `nginx.conf`, `admin/nginx.conf` |
| 3 | CRITICAL | Template name/barcode DB uniqueness is global, not per-user | `shared/models.py:27,31,74,77` |
| 4 | HIGH | CORS wildcard methods and headers | `backend/main.py:109-110`, `admin/backend/main.py:27-28` |
| 5 | HIGH | JWT secrets silently fall back to random values | `backend/config.py:12-13` |
| 6 | HIGH | Barcode rate limit too loose for external API calls | `backend/routers/barcode.py:228` |
| 7 | HIGH | `_check_barcode_cross_module` not scoped to user | `backend/routers/templates.py:16`, `caffeine_templates.py` equivalent |
| 8 | MEDIUM | No password minimum length enforced | `backend/schemas.py:167`, `admin/backend/routers/admin.py` |
| 9 | MEDIUM | No numeric bounds on ml/abv/mg | `backend/schemas.py:29-33,62-68,113-116,143-146` |
| 10 | MEDIUM | No refresh token rotation | `backend/routers/auth.py:37-56` |
| 11 | MEDIUM | Admin frontend: expired token causes errors, not redirect to login | `admin/frontend/src/api/client.ts` |
| 12 | LOW | Containers run as root | `backend/Dockerfile`, `admin/backend/Dockerfile` |
| 13 | LOW | No request body size limits | nginx configs |
| 14 | LOW | No audit log for admin operations | `admin/backend/routers/admin.py` |
| 15 | LOW | Silent exception swallowing in barcode strategies 1 and 2 | `backend/routers/barcode.py:107-108,128-129` |

---

## CRITICAL

### 1. Admin ports exposed to public internet

**File:** `docker-compose.yml:38,51`

```yaml
admin-backend:
  ports:
    - "8001:8000"   # binds to 0.0.0.0 — public internet can reach this

admin-frontend:
  ports:
    - "8002:80"     # same
```

cloudflared only tunnels what you configure (port 80 for the main app). Ports 8001 and 8002 remain open on the server's public IP regardless. Anyone on the internet can reach the admin login and brute-force the master password.

**Fix — bind to localhost, allow Tailscale via firewall:**

Step 1 — change docker-compose.yml to bind to 127.0.0.1 only:
```yaml
ports:
  - "127.0.0.1:8001:8000"
  - "127.0.0.1:8002:80"
```

Step 2 — on the host, allow ports 8001/8002 from Tailscale's CGNAT range only:
```bash
sudo ufw allow in on tailscale0 to any port 8001
sudo ufw allow in on tailscale0 to any port 8002
```
(The Tailscale interface is named `tailscale0` by default. Verify with `ip link show`.)

After this, you reach admin at `http://<tailscale-ip>:8001` / `:8002` when on Tailscale, and it is completely unreachable from the public internet.

---

### 2. No security headers in nginx

**File:** `nginx.conf` (main app), `admin/nginx.conf`

Neither config sends any security headers. On a public HTTPS domain this exposes users to clickjacking, MIME-sniffing, and limits your ability to enforce CSP.

**Fix — add to both nginx configs (inside the `server {}` block, before `location` blocks):**

```nginx
# Prevent MIME-type sniffing
add_header X-Content-Type-Options "nosniff" always;

# Deny embedding in iframes (clickjacking)
add_header X-Frame-Options "DENY" always;

# Strict referrer — don't leak URL to third parties
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Permissions policy — disable features the app doesn't use
add_header Permissions-Policy "geolocation=(), payment=(), usb=()" always;

# Content Security Policy
# Notes:
#   - 'unsafe-inline' for style-src is required by Tailwind (injects inline styles)
#   - 'wasm-unsafe-eval' for script-src is required by ZXing barcode scanner (WebAssembly)
#   - connect-src must include your Cloudflare hostname in production
#   - media-src 'self' allows camera stream (getUserMedia)
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  media-src 'self' blob:;
  worker-src 'self' blob:;
  frame-ancestors 'none';
" always;
```

Notes:
- HSTS (`Strict-Transport-Security`) is handled by Cloudflare for the main app — you do not need it in nginx for port 80.
- The admin interface (behind Tailscale) should also get these headers since it handles sensitive user management operations.
- After deploying, verify with [securityheaders.com](https://securityheaders.com) or `curl -I https://your-domain`.
- The CSP `connect-src 'self'` will block the barcode endpoint's external fetches only if the browser made them directly — it doesn't. The barcode calls happen server-side (Python httpx), so CSP doesn't restrict them.
- If you add any CDN-hosted fonts or scripts later, update connect-src/font-src accordingly.

---

### 3. Template name/barcode DB uniqueness is global, not per-user

**File:** `shared/models.py:27,31,74,77`

```python
class DrinkTemplate(Base):
    name: Mapped[str] = mapped_column(String, unique=True, ...)      # global unique
    barcode: Mapped[str | None] = mapped_column(String, unique=True, ...)  # global unique

class CaffeineTemplate(Base):
    name: Mapped[str] = mapped_column(String, unique=True, ...)      # global unique
    barcode: Mapped[str | None] = mapped_column(String, unique=True, ...)  # global unique
```

The application-level checks in `templates.py` correctly filter by `user_id`, so the 409 responses are user-scoped. But if two users simultaneously try to create a template with the same name, one will get an unhandled `IntegrityError` from the DB constraint instead of a clean 409. More practically: once you add friends, User A and User B cannot both have a template named "Coffee" or "Heineken" — the second user to create it gets a 500.

The cross-module barcode check in `templates.py:16` (and its caffeine equivalent) also doesn't filter by user_id:
```python
def _check_barcode_cross_module(barcode: str | None, db: Session) -> None:
    if db.query(CaffeineTemplate).filter(CaffeineTemplate.barcode == barcode).first():
        raise HTTPException(409, ...)
```
User A's caffeine template barcode blocks User B from using the same barcode in alcohol. Barcodes are globally unique by product in the real world, so this cross-module check makes sense — but it shouldn't cross users.

**Fix — three parts:**

Part 1 — `shared/models.py`: remove column-level `unique=True` from name and barcode on both template models:
```python
name: Mapped[str] = mapped_column(String, nullable=False)           # remove unique=True
barcode: Mapped[str | None] = mapped_column(String, nullable=True)  # remove unique=True
```

Part 2 — `backend/main.py` `_migrate()`: add composite unique indexes:
```python
# Per-user name uniqueness
conn.execute(text(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_drink_templates_user_name "
    "ON drink_templates(user_id, name)"
))
conn.execute(text(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_caffeine_templates_user_name "
    "ON caffeine_templates(user_id, name)"
))
# Per-user barcode uniqueness (partial — NULL barcodes are exempt)
conn.execute(text(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_drink_templates_user_barcode "
    "ON drink_templates(user_id, barcode) WHERE barcode IS NOT NULL"
))
conn.execute(text(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_caffeine_templates_user_barcode "
    "ON caffeine_templates(user_id, barcode) WHERE barcode IS NOT NULL"
))
```

Part 3 — `_check_barcode_cross_module` in both `routers/templates.py` and `routers/caffeine_templates.py`: add the calling user as a parameter and filter by it:
```python
def _check_barcode_cross_module(barcode: str | None, db: Session, user_id: int) -> None:
    if not barcode:
        return
    if db.query(CaffeineTemplate).filter(
        CaffeineTemplate.barcode == barcode,
        CaffeineTemplate.user_id == user_id,
    ).first():
        raise HTTPException(status_code=409, detail="...")
```

Note: the existing global `uq_drink_templates_barcode` and `uq_caffeine_templates_barcode` partial indexes (created by the current `_migrate()`) need to be dropped as part of this migration, since they enforce global uniqueness. SQLite doesn't support `DROP INDEX IF NOT EXISTS` inline — check for their existence via `inspector.get_indexes(table)` first.

---

## HIGH

### 4. CORS allows wildcard methods and headers

**File:** `backend/main.py:109-110`, `admin/backend/main.py:27-28`

```python
allow_methods=["*"],
allow_headers=["*"],
```

You know exactly what the frontend needs. Wildcards are unnecessary and slightly expand the attack surface by allowing arbitrary methods and headers from any ALLOWED_ORIGINS domain.

**Fix:**
```python
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
allow_headers=["Content-Type", "Authorization"],
allow_credentials=False,  # no cookies sent cross-origin; credentials: 'include' is same-origin only
```

Note: `allow_credentials=True` would be needed only if you call the API cross-origin with cookies. Since cloudflared proxies the same origin, same-origin requests don't use CORS at all. The CORS config only matters if you ever call the API from a different domain.

---

### 5. JWT secrets silently fall back to random values

**File:** `backend/config.py:12-13`

```python
JWT_ACCESS_SECRET = os.getenv("JWT_ACCESS_SECRET", secrets.token_hex(32))
JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", secrets.token_hex(32))
```

If the env vars aren't set in `.env`, the app starts silently with per-process random secrets. Every container restart (crash, deploy, Docker daemon restart) generates new secrets and logs every user out. There is no warning or error — it just silently works until the next restart.

**Fix — add startup validation in `backend/main.py` (before `_migrate()`):**
```python
import os
_missing = [k for k in ("JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET") if not os.getenv(k)]
if _missing:
    raise RuntimeError(
        f"Required env vars not set: {', '.join(_missing)}. "
        "Set them in .env to prevent users being logged out on every restart."
    )
```

Same pattern for `ADMIN_JWT_SECRET` in `admin/backend/main.py` (it already checks `ADMIN_MASTER_PASSWORD`, so follow that pattern).

---

### 6. Barcode rate limit too permissive for external API calls

**File:** `backend/routers/barcode.py:228`

```python
@limiter.limit("60/minute", key_func=user_key)
async def lookup_barcode(...):
```

60 requests/minute is the same limit as create/update mutations, but each barcode lookup fires HTTP requests to `world.openfoodfacts.org` and/or `api.ah.nl`. Strategy 3 (hybrid) fires both in parallel. At 60/min, one user can generate up to 120 outbound requests/minute to external APIs, risking your server IP getting blocked by those services.

**Fix — lower the barcode-specific limit:**
```python
@limiter.limit("15/minute", key_func=user_key)
```
15/minute is more than enough for real scanning use; a human can't scan faster. If you later add caching (barcode results cached by code+module for 24h), you could raise it back.

---

### 7. `_check_barcode_cross_module` not scoped to user

Already described as Part 3 of fix #3 above. Listing separately here because it is a correctness bug independent of the DB constraint issue — it will cause incorrect 409 errors for User B when User A already has the same barcode on the other module.

**File:** `backend/routers/templates.py:13-17`, `backend/routers/caffeine_templates.py` (equivalent function)

---

## MEDIUM

### 8. No password minimum length

**File:** `backend/schemas.py:167`, `admin/backend/routers/admin.py` (user creation / password change)

`LoginRequest` has no validation on password length. More importantly, admin user creation and password-change endpoints accept any string, including `""` or `"a"`.

**Fix — add a Pydantic validator on the admin user creation and password change schemas:**
```python
from pydantic import field_validator

class UserCreate(BaseModel):
    username: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        return v
```

12 characters is a reasonable minimum for a self-hosted app. You could add complexity rules (mixed case, digit) but length alone is the most impactful control.

---

### 9. No numeric bounds on ml, abv, mg

**File:** `backend/schemas.py:29-33` (`DrinkTemplateCreate`), `62-68` (`DrinkEntryCreate`), `113-116` (`CaffeineTemplateCreate`), `143-146` (`CaffeineEntryCreate`)

Fields like `ml: float`, `abv: float`, `mg: float` have no bounds. The API will accept `abv: 999.0` or `ml: -500`. The UI prevents this, but the API doesn't. This produces garbage data and could produce calculation errors (negative standard_units etc.).

**Fix — use Pydantic `Field` with bounds:**
```python
from pydantic import Field

class DrinkTemplateCreate(BaseModel):
    name: str
    default_ml: float = Field(gt=0, le=5000)
    default_abv: float = Field(ge=0, le=100)

class DrinkEntryCreate(BaseModel):
    ml: float = Field(gt=0, le=5000)
    abv: float = Field(ge=0, le=100)
    ...

class CaffeineTemplateCreate(BaseModel):
    default_mg: float = Field(gt=0, le=2000)   # ~20 espressos; adjust if needed

class CaffeineEntryCreate(BaseModel):
    mg: float = Field(gt=0, le=2000)
```

---

### 10. No refresh token rotation

**File:** `backend/routers/auth.py:37-56`

The `/auth/refresh` endpoint issues a new access token but does not rotate the refresh token (no new cookie is set). A stolen 30-day refresh cookie remains valid for its full lifetime even after it has been used. Token rotation means issuing a new refresh token on every use and invalidating the old one.

Proper rotation requires a token store (a `refresh_tokens` table in the DB, keyed by jti claim). This is a moderate amount of work.

**Interim mitigation (low effort):** Reduce `REFRESH_TOKEN_EXPIRE_DAYS` default from 30 to 7 in `backend/config.py:15`. One week instead of one month limits the exposure window of a compromised cookie.

**Full fix (higher effort):** Add a `refresh_tokens` table, store the jti on issue, validate and delete it on use, and issue a fresh token. Reject any reuse of an already-consumed jti (this detects token theft because the attacker and the real user would both try to use the same token).

---

### 11. Admin frontend: expired token causes API errors instead of redirecting to login

**File:** `admin/frontend/src/api/client.ts`

The admin access token expires after 60 minutes. When it expires, `apiFetch` receives a 401 but there is no handler to clear the token from sessionStorage and redirect to the login view. The user sees a broken UI (or blank/error state) and has to manually refresh the page.

**Fix — in `admin/frontend/src/api/client.ts`, handle 401 explicitly:**
```typescript
const res = await fetch(path, { ...init, headers });
if (res.status === 401) {
    clearToken();
    window.location.reload();  // triggers App.tsx mount check → renders LoginView
    throw new ApiError(401, "Session expired");
}
```

---

## LOW

### 12. Containers run as root

**File:** `backend/Dockerfile`, `admin/backend/Dockerfile`, `frontend/Dockerfile`, `admin/frontend/Dockerfile`

No `USER` directive — containers run as root (uid 0). If there is a container escape, the attacker has root on the host.

**Fix — add to each Dockerfile before the final CMD:**
```dockerfile
RUN addgroup --system app && adduser --system --ingroup app app
USER app
```
For the backend, ensure the SQLite volume mount path is writable by this user (chown in the entrypoint or set appropriate volume permissions).

---

### 13. No request body size limits in nginx

**File:** `nginx.conf`, `admin/nginx.conf`

nginx's default `client_max_body_size` is 1MB. This is fine for normal use but worth making explicit and lowering for the API proxy to reduce DoS exposure.

**Fix — add inside the `server {}` block:**
```nginx
client_max_body_size 64k;
```
Most requests are tiny JSON payloads. 64KB is generous. The barcode endpoint doesn't receive large bodies; it only sends them to external APIs server-side.

---

### 14. No audit log for admin operations

**File:** `admin/backend/routers/admin.py`

User creation, password changes, and user deletion are not logged. If something goes wrong or you suspect abuse, there is no record of what happened or when.

**Fix — add structured logging to each admin endpoint:**
```python
import logging
logger = logging.getLogger(__name__)

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: int, ...):
    ...
    logger.warning("admin: deleted user id=%d username=%s", user.id, user.username)
```
Since this runs in Docker, logs appear in `docker compose logs admin-backend`.

---

### 15. Silent exception swallowing in barcode strategies 1 and 2

**File:** `backend/routers/barcode.py:107-108,128-129`

```python
except Exception:
    return BarcodeResult(source="not_found", actual_source="off")
```

Strategy 1 (OFF+) and Strategy 2 (AH) silently swallow all exceptions. Strategy 3 (hybrid) already logs them. If an external API changes its response format or returns an error, you will get silent `not_found` results with no diagnostic information.

**Fix:**
```python
except Exception as exc:
    logger.warning("OFF lookup failed for barcode %s: %s", code, exc)
    return BarcodeResult(source="not_found", actual_source="off")
```

---

## What is already done correctly

- **Bcrypt** for password hashing — not SHA1/MD5. Correct.
- **HTTPOnly + SameSite=strict + Secure** on refresh cookie — correct.
- **Two-token JWT pattern** with type claim validation (`type: "access"` vs `type: "refresh"`) — no token confusion attacks possible.
- **`get_current_user` dependency on every data endpoint** — no endpoint forgetting auth.
- **All data queries filtered by `current_user.id`** — no vertical privilege escalation, no cross-user data leakage.
- **Login rate-limited** to 5/minute per IP — brute-force resistant.
- **SQLAlchemy ORM throughout** — no raw SQL in application code, no SQL injection.
- **No `dangerouslySetInnerHTML`** anywhere in the React code — no reflected/stored XSS vectors.
- **Pydantic schemas** validate all inputs at the API boundary.
- **`module` query parameter validated** with regex `^(alcohol|caffeine)$` — no parameter injection.
- **`ADMIN_MASTER_PASSWORD` required at startup** — admin won't accidentally start with empty password.
- **`_ensure_seed_user` refuses to start** if User table is empty and seed credentials aren't set.

---

## Cloudflare Tunnel deployment checklist

Before going live:

- [ ] Fix #1: bind admin ports to 127.0.0.1, open via ufw for tailscale0
- [ ] Fix #2: add security headers to both nginx configs
- [ ] Fix #3: per-user DB uniqueness for template names/barcodes
- [ ] Fix #4: explicit CORS methods/headers
- [ ] Fix #5: require JWT_ACCESS_SECRET and JWT_REFRESH_SECRET at startup
- [ ] Fix #6: lower barcode rate limit to 15/minute
- [ ] Fix #7: scope `_check_barcode_cross_module` to user_id
- [ ] Set `ALLOWED_ORIGINS` in `.env` to your actual Cloudflare domain (not localhost)
- [ ] Set all JWT secrets in `.env` on the server
- [ ] Set `ADMIN_MASTER_PASSWORD` to a strong (20+ char) random password
- [ ] Verify admin is NOT reachable from a non-Tailscale connection after deploying
- [ ] Verify security headers with `curl -sI https://your-domain | grep -i 'x-\|content-security\|referrer'`
