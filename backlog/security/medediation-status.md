# Security Findings — Remediation Status

## Finding Status

| #   | Severity    | Finding                                          | Status                                                                                                            |
| --- | ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | 🔴 CRITICAL | Admin ports exposed                              | ✅ Fixed — DOCKER-USER iptables rules restrict ports 8001/8002 to Tailscale only                                   |
| 2   | 🔴 CRITICAL | No security headers in nginx                     | ✅ Fixed — headers added to both nginx configs                                                                     |
| 3   | 🔴 CRITICAL | Template name uniqueness global                  | **Fixed**                                                                                                         |
| 4   | 🟠 HIGH     | CORS wildcard methods/headers                    | ✅ Fixed — explicit methods and headers in both backends                                                           |
| 5   | 🟠 HIGH     | JWT secrets fall back silently                   | ✅ Fixed — startup check in both `main.py` files; skipped when `DEBUG=true` (set by `docker-compose.dev.yml`)      |
| 6   | 🟠 HIGH     | Barcode rate limit too loose                     | ✅ Fixed — `@limiter.limit("15/minute")` added to barcode endpoint                                                |
| 7   | 🟠 HIGH     | `_check_barcode_cross_module` not scoped to user | ✅ Fixed — both routers now pass and filter by `user_id`                                                           |
| 8   | 🟡 MEDIUM   | No password minimum length                       | ✅ Fixed — 16-character minimum enforced via Pydantic validator on create/change-password schemas                  |
| 9   | 🟡 MEDIUM   | No numeric bounds on ml/abv/mg                   | ✅ Fixed — `Field(gt/ge/le)` bounds added to all create/update schemas in `schemas.py`                             |
| 10  | 🟡 MEDIUM   | No refresh token rotation                        | ❌ Still open                                                                                                      |
| 11  | 🟡 MEDIUM   | Admin 401 doesn't redirect to login              | ❌ Still open                                                                                                      |
| 12  | 🔵 LOW      | Containers run as root                           | ❌ Still open                                                                                                      |
| 13  | 🔵 LOW      | No nginx body size limits                        | ✅ Fixed — `client_max_body_size 64k` added to both nginx configs                                                  |
| 14  | 🔵 LOW      | No audit log for admin ops                       | ❌ Still open                                                                                                      |
| 15  | 🔵 LOW      | Silent exception swallowing in barcode           | ⚠️ Partially fixed — strategy 2/3 removed, but `_strategy_off_plus` still has bare `except Exception:` at line 74 |

---

## Branch Plan

| Branch                               | Covers  | Notes                                                                       |
| ------------------------------------ | ------- | --------------------------------------------------------------------------- |
| `security/admin-port-binding`        | #1      | `docker-compose` `127.0.0.1:` prefix                                        |
| `security/nginx-security-headers`    | #2, #13 | Add headers + `client_max_body_size` to both nginx configs                  |
| `security/template-name-per-user`    | #3      | Remove global `unique=True` from model names; add composite migration index |
| `security/cors-restrict`             | #4      | Explicit methods/headers in both backends                                   |
| `security/require-jwt-secrets`       | #5      | Startup validation in `main.py`                                             |
| `security/barcode-rate-limit`        | #6      | Add `@limiter.limit("15/minute")` to the barcode endpoint                   |
| `security/password-min-length`       | #8      | Pydantic validator on admin user create/password-change schemas             |
| `security/input-bounds`              | #9      | `Field(gt=0, le=...)` on `ml`/`abv`/`mg` in `schemas.py`                    |
| `security/admin-401-redirect`        | #11     | Handle 401 in admin `apiFetch`                                              |
| `security/non-root-containers`       | #12     | Add `USER` directive to all 4 Dockerfiles                                   |
| `security/admin-audit-log`           | #14     | `logger.warning(...)` in admin endpoints                                    |
| `security/barcode-exception-logging` | #15     | Log the exception before returning `not_found`                              |

> **Note:** #10 (refresh token rotation) is intentionally skipped for now — it requires a new DB table and is the most invasive change. Good candidate for a separate, more careful implementation later.
