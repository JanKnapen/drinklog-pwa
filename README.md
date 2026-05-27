# DrinkLog

A self-hosted PWA for tracking consumption. Supports two modes — **alcohol** and **caffeine** — switchable via Settings. Four tabs: quick-log, confirm/review, manage templates, and view charts.

Includes a **barcode scanner** to look up drinks and auto-fill templates (uses the Open Food Facts API and the Albert Heijn API as sources).

## Intended deployment setup

DrinkLog is designed to run on a home server:

- **Main app (port 80)** — expose only through a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), which provides SSL termination. HTTPS is required: the barcode scanner uses the camera (needs a secure context), and the app installs as a PWA.
- **Admin interface (ports 8001/8002)** — user management only, not for daily use. Restrict to Tailscale peers using `iptables` `DOCKER-USER` rules (see Deployment section). Never expose these ports to the public internet.

## Features

- Log drinks on the go — confirmed later in bulk ("Confirm All")
- Alcohol and caffeine modes, same four-tab UI
- Barcode scanner to look up products and create templates
- Consumption charts with moving averages and window navigation
- Offline support — entries are queued locally and replayed when back online
- Installable as a PWA (home screen, standalone fullscreen)
- JWT authentication with silent token refresh

## Stack

- **Frontend:** React 18 + Vite + TypeScript + TailwindCSS (installable PWA)
- **Backend:** FastAPI + SQLAlchemy + SQLite
- **Deployment:** Docker Compose (nginx + FastAPI)

## Running with Docker

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
# Edit .env: set JWT secrets, ADMIN_MASTER_PASSWORD, and seed credentials
docker compose up --build
```

The main app runs at `http://localhost` (port 80).  
The admin interface runs at `http://localhost:8001` (API) and `http://localhost:8002` (UI).

## Admin interface

The admin interface lets a server operator manage user accounts (create, change password, delete, bulk import). Access it from your Tailscale device at `http://<server>:8001` (or `:8002` for the UI). Log in with `ADMIN_MASTER_PASSWORD`.

To restrict the admin ports to Tailscale peers only, add these iptables rules on the host and persist them:

```bash
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8001 -p tcp -j DROP
iptables -I DOCKER-USER ! -i tailscale0 -m conntrack --ctorigdstport 8002 -p tcp -j DROP
netfilter-persistent save
```

> **Note:** Don't use UFW rules or `127.0.0.1` binding — Docker bypasses UFW, and `127.0.0.1` also blocks Tailscale traffic.

## Running locally for development

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DEBUG=true PYTHONPATH=.. uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api → :8000
```

> `DEBUG=true` is required locally — it bypasses the JWT secret startup check. Never set it in production.

For end-to-end auth and barcode scanner testing (requires HTTPS), use the Tailscale dev setup:

```bash
# Set TAILSCALE_HOSTNAME in .env, then:
docker compose -f docker-compose.dev.yml up --build
```

## Configuration

See `.env.example` for the full list with comments. Key variables:

| Variable | Required | Description |
|---|---|---|
| `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` | First run only | Creates the initial user if the database is empty |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Production | Token signing secrets — generate with `secrets.token_hex(32)` |
| `ADMIN_MASTER_PASSWORD` | Always | Login password for the admin interface |
| `ADMIN_JWT_SECRET` | Production | Admin token signing secret |
| `DATABASE_URL` | No | SQLAlchemy DB URL (default: SQLite at `/data/drinklog.db`) |
| `ALCOHOL_UNIT_DIVISOR` / `CAFFEINE_UNIT_DIVISOR` | No | Divisors for standard unit calculations (defaults: 15 / 80) |
