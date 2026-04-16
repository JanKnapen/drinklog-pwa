# DrinkLog PWA — Design Spec
_Date: 2026-04-16_

## Overview

Rebuild DrinkLog as a React PWA served from a home server and accessed via Tailscale. The original SwiftUI/SwiftData app is translated faithfully to a React + FastAPI stack. No authentication is required.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| State / data fetching | TanStack Query v5 |
| Chart | Recharts |
| Icons | Heroicons |
| Backend | FastAPI (Python 3.12) + SQLAlchemy + SQLite |
| Deployment | Docker Compose — nginx (frontend) + uvicorn (backend) |
| PWA | vite-plugin-pwa (manifest + service worker) |

---

## Project Structure

```
pwa-consumptions-tracker/          ← repo root
  docker-compose.yml
  nginx.conf
  frontend/
    index.html
    vite.config.ts
    tailwind.config.ts
    tsconfig.json
    public/
      icons/                       ← 192×192 and 512×512 PNG
    src/
      api/
        client.ts                  ← base fetch wrapper (base URL, error handling)
        templates.ts               ← TanStack Query hooks for templates
        entries.ts                 ← TanStack Query hooks for entries
      components/
        Toast.tsx
        Modal.tsx                  ← shared dialog wrapper
        EmptyState.tsx
        BottomNav.tsx
      tabs/
        HomeTab.tsx
        LogTab.tsx
        ManageTab.tsx
        DataTab.tsx
      App.tsx                      ← tab shell
      main.tsx
  backend/
    main.py                        ← FastAPI app, CORS, router mounts
    models.py                      ← SQLAlchemy ORM models
    schemas.py                     ← Pydantic request/response schemas
    database.py                    ← engine, SessionLocal, get_db
    routers/
      templates.py
      entries.py
```

---

## Data Models

### Backend (SQLAlchemy)

**DrinkTemplate**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | String | Unique across all templates |
| default_ml | Float | |
| default_abv | Float | |
| usage_count | Integer | Default 0; incremented each time this template is used to log an entry |

**DrinkEntry**

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| template_id | UUID FK | Nullable; references DrinkTemplate. Never SET NULL — deletion is blocked at API level if any entry references the template |
| custom_name | String | Nullable. Set only for unconfirmed "New" entries (pending template creation). Cleared after Confirm All |
| ml | Float | |
| abv | Float | |
| timestamp | DateTime | UTC, stored as-is |
| is_marked | Boolean | false = unconfirmed, true = confirmed |

**Computed (returned in all entry responses):**
`standard_units = (ml × abv / 100) / 10`

### Entry types

| Entry type | `template_id` | `custom_name` | After Confirm All |
|---|---|---|---|
| New (pending) | null | set | Template created; `template_id` set; `custom_name` cleared |
| Enter ml | null | null | Unchanged — marked `is_marked = true` |
| Other / chip | set | null | Unchanged |

**Display name resolution:** `template.name ?? custom_name ?? null` (Enter ml entries show no name)

### Frontend TypeScript types

```ts
interface DrinkTemplate {
  id: string
  name: string
  default_ml: number
  default_abv: number
  usage_count: number
}

interface DrinkEntry {
  id: string
  template_id: string | null
  template: DrinkTemplate | null   // included in all entry responses
  custom_name: string | null
  ml: number
  abv: number
  timestamp: string                // ISO 8601 UTC
  is_marked: boolean
  standard_units: number           // computed by backend
}
```

---

## REST API

All endpoints under `/api/` prefix (nginx proxies `/api/*` → `backend:8000`).

### Templates

| Method | Path | Description |
|---|---|---|
| GET | `/api/templates` | List all templates, sorted by `usage_count` desc |
| POST | `/api/templates` | Create template. Returns 409 if name already exists |
| PUT | `/api/templates/{id}` | Update template. Name: always editable. `default_ml`/`default_abv`: only editable if no confirmed entries reference this template. Returns 409 on duplicate name |
| DELETE | `/api/templates/{id}` | Delete template. Returns 409 if any entry references it |

### Entries

