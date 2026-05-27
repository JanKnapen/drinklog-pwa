# Deployment Notes

`docker-compose.yml` runs four services on an `internal` bridge network:
- `backend` — FastAPI, no exposed ports, `DATABASE_URL` → `/data/drinklog.db`. Reads `.env`.
- `frontend` — nginx on port **80**, serves Vite build, proxies `/api/` → `backend:8000`.
- `admin-backend` — FastAPI on port **8001**, shares `db_data` volume. Reads `.env`.
- `admin-frontend` — nginx on port **8002**, serves admin Vite build, proxies `/api/` → `admin-backend:8000`.

Admin ports bound to `0.0.0.0` but restricted to Tailscale peers via `DOCKER-USER` iptables:
```bash
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8001 -p tcp -j DROP
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8002 -p tcp -j DROP
```
Persisted with `netfilter-persistent save`. **Do not use UFW rules or `127.0.0.1` binding** — Docker bypasses UFW; `127.0.0.1` binding also blocks Tailscale (traffic arrives with Tailscale IP, not loopback). The `DOCKER-USER` chain with `--ctorigdstport` (matches pre-DNAT port) is the correct mechanism.

**`.env` and `.env.example`** — `.env` is gitignored (live secrets on server). `.env.example` is the committed template. **Add every new env var to `.env.example` with a placeholder and comment.** Never read or expose `.env`.

**Env vars:**
- `DEBUG` — skips JWT secret validation at startup. Only valid in tests and `docker-compose.dev.yml`. Never in production. Does **not** bypass `ADMIN_MASTER_PASSWORD`.
- `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` — bootstraps first user on empty DB. Ignored once any user exists. Backend refuses to start if User table is empty and these are unset.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — required unless `DEBUG=true`. Random per-restart if unset in dev (all sessions invalidated on restart).
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 15) / `REFRESH_TOKEN_EXPIRE_DAYS` (default: 30) — optional overrides.
- `ADMIN_MASTER_PASSWORD` — always required; admin backend refuses to start without it even in dev.
- `ADMIN_JWT_SECRET` — required unless `DEBUG=true`. Random per-restart if unset.

**Non-root containers:**
- Backend: `gosu` entrypoint (`backend/entrypoint.sh`, `admin/backend/entrypoint.sh`) — runs as root, `chown -R app:app /data` (handles existing root-owned volumes), then drops to `app` via `exec gosu app uvicorn`. Do not remove the `chown`.
- Frontend: `nginxinc/nginx-unprivileged:alpine` (not `nginx:alpine` — standard image lacks non-root permissions, crashes on `/var/cache/nginx`). Configs copied with `COPY --chown=nginx:nginx`.
- Nginx listens on **8080** internally; docker-compose maps host 80→8080 and 8002→8080. Do not change `listen` back to 80 — non-root user cannot bind to privileged ports.
- `docker-compose.dev.yml` overrides `user: "0"` on frontend — Tailscale SSL cert key is root-only readable.

`nginx.conf` (project root, baked into frontend image at build time). `admin/nginx.conf` baked into admin-frontend image. Edit + `docker compose up --build` to change proxy behavior or headers.

Both configs include security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) and `client_max_body_size 64k`. **Do not tighten CSP without accounting for:**
- `style-src 'unsafe-inline'` — required by Tailwind (injects inline styles at runtime)
- `script-src 'wasm-unsafe-eval'` — required by ZXing barcode scanner (WebAssembly); main app only

HSTS not set in nginx — Cloudflare handles it for the main app. Do not add it (duplicate headers).

Vite build uses `build:docker` script (skips `tsc`) inside Docker; full `build` script (with type-check) for local CI.

Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) — NetworkFirst, `urlPattern: /^\/api\/(?!auth\/).*/`. Auth endpoints (`/api/auth/*`) deliberately excluded — caching them would allow a stale refresh response to bypass login offline. Timeout 5s, max 50 entries, 5-min expiry. Do not broaden pattern to `/^\/api\/.*/` or remove the negative lookahead.

**`overrides` in `frontend/package.json`** — forces `serialize-javascript@^7.0.5` to fix HIGH CVEs (`workbox-build → @rollup/plugin-terser@0.4.4` pins 6.x). Do not remove until `workbox-build` ships `@rollup/plugin-terser ≥1.0.0`.
