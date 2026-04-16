# DrinkLog

A PWA for tracking alcohol consumption. Four tabs: log drinks as you go, confirm them at the end of the day, manage drink templates, and view consumption charts.

Designed to be self-hosted on a home server and accessed via Tailscale — no authentication needed.

## Stack

- **Frontend:** React + Vite + TypeScript + TailwindCSS (installable PWA)
- **Backend:** FastAPI + SQLAlchemy + SQLite
- **Deployment:** Docker Compose (nginx + FastAPI)

## Running with Docker

```bash
docker compose up --build
```

The app is available at `http://localhost`.

## Running locally for development

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs at `http://localhost:5173` and proxies `/api` to the backend.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./drinklog.db` | SQLAlchemy database URL |
| `ALLOWED_ORIGINS` | `http://localhost,http://localhost:5173` | Comma-separated CORS origins |