| Method | Path | Description |
|---|---|---|
| GET | `/api/entries` | List all entries, sorted by `timestamp` desc. Includes nested `template` object |
| POST | `/api/entries` | Create entry |
| PUT | `/api/entries/{id}` | Update entry. Only for `template_id = null` entries (custom_name and/or Enter ml). Fields: `custom_name`, `ml`, `abv`, `timestamp` |
| DELETE | `/api/entries/{id}` | Delete entry. Only for unconfirmed entries (`is_marked = false`) |
| POST | `/api/entries/confirm-all` | Body: `{ "cutoff": "<ISO 8601 datetime>" }`. Confirms all unconfirmed entries with `timestamp` before `cutoff`. The frontend passes local midnight (start of today in the user's timezone) as `cutoff`. For each pending "New" entry (`custom_name != null`, `template_id = null`): create a DrinkTemplate, link it, clear `custom_name`. Enter ml entries are simply marked confirmed |

---

## Infrastructure

### Docker Compose

```
frontend (nginx:alpine)
  - serves /app/dist on port 80
  - proxies /api/* → http://backend:8000

backend (python:3.12-slim)
  - uvicorn on port 8000
  - CORS: allow http://frontend (internal Docker network)

volumes:
  db_data → /data/drinklog.db in backend container

networks:
  internal (bridge) — frontend + backend only
```

Only port 80 is exposed externally. The backend is never directly reachable from outside Docker.

### nginx proxy rule

```nginx
location /api/ {
    proxy_pass http://backend:8000/api/;
}
```

---

## Frontend

### TanStack Query conventions

- One query key per resource type: `['templates']`, `['entries']`
- After every mutation, invalidate the affected query keys via `queryClient.invalidateQueries`
- Loading and error states handled per-tab with inline indicators

### Design system (translated from iOS spec)

| iOS concept | Web equivalent |
|---|---|
| `secondarySystemBackground` | `bg-neutral-100 dark:bg-neutral-800` |
| `Color.blue` accent | `text-blue-500` / `bg-blue-500` |
| `.monospacedDigit()` | `tabular-nums` (Tailwind `font-variant-numeric`) |
| `RoundedRectangle(cornerRadius: 12)` | `rounded-xl` |
| `PressableButtonStyle` | `active:scale-95 transition-transform duration-100` |
| `ContentUnavailableView` | `EmptyState` component |
| Toast slide-up | Fixed bottom, Tailwind `translate-y` + `opacity` transition |
| SF Symbols | Heroicons |
| Cards (no border) | `bg-neutral-100 dark:bg-neutral-800 rounded-xl` |

Full dark mode via Tailwind `dark:` variant + `prefers-color-scheme` media query on `<html>`.

Spacing: 16px (`p-4`) outer margins, 8px (`gap-2`) between items, `rounded-xl` on all cards and chips.

---

## Tabs

### Tab 1 — Home

Three full-width action cards (icon + title + subtitle + chevron):
- **New** → modal: name + ml + abv fields. Duplicate name check against template list (client-side). On save: `POST /api/entries` with `custom_name`, `ml`, `abv` — no template created yet.
- **Enter ml** → modal: ml + abv only. On save: `POST /api/entries` with no name.
- **Other** → searchable list of all templates sorted by usage_count. Tap: `POST /api/entries` linked to template, `PUT /api/templates/{id}` to increment usage_count. Dismisses immediately.

Favorites chip row (horizontal scroll) below the cards — top-5 templates by `usage_count`. Hidden if no templates exist. Chip tap: logs entry + increments usage_count + shows toast "Logged: [name]" for 2 seconds. Toast implemented as a fixed-bottom capsule with slide-up animation.

Standard units preview shown live in New and Enter ml modals as the user types.

### Tab 2 — Log

Entries grouped by calendar date, sorted newest first. Today's group expanded by default; all others collapsed. Tapping a day header toggles collapse.

Day header shows: date (e.g. "Tuesday, 15 Apr") + total standard units for that day.

Sticky segmented control pinned to the bottom switches between **Unconfirmed** and **Confirmed**.

**Unconfirmed mode:**
- Each row shows: display name (omitted for Enter ml), ml, abv%, standard units, time
- Delete button visible on each row (no swipe — PWA/desktop friendly); unconfirmed entries only
- Tap to edit: only for `template_id = null` entries (both custom_name and Enter ml types)
  - Edit modal fields: name (only for custom_name entries), ml, abv, timestamp (datetime input)
  - Saves via `PUT /api/entries/{id}`
  - Entries linked to a template (logged via Other/chip) are not editable
- Floating **Confirm All** button (above segmented control): enabled only when at least one pre-today unconfirmed entry exists. Calls `POST /api/entries/confirm-all` with `{ cutoff: <local midnight ISO string> }`, then invalidates `['entries']` and `['templates']`

**Confirmed mode:** read-only list, no actions.

Empty state shown when the active filter has no entries.

### Tab 3 — Manage

List of all templates, sorted by `usage_count` desc. `+` button top-right opens add modal.

Add/Edit modal:
- Name field: always editable; duplicate name check (excluding current template on edit)
- ml/abv fields: editable only if template has zero confirmed entries; greyed out with a note if locked
- Snackbar error on duplicate name

Delete button on each row: visible only if the template has zero linked entries. Tapping shows a confirmation dialog before calling `DELETE /api/templates/{id}`.

Empty state shown if no templates exist.

### Tab 4 — Data

Filter pills (single-select, horizontal scroll): Today | Week | Month | 3M | Year | All. Default: Week.

Bar chart (Recharts `BarChart`): x-axis = calendar date, y-axis = total standard units for that day. One bar per day that has at least one entry. Animated on filter change. Empty state shown if no data for selected period.

2×2 summary card grid, all reflecting the active filter:
- Total entries
- Total standard units
- Avg units/day
- Heaviest day (units + date)

---

## PWA

`vite-plugin-pwa` configured with:
- `registerType: 'autoUpdate'`
- Manifest: name "DrinkLog", short_name "DrinkLog", display "standalone", background_color and theme_color matching the app's neutral palette, icons at 192×192 and 512×512
- Service worker strategy: `CacheFirst` for static assets, `NetworkFirst` for `/api/*`
- Installable on iPhone via Safari "Add to Home Screen"

---

## Build Order

1. Backend: models → database setup → all API endpoints → verify with curl
2. Docker Compose + nginx: verify both containers start and frontend can reach backend via `/api/`
3. Frontend tab by tab: Home → Log → Manage → Data — verify each in the browser before continuing
4. PWA manifest and service worker last

---

## Git Workflow

- Initialise git repository in project root
- Commit after each major piece: data models, all API endpoints, each frontend tab
- Commit message format: `feat: add Log tab with grouped entries and confirm-all flow`
- No co-author lines, AI attribution, or "Generated by" footers
