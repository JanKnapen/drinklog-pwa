# DrinkLog PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DrinkLog as a React + FastAPI PWA in a monorepo, served from a home server via Docker Compose.

**Architecture:** FastAPI backend with SQLAlchemy + SQLite; React + Vite + TypeScript + TailwindCSS frontend; nginx container serves the Vite build and proxies `/api/*` to the backend; TanStack Query manages all server state on the frontend.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2, pytest; React 18, TypeScript, Vite, TailwindCSS 3, TanStack Query v5, Recharts, Heroicons, vite-plugin-pwa; Docker Compose, nginx:alpine.

---

## File Map

```
pwa-consumptions-tracker/
  .gitignore
  docker-compose.yml
  nginx.conf
  backend/
    Dockerfile
    requirements.txt
    main.py                     ← FastAPI app, CORS, router mounts, DB init
    database.py                 ← engine, SessionLocal, Base, get_db
    models.py                   ← DrinkTemplate, DrinkEntry ORM models
    schemas.py                  ← Pydantic request/response schemas
    routers/
      __init__.py
      templates.py              ← GET/POST/PUT/DELETE /api/templates
      entries.py                ← GET/POST/PUT/DELETE /api/entries + confirm-all
    tests/
      __init__.py
      conftest.py               ← TestClient + in-memory SQLite fixture
      test_templates.py
      test_entries.py
      test_confirm_all.py
  frontend/
    Dockerfile
    package.json
    tsconfig.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.js
    index.html
    public/
      icons/
        icon-192x192.png
        icon-512x512.png
    src/
      types.ts                  ← DrinkTemplate, DrinkEntry interfaces
      utils.ts                  ← standardUnits(), groupByDate(), getFilterStart()
      utils.test.ts             ← Vitest tests for utility functions
      api/
        client.ts               ← apiFetch() base wrapper
        templates.ts            ← useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate
        entries.ts              ← useEntries, useCreateEntry, useUpdateEntry, useDeleteEntry, useConfirmAll
      components/
        Toast.tsx               ← fixed-bottom toast with slide-up animation
        Modal.tsx               ← shared dialog wrapper with backdrop
        EmptyState.tsx          ← reusable empty state with icon + message
        BottomNav.tsx           ← 4-tab fixed bottom navigation
      tabs/
        HomeTab.tsx             ← 3 action cards + modals + favorites chips
        LogTab.tsx              ← grouped entries, segmented control, confirm-all
        ManageTab.tsx           ← template list + add/edit/delete modals
        DataTab.tsx             ← filter pills + bar chart + summary cards
      App.tsx                   ← QueryClientProvider + tab shell
      main.tsx
      index.css
```

---

## Task 1: Git Scaffold + .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
# Python
__pycache__/
*.pyc
*.pyo
.venv/
venv/
.pytest_cache/

# Node
node_modules/
frontend/dist/
frontend/.vite/

# SQLite (local dev only — not in Docker volume)
*.db

# Docker
.env

# OS
.DS_Store
```

- [ ] **Step 2: Stage and commit**

```bash
git add .gitignore 2026-04-15-drinklog.md 2026-04-15-drinklog-design.md
git commit -m "chore: add gitignore and SwiftUI reference specs"
```

Expected: commit succeeds with 3 files.

---

## Task 2: Backend — database.py + models.py

**Files:**
- Create: `backend/database.py`
- Create: `backend/models.py`
- Create: `backend/routers/__init__.py`

- [ ] **Step 1: Create `backend/database.py`**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./drinklog.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Create `backend/models.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class DrinkTemplate(Base):
    __tablename__ = "drink_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    default_ml: Mapped[float] = mapped_column(Float, nullable=False)
    default_abv: Mapped[float] = mapped_column(Float, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    entries: Mapped[list["DrinkEntry"]] = relationship("DrinkEntry", back_populates="template")

    @property
    def entry_count(self) -> int:
        return len(self.entries)

    @property
    def confirmed_entry_count(self) -> int:
        return sum(1 for e in self.entries if e.is_marked)


class DrinkEntry(Base):
    __tablename__ = "drink_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("drink_templates.id"), nullable=True
    )
    custom_name: Mapped[str | None] = mapped_column(String, nullable=True)
    ml: Mapped[float] = mapped_column(Float, nullable=False)
    abv: Mapped[float] = mapped_column(Float, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_marked: Mapped[bool] = mapped_column(Boolean, default=False)

    template: Mapped["DrinkTemplate | None"] = relationship(
        "DrinkTemplate", back_populates="entries"
    )

    @property
    def standard_units(self) -> float:
        return (self.ml * self.abv / 100.0) / 10.0
```

- [ ] **Step 3: Create `backend/routers/__init__.py`**

```python
```
(empty file)

---

## Task 3: Backend — schemas.py

**Files:**
- Create: `backend/schemas.py`

- [ ] **Step 1: Create `backend/schemas.py`**

```python
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, field_validator


class DrinkTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    default_ml: float
    default_abv: float
    usage_count: int
    entry_count: int
    confirmed_entry_count: int


class DrinkTemplateCreate(BaseModel):
    name: str
    default_ml: float
    default_abv: float


class DrinkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    default_ml: Optional[float] = None
    default_abv: Optional[float] = None


class DrinkEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    template_id: Optional[str]
    template: Optional[DrinkTemplateResponse]
    custom_name: Optional[str]
    ml: float
    abv: float
    timestamp: datetime
    is_marked: bool
    standard_units: float


class DrinkEntryCreate(BaseModel):
    template_id: Optional[str] = None
    custom_name: Optional[str] = None
    ml: float
    abv: float
    timestamp: datetime

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime) -> datetime:
        """Store as naive UTC — SQLite has no native timezone support."""
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class DrinkEntryUpdate(BaseModel):
    custom_name: Optional[str] = None
    ml: Optional[float] = None
    abv: Optional[float] = None
    timestamp: Optional[datetime] = None

    @field_validator("timestamp")
    @classmethod
    def strip_tz(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v


class ConfirmAllRequest(BaseModel):
    cutoff: datetime

    @field_validator("cutoff")
    @classmethod
    def strip_tz(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            return v.astimezone(timezone.utc).replace(tzinfo=None)
        return v
```

---

## Task 4: Backend — test fixtures (conftest.py)

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create `backend/tests/__init__.py`**

```python
```
(empty file)

- [ ] **Step 2: Create `backend/tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
```

---

## Task 5: Backend — templates router + tests

**Files:**
- Create: `backend/routers/templates.py`
- Create: `backend/tests/test_templates.py`

- [ ] **Step 1: Write failing tests — `backend/tests/test_templates.py`**

```python
def test_list_templates_empty(client):
    r = client.get("/api/templates")
    assert r.status_code == 200
    assert r.json() == []


def test_create_template(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Lager"
    assert d["default_ml"] == 330.0
    assert d["default_abv"] == 5.0
    assert d["usage_count"] == 0
    assert d["entry_count"] == 0
    assert d["confirmed_entry_count"] == 0
    assert "id" in d


def test_create_template_duplicate_name_returns_409(client):
    client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 500, "default_abv": 4.0})
    assert r.status_code == 409


def test_update_template_name(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    r2 = client.put(f"/api/templates/{tid}", json={"name": "Craft Lager"})
    assert r2.status_code == 200
    assert r2.json()["name"] == "Craft Lager"
    assert r2.json()["default_ml"] == 330.0  # unchanged


def test_update_template_duplicate_name_returns_409(client):
    client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    r2 = client.post("/api/templates", json={"name": "Wine", "default_ml": 150, "default_abv": 13.0})
    tid = r2.json()["id"]
    r = client.put(f"/api/templates/{tid}", json={"name": "Lager"})
    assert r.status_code == 409


def test_delete_template_no_entries(client):
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    assert client.delete(f"/api/templates/{tid}").status_code == 204
    assert client.get("/api/templates").json() == []


def test_delete_template_with_entries_returns_409(client):
    from datetime import datetime, timezone
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    client.post("/api/entries", json={
        "template_id": tid, "ml": 330, "abv": 5.0,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    assert client.delete(f"/api/templates/{tid}").status_code == 409


def test_update_ml_abv_locked_when_confirmed_entries(client):
    from datetime import datetime, timezone, timedelta
    r = client.post("/api/templates", json={"name": "Lager", "default_ml": 330, "default_abv": 5.0})
    tid = r.json()["id"]
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    client.post("/api/entries", json={"template_id": tid, "ml": 330, "abv": 5.0, "timestamp": yesterday})
    today_midnight = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": today_midnight})
    r2 = client.put(f"/api/templates/{tid}", json={"default_ml": 500.0})
    assert r2.status_code == 200
    assert r2.json()["default_ml"] == 330.0  # unchanged — locked
```

- [ ] **Step 2: Run tests — expect ALL to fail**

```bash
cd backend && pip install -r requirements.txt 2>/dev/null; pytest tests/test_templates.py -v 2>&1 | head -30
```

Expected: errors about missing modules (router not created yet).

- [ ] **Step 3: Create `backend/routers/templates.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate
from schemas import DrinkTemplateCreate, DrinkTemplateUpdate, DrinkTemplateResponse

router = APIRouter(tags=["templates"])


@router.get("/templates", response_model=list[DrinkTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    return db.query(DrinkTemplate).order_by(DrinkTemplate.usage_count.desc()).all()


@router.post("/templates", response_model=DrinkTemplateResponse, status_code=201)
def create_template(data: DrinkTemplateCreate, db: Session = Depends(get_db)):
    if db.query(DrinkTemplate).filter(DrinkTemplate.name == data.name).first():
        raise HTTPException(status_code=409, detail="A template with this name already exists")
    template = DrinkTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=DrinkTemplateResponse)
def update_template(template_id: str, data: DrinkTemplateUpdate, db: Session = Depends(get_db)):
    template = db.query(DrinkTemplate).filter(DrinkTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if data.name is not None:
        conflict = db.query(DrinkTemplate).filter(
            DrinkTemplate.name == data.name, DrinkTemplate.id != template_id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="A template with this name already exists")
        template.name = data.name

    has_confirmed = any(e.is_marked for e in template.entries)
    if not has_confirmed:
        if data.default_ml is not None:
            template.default_ml = data.default_ml
        if data.default_abv is not None:
            template.default_abv = data.default_abv

    db.commit()
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    template = db.query(DrinkTemplate).filter(DrinkTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.entries:
        raise HTTPException(status_code=409, detail="Cannot delete a template that has linked entries")
    db.delete(template)
    db.commit()
```

- [ ] **Step 4: Create `backend/main.py`** (needed for TestClient)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import templates, entries

Base.metadata.create_all(bind=engine)

app = FastAPI(title="DrinkLog API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://frontend", "http://localhost", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(templates.router, prefix="/api")
app.include_router(entries.router, prefix="/api")
```

Note: `entries` router doesn't exist yet — create a stub `backend/routers/entries.py`:

```python
from fastapi import APIRouter
router = APIRouter()
```

- [ ] **Step 5: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 6: Install dependencies and run tests**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest tests/test_templates.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: add backend data models and templates CRUD API"
```

---

## Task 6: Backend — entries router + tests

**Files:**
- Create: `backend/routers/entries.py` (replace stub)
- Create: `backend/tests/test_entries.py`

- [ ] **Step 1: Write failing tests — `backend/tests/test_entries.py`**

```python
from datetime import datetime, timezone, timedelta


def _now():
    return datetime.now(timezone.utc).isoformat()


def test_list_entries_empty(client):
    assert client.get("/api/entries").json() == []


def test_create_enter_ml_entry(client):
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    assert r.status_code == 201
    d = r.json()
    assert d["template_id"] is None
    assert d["custom_name"] is None
    assert d["is_marked"] is False
    assert abs(d["standard_units"] - 1.65) < 0.001


def test_create_new_entry_with_custom_name(client):
    r = client.post("/api/entries", json={
        "custom_name": "Craft IPA", "ml": 440, "abv": 6.5, "timestamp": _now()
    })
    assert r.status_code == 201
    d = r.json()
    assert d["custom_name"] == "Craft IPA"
    assert d["template_id"] is None
    assert d["template"] is None


def test_create_entry_linked_to_template(client):
    t = client.post("/api/templates", json={
        "name": "Lager", "default_ml": 330, "default_abv": 5.0
    }).json()
    r = client.post("/api/entries", json={
        "template_id": t["id"], "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    assert r.status_code == 201
    d = r.json()
    assert d["template_id"] == t["id"]
    assert d["template"]["name"] == "Lager"


def test_entries_sorted_newest_first(client):
    older = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    newer = datetime.now(timezone.utc).isoformat()
    client.post("/api/entries", json={"custom_name": "A", "ml": 100, "abv": 5.0, "timestamp": older})
    client.post("/api/entries", json={"custom_name": "B", "ml": 100, "abv": 5.0, "timestamp": newer})
    entries = client.get("/api/entries").json()
    assert entries[0]["custom_name"] == "B"
    assert entries[1]["custom_name"] == "A"


def test_update_entry_custom_name_and_ml(client):
    r = client.post("/api/entries", json={
        "custom_name": "Beer", "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    eid = r.json()["id"]
    r2 = client.put(f"/api/entries/{eid}", json={"custom_name": "Craft Beer", "ml": 440})
    assert r2.status_code == 200
    assert r2.json()["custom_name"] == "Craft Beer"
    assert r2.json()["ml"] == 440.0


def test_update_template_linked_entry_returns_400(client):
    t = client.post("/api/templates", json={
        "name": "Lager", "default_ml": 330, "default_abv": 5.0
    }).json()
    r = client.post("/api/entries", json={
        "template_id": t["id"], "ml": 330, "abv": 5.0, "timestamp": _now()
    })
    eid = r.json()["id"]
    r2 = client.put(f"/api/entries/{eid}", json={"ml": 500})
    assert r2.status_code == 400


def test_delete_unconfirmed_entry(client):
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _now()})
    eid = r.json()["id"]
    assert client.delete(f"/api/entries/{eid}").status_code == 204
    assert client.get("/api/entries").json() == []


def test_delete_confirmed_entry_returns_400(client):
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": yesterday})
    eid = r.json()["id"]
    cutoff = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    client.post("/api/entries/confirm-all", json={"cutoff": cutoff})
    assert client.delete(f"/api/entries/{eid}").status_code == 400
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd backend && source .venv/bin/activate && pytest tests/test_entries.py -v 2>&1 | head -20
```

Expected: failures (stub router has no routes).

- [ ] **Step 3: Replace `backend/routers/entries.py` with full implementation**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import DrinkTemplate, DrinkEntry
from schemas import (
    DrinkEntryCreate, DrinkEntryUpdate, DrinkEntryResponse, ConfirmAllRequest
)

router = APIRouter(tags=["entries"])


# IMPORTANT: /entries/confirm-all must be registered BEFORE /entries/{entry_id}
# so FastAPI doesn't treat "confirm-all" as an entry_id.


@router.post("/entries/confirm-all")
def confirm_all(req: ConfirmAllRequest, db: Session = Depends(get_db)):
    entries = (
        db.query(DrinkEntry)
        .filter(DrinkEntry.is_marked == False, DrinkEntry.timestamp < req.cutoff)
        .all()
    )
    for entry in entries:
        if entry.custom_name is not None and entry.template_id is None:
            template = DrinkTemplate(
                name=entry.custom_name,
                default_ml=entry.ml,
                default_abv=entry.abv,
                usage_count=1,
            )
            db.add(template)
            db.flush()
            entry.template_id = template.id
            entry.custom_name = None
        entry.is_marked = True
    db.commit()
    return {"confirmed": len(entries)}


@router.get("/entries", response_model=list[DrinkEntryResponse])
def list_entries(db: Session = Depends(get_db)):
    return db.query(DrinkEntry).order_by(DrinkEntry.timestamp.desc()).all()


@router.post("/entries", response_model=DrinkEntryResponse, status_code=201)
def create_entry(data: DrinkEntryCreate, db: Session = Depends(get_db)):
    entry = DrinkEntry(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/entries/{entry_id}", response_model=DrinkEntryResponse)
def update_entry(entry_id: str, data: DrinkEntryUpdate, db: Session = Depends(get_db)):
    entry = db.query(DrinkEntry).filter(DrinkEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.template_id is not None:
        raise HTTPException(status_code=400, detail="Cannot edit entries linked to a template")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, db: Session = Depends(get_db)):
    entry = db.query(DrinkEntry).filter(DrinkEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.is_marked:
        raise HTTPException(status_code=400, detail="Cannot delete confirmed entries")
    db.delete(entry)
    db.commit()
```

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && source .venv/bin/activate && pytest tests/ -v
```

Expected: all tests PASS. Count should be 8 (templates) + 8 (entries) = 16.

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add entries CRUD API with confirm-all endpoint"
```

---

## Task 7: Backend — confirm-all tests + smoke test

**Files:**
- Create: `backend/tests/test_confirm_all.py`

- [ ] **Step 1: Write `backend/tests/test_confirm_all.py`**

```python
from datetime import datetime, timezone, timedelta


def _yesterday():
    return (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def _today_midnight():
    return datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()


def test_confirm_all_creates_template_for_new_entry(client):
    client.post("/api/entries", json={
        "custom_name": "Craft IPA", "ml": 440, "abv": 6.5, "timestamp": _yesterday()
    })
    r = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r.status_code == 200
    assert r.json()["confirmed"] == 1

    templates = client.get("/api/templates").json()
    assert len(templates) == 1
    assert templates[0]["name"] == "Craft IPA"
    assert templates[0]["default_ml"] == 440.0
    assert templates[0]["usage_count"] == 1

    entries = client.get("/api/entries").json()
    assert entries[0]["is_marked"] is True
    assert entries[0]["template_id"] is not None
    assert entries[0]["custom_name"] is None
    assert entries[0]["template"]["name"] == "Craft IPA"


def test_confirm_all_does_not_touch_todays_entries(client):
    now = datetime.now(timezone.utc).isoformat()
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": now})
    r = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r.json()["confirmed"] == 0
    assert client.get("/api/entries").json()[0]["is_marked"] is False


def test_confirm_all_enter_ml_confirmed_no_template_created(client):
    client.post("/api/entries", json={"ml": 330, "abv": 5.0, "timestamp": _yesterday()})
    client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert client.get("/api/templates").json() == []
    entries = client.get("/api/entries").json()
    assert entries[0]["is_marked"] is True
    assert entries[0]["template_id"] is None


def test_confirm_all_idempotent(client):
    client.post("/api/entries", json={
        "custom_name": "Wine", "ml": 150, "abv": 13.0, "timestamp": _yesterday()
    })
    client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    r2 = client.post("/api/entries/confirm-all", json={"cutoff": _today_midnight()})
    assert r2.json()["confirmed"] == 0
    assert len(client.get("/api/templates").json()) == 1  # no duplicate template
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && source .venv/bin/activate && pytest tests/ -v
```

Expected: 20 tests PASS.

- [ ] **Step 3: Smoke test the running server**

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/templates | python3 -m json.tool
curl -s -X POST http://localhost:8000/api/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Lager","default_ml":330,"default_abv":5.0}' | python3 -m json.tool
curl -s http://localhost:8000/api/templates | python3 -m json.tool
kill %1
```

Expected: first call returns `[]`, POST returns the new template object, second GET returns array with one template.

---

## Task 8: Docker Compose + nginx + Dockerfiles

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `nginx.conf`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  backend:
    build: ./backend
    container_name: drinklog-backend
    environment:
      - DATABASE_URL=sqlite:////data/drinklog.db
    volumes:
      - db_data:/data
    networks:
      - internal
    restart: unless-stopped

  frontend:
    build: ./frontend
    container_name: drinklog-frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - internal
    restart: unless-stopped

volumes:
  db_data:

networks:
  internal:
    driver: bridge
```

- [ ] **Step 4: Create a placeholder frontend to verify Docker wiring**

Create `frontend/Dockerfile` (final version — Vite build will replace the placeholder later):

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Create a minimal `frontend/index.html` for this smoke test:

```html
<!doctype html>
<html><body><h1>DrinkLog</h1></body></html>
```

Create `frontend/package.json` (temporary — will be replaced in Task 9):

```json
{
  "name": "drinklog-frontend",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "cp index.html dist/index.html || (mkdir -p dist && cp index.html dist/index.html)"
  }
}
```

- [ ] **Step 5: Build and start containers**

```bash
docker compose up --build -d
```

Expected: both containers start. Check logs:

```bash
docker compose logs backend
docker compose logs frontend
```

Expected: backend shows `Application startup complete`, frontend shows nginx started.

- [ ] **Step 6: Verify API is reachable through nginx**

```bash
curl -s http://localhost/api/templates
```

Expected: `[]`

```bash
curl -s -X POST http://localhost/api/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","default_ml":330,"default_abv":5.0}'
curl -s http://localhost/api/templates
```

Expected: template returned, then array with that template.

```bash
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml nginx.conf backend/Dockerfile frontend/
git commit -m "chore: add Docker Compose, nginx, and backend Dockerfile"
```

---

## Task 9: Frontend scaffold — Vite + TypeScript + Tailwind

**Files:**
- Replace: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/App.tsx` (stub)

- [ ] **Step 1: Replace `frontend/package.json`**

```json
{
  "name": "drinklog-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "@heroicons/react": "^2.1.5",
    "@tanstack/react-query": "^5.56.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.5.3",
    "vite": "^5.4.2",
    "vite-plugin-pwa": "^0.20.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

Note: PWA plugin is added in Task 17. The dev proxy routes `/api/*` to the backend for local development.

- [ ] **Step 4: Create `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 5: Create `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DrinkLog</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create stub `frontend/src/App.tsx`**

```tsx
export default function App() {
  return <div className="p-4 text-gray-900 dark:text-gray-100">DrinkLog</div>
}
```

- [ ] **Step 9: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 10: Install dependencies and verify dev server starts**

```bash
cd frontend && npm install
npm run build
```

Expected: build succeeds, `dist/` created.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "chore: scaffold React + Vite + TypeScript + Tailwind frontend"
```

---

## Task 10: Frontend — types.ts + utils.ts + tests

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/utils.ts`
- Create: `frontend/src/utils.test.ts`

- [ ] **Step 1: Write failing tests — `frontend/src/utils.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { standardUnits, groupByDate, getFilterStart } from './utils'

describe('standardUnits', () => {
  it('calculates correctly for 330ml at 5%', () => {
    expect(standardUnits(330, 5)).toBeCloseTo(1.65)
  })
  it('calculates correctly for 150ml at 13%', () => {
    expect(standardUnits(150, 13)).toBeCloseTo(1.95)
  })
  it('returns 0 for 0% ABV', () => {
    expect(standardUnits(500, 0)).toBe(0)
  })
})

describe('groupByDate', () => {
  it('groups entries by local calendar date', () => {
    const entries = [
      { id: '1', timestamp: '2026-04-15T10:00:00', ml: 330, abv: 5, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 1.65 },
      { id: '2', timestamp: '2026-04-15T20:00:00', ml: 150, abv: 13, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 1.95 },
      { id: '3', timestamp: '2026-04-14T18:00:00', ml: 440, abv: 6, is_marked: false, template_id: null, template: null, custom_name: null, standard_units: 2.64 },
    ]
    const groups = groupByDate(entries)
    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('2026-04-15')
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[1].date).toBe('2026-04-14')
    expect(groups[1].entries).toHaveLength(1)
  })
})

describe('getFilterStart', () => {
  it('returns null for "all"', () => {
    expect(getFilterStart('all')).toBeNull()
  })
  it('returns a date approximately 7 days ago for "week"', () => {
    const start = getFilterStart('week')!
    const diff = Date.now() - start.getTime()
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000)
  })
  it('returns start of today for "today"', () => {
    const start = getFilterStart('today')!
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm test -- --run 2>&1 | head -20
```

Expected: failures — module not found.

- [ ] **Step 3: Create `frontend/src/types.ts`**

```typescript
export interface DrinkTemplate {
  id: string
  name: string
  default_ml: number
  default_abv: number
  usage_count: number
  entry_count: number
  confirmed_entry_count: number
}

export interface DrinkEntry {
  id: string
  template_id: string | null
  template: DrinkTemplate | null
  custom_name: string | null
  ml: number
  abv: number
  timestamp: string  // ISO 8601, naive UTC from backend
  is_marked: boolean
  standard_units: number
}

export type FilterPeriod = 'today' | 'week' | 'month' | '3m' | 'year' | 'all'
```

- [ ] **Step 4: Create `frontend/src/utils.ts`**

```typescript
import type { DrinkEntry, FilterPeriod } from './types'

export function standardUnits(ml: number, abv: number): number {
  return (ml * abv / 100) / 10
}

/** Returns YYYY-MM-DD string for the local calendar date of a timestamp. */
function toLocalDateKey(isoTimestamp: string): string {
  // Backend stores naive UTC; treat as local for grouping purposes
  const d = new Date(isoTimestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function groupByDate(entries: DrinkEntry[]): { date: string; entries: DrinkEntry[] }[] {
  const map = new Map<string, DrinkEntry[]>()
  for (const entry of entries) {
    const key = toLocalDateKey(entry.timestamp)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getFilterStart(period: FilterPeriod): Date | null {
  const now = new Date()
  switch (period) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case 'month': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return d
    }
    case '3m': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      return d
    }
    case 'year': {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d
    }
    case 'all':
      return null
  }
}

/** Returns local midnight today as an ISO string, for confirm-all cutoff. */
export function localMidnightISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Returns today's YYYY-MM-DD key for comparison with groupByDate output. */
export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- --run
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/utils.ts frontend/src/utils.test.ts
git commit -m "feat: add frontend TypeScript types and utility functions"
```

---

## Task 11: Frontend — API client + TanStack Query hooks

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/templates.ts`
- Create: `frontend/src/api/entries.ts`

- [ ] **Step 1: Create `frontend/src/api/client.ts`**

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail)
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, body.detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
```

- [ ] **Step 2: Create `frontend/src/api/templates.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { DrinkTemplate } from '../types'

export const TEMPLATES_KEY = ['templates'] as const

export function useTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: () => apiFetch<DrinkTemplate[]>('/api/templates'),
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; default_ml: number; default_abv: number }) =>
      apiFetch<DrinkTemplate>('/api/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; name?: string; default_ml?: number; default_abv?: number }) =>
      apiFetch<DrinkTemplate>(`/api/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  })
}
```

- [ ] **Step 3: Create `frontend/src/api/entries.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './client'
import type { DrinkEntry } from '../types'
import { TEMPLATES_KEY } from './templates'

export const ENTRIES_KEY = ['entries'] as const

export function useEntries() {
  return useQuery({
    queryKey: ENTRIES_KEY,
    queryFn: () => apiFetch<DrinkEntry[]>('/api/entries'),
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      template_id?: string
      custom_name?: string
      ml: number
      abv: number
      timestamp: string
    }) => apiFetch<DrinkEntry>('/api/entries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; custom_name?: string; ml?: number; abv?: number; timestamp?: string }) =>
      apiFetch<DrinkEntry>(`/api/entries/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ENTRIES_KEY }),
  })
}

export function useConfirmAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cutoff: string) =>
      apiFetch<{ confirmed: number }>('/api/entries/confirm-all', {
        method: 'POST',
        body: JSON.stringify({ cutoff }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ENTRIES_KEY })
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
    },
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/
git commit -m "feat: add API client and TanStack Query hooks"
```

---

## Task 12: Frontend — shared components + App shell

**Files:**
- Create: `frontend/src/components/Toast.tsx`
- Create: `frontend/src/components/Modal.tsx`
- Create: `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/components/BottomNav.tsx`
- Replace: `frontend/src/App.tsx`

- [ ] **Step 1: Create `frontend/src/components/Toast.tsx`**

```tsx
import { useEffect } from 'react'

interface Props {
  message: string | null
  onDismiss: () => void
  durationMs?: number
}

export default function Toast({ message, onDismiss, durationMs = 2000 }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(t)
  }, [message, durationMs, onDismiss])

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <div className="bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">
        {message}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/Modal.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `frontend/src/components/EmptyState.tsx`**

```tsx
interface Props {
  message: string
}

export default function EmptyState({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-600">
      <div className="text-5xl mb-3">○</div>
      <p className="text-sm">{message}</p>
    </div>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/BottomNav.tsx`**

```tsx
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  BeakerIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  ClipboardDocumentListIcon as LogIconSolid,
  BeakerIcon as BeakerIconSolid,
  ChartBarIcon as ChartIconSolid,
} from '@heroicons/react/24/solid'

export type Tab = 'home' | 'log' | 'manage' | 'data'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>>; ActiveIcon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon, ActiveIcon: HomeIconSolid },
  { id: 'log', label: 'Log', Icon: ClipboardDocumentListIcon, ActiveIcon: LogIconSolid },
  { id: 'manage', label: 'Manage', Icon: BeakerIcon, ActiveIcon: BeakerIconSolid },
  { id: 'data', label: 'Data', Icon: ChartBarIcon, ActiveIcon: ChartIconSolid },
]

export default function BottomNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700">
      <div className="flex">
        {tabs.map(({ id, label, Icon, ActiveIcon }) => {
          const active = activeTab === id
          const Ic = active ? ActiveIcon : Icon
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                active
                  ? 'text-blue-500'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
            >
              <Ic className="w-6 h-6" />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Replace `frontend/src/App.tsx`**

```tsx
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottomNav, { type Tab } from './components/BottomNav'
import HomeTab from './tabs/HomeTab'
import LogTab from './tabs/LogTab'
import ManageTab from './tabs/ManageTab'
import DataTab from './tabs/DataTab'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

// Stub tabs so the app compiles before they are implemented
function StubTab({ name }: { name: string }) {
  return <div className="p-4 text-neutral-900 dark:text-neutral-100">{name}</div>
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 pb-16">
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'log' && <LogTab />}
        {activeTab === 'manage' && <ManageTab />}
        {activeTab === 'data' && <DataTab />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </QueryClientProvider>
  )
}
```

Create stub tab files so App.tsx compiles:

`frontend/src/tabs/HomeTab.tsx`:
```tsx
export default function HomeTab() { return <div className="p-4">Home</div> }
```

`frontend/src/tabs/LogTab.tsx`:
```tsx
export default function LogTab() { return <div className="p-4">Log</div> }
```

`frontend/src/tabs/ManageTab.tsx`:
```tsx
export default function ManageTab() { return <div className="p-4">Manage</div> }
```

`frontend/src/tabs/DataTab.tsx`:
```tsx
export default function DataTab() { return <div className="p-4">Data</div> }
```

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add shared components and app shell with bottom navigation"
```

---

## Task 13: Frontend — Home tab

**Files:**
- Replace: `frontend/src/tabs/HomeTab.tsx`

- [ ] **Step 1: Replace `frontend/src/tabs/HomeTab.tsx`**

```tsx
import { useState } from 'react'
import {
  PlusCircleIcon,
  BeakerIcon,
  ListBulletIcon,
} from '@heroicons/react/24/solid'
import { useTemplates } from '../api/templates'
import { useCreateEntry } from '../api/entries'
import { useUpdateTemplate } from '../api/templates'
import { ApiError } from '../api/client'
import Toast from '../components/Toast'
import Modal from '../components/Modal'
import { standardUnits } from '../utils'
import type { DrinkTemplate } from '../types'

export default function HomeTab() {
  const { data: templates = [] } = useTemplates()
  const createEntry = useCreateEntry()
  const updateTemplate = useUpdateTemplate()

  const [modal, setModal] = useState<'new' | 'enter-ml' | 'other' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const topFive = [...templates].sort((a, b) => b.usage_count - a.usage_count).slice(0, 5)

  function logFromTemplate(template: DrinkTemplate) {
    createEntry.mutate(
      {
        template_id: template.id,
        ml: template.default_ml,
        abv: template.default_abv,
        timestamp: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          updateTemplate.mutate({ id: template.id, usage_count: template.usage_count + 1 } as never)
          setToast(`Logged: ${template.name}`)
          setModal(null)
        },
      },
    )
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">DrinkLog</h1>

      <div className="flex flex-col gap-2 mb-6">
        <ActionCard
          title="New"
          subtitle="Create a new drink type"
          icon={<PlusCircleIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('new')}
        />
        <ActionCard
          title="Enter ml"
          subtitle="Quick amount, no name"
          icon={<BeakerIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('enter-ml')}
        />
        <ActionCard
          title="Other"
          subtitle="Pick from your drinks"
          icon={<ListBulletIcon className="w-6 h-6 text-blue-500" />}
          onClick={() => setModal('other')}
        />
      </div>

      {topFive.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2 uppercase tracking-wide">
            Quick Log
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {topFive.map((t) => (
              <button
                key={t.id}
                onClick={() => logFromTemplate(t)}
                className="flex-shrink-0 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-left active:scale-95 transition-transform"
              >
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                  {t.name}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                  {t.default_ml}ml · {t.default_abv.toFixed(1)}%
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <NewDrinkModal
        open={modal === 'new'}
        onClose={() => setModal(null)}
        templates={templates}
        onLogged={() => setModal(null)}
      />
      <EnterMlModal
        open={modal === 'enter-ml'}
        onClose={() => setModal(null)}
      />
      <OtherModal
        open={modal === 'other'}
        onClose={() => setModal(null)}
        templates={templates}
        onLogged={(name) => { setToast(`Logged: ${name}`); setModal(null) }}
      />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

// ── ActionCard ──────────────────────────────────────────────────────────────

function ActionCard({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-4 py-3.5 active:scale-[0.98] transition-transform text-left"
    >
      {icon}
      <div className="flex-1">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      </div>
      <span className="text-neutral-400 text-sm">›</span>
    </button>
  )
}

// ── NewDrinkModal ────────────────────────────────────────────────────────────

function NewDrinkModal({
  open,
  onClose,
  templates,
  onLogged,
}: {
  open: boolean
  onClose: () => void
  templates: DrinkTemplate[]
  onLogged: () => void
}) {
  const createEntry = useCreateEntry()
  const [name, setName] = useState('')
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const preview = !isNaN(mlNum) && !isNaN(abvNum) ? standardUnits(mlNum, abvNum) : null
  const isDuplicate = templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())
  const isValid = name.trim().length > 0 && !isNaN(mlNum) && !isNaN(abvNum)

  function handleSubmit() {
    if (isDuplicate) {
      setError(`"${name.trim()}" already exists — use Other to log it`)
      return
    }
    createEntry.mutate(
      { custom_name: name.trim(), ml: mlNum, abv: abvNum, timestamp: new Date().toISOString() },
      { onSuccess: () => { reset(); onLogged() } },
    )
  }

  function reset() { setName(''); setMl(''); setAbv(''); setError(null) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Drink">
      <div className="flex flex-col gap-3">
        {error && (
          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <Field label="Drink name">
          <input
            className={inputCls}
            placeholder="e.g. Lager, House Wine…"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            autoFocus
          />
        </Field>
        <Field label="Amount (ml)">
          <input className={inputCls} inputMode="decimal" placeholder="330" value={ml} onChange={(e) => setMl(e.target.value)} />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls} inputMode="decimal" placeholder="5.0" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        {preview !== null && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            Standard units: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{preview.toFixed(1)}</span>
          </p>
        )}
        <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn}>
          Log
        </button>
      </div>
    </Modal>
  )
}

// ── EnterMlModal ─────────────────────────────────────────────────────────────

function EnterMlModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createEntry = useCreateEntry()
  const [ml, setMl] = useState('')
  const [abv, setAbv] = useState('')

  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const preview = !isNaN(mlNum) && !isNaN(abvNum) ? standardUnits(mlNum, abvNum) : null
  const isValid = !isNaN(mlNum) && !isNaN(abvNum)

  function handleSubmit() {
    createEntry.mutate(
      { ml: mlNum, abv: abvNum, timestamp: new Date().toISOString() },
      { onSuccess: () => { setMl(''); setAbv(''); onClose() } },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Enter Amount">
      <div className="flex flex-col gap-3">
        <Field label="Amount (ml)">
          <input className={inputCls} inputMode="decimal" placeholder="330" value={ml} onChange={(e) => setMl(e.target.value)} autoFocus />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls} inputMode="decimal" placeholder="5.0" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        {preview !== null && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
            Standard units: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{preview.toFixed(1)}</span>
          </p>
        )}
        <button onClick={handleSubmit} disabled={!isValid} className={primaryBtn}>
          Log
        </button>
      </div>
    </Modal>
  )
}

// ── OtherModal ───────────────────────────────────────────────────────────────

function OtherModal({
  open,
  onClose,
  templates,
  onLogged,
}: {
  open: boolean
  onClose: () => void
  templates: DrinkTemplate[]
  onLogged: (name: string) => void
}) {
  const createEntry = useCreateEntry()
  const updateTemplate = useUpdateTemplate()
  const [search, setSearch] = useState('')

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  )

  function logTemplate(t: DrinkTemplate) {
    createEntry.mutate(
      { template_id: t.id, ml: t.default_ml, abv: t.default_abv, timestamp: new Date().toISOString() },
      {
        onSuccess: () => {
          updateTemplate.mutate({ id: t.id, usage_count: t.usage_count + 1 } as never)
          setSearch('')
          onLogged(t.name)
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={() => { setSearch(''); onClose() }} title="Other Drinks">
      <div className="flex flex-col gap-2">
        <input
          className={inputCls}
          placeholder="Search drinks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {filtered.length === 0 && (
          <p className="text-sm text-neutral-400 py-4 text-center">No drinks found</p>
        )}
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => logTemplate(t)}
              className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800 active:scale-[0.98] transition-transform text-left"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t.name}</p>
                <p className="text-xs text-neutral-500 tabular-nums">
                  {t.default_ml}ml · {t.default_abv.toFixed(1)}% · {standardUnits(t.default_ml, t.default_abv).toFixed(1)} units
                </p>
              </div>
              <span className="text-blue-500 text-lg">+</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

// ── shared helpers ───────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const primaryBtn =
  'w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</label>
      {children}
    </div>
  )
}
```

**Note on usage_count increment:** The `useUpdateTemplate` mutationFn signature doesn't include `usage_count`. Update `frontend/src/api/templates.ts` to accept `usage_count` as an optional field in `useUpdateTemplate`:

```typescript
// In templates.ts — replace the useUpdateTemplate mutationFn type:
mutationFn: ({
  id,
  ...data
}: {
  id: string
  name?: string
  default_ml?: number
  default_abv?: number
  usage_count?: number
}) =>
  apiFetch<DrinkTemplate>(`/api/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
```

Also update `backend/routers/templates.py` — add `usage_count` to `DrinkTemplateUpdate` in `backend/schemas.py`:

```python
class DrinkTemplateUpdate(BaseModel):
    name: Optional[str] = None
    default_ml: Optional[float] = None
    default_abv: Optional[float] = None
    usage_count: Optional[int] = None
```

And handle it in the router PUT:
```python
# After the name duplicate check, before the ml/abv lock check:
if data.usage_count is not None:
    template.usage_count = data.usage_count
```

- [ ] **Step 2: Build and start the dev stack**

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 &
cd frontend && npm run dev
```

Open `http://localhost:5173` in the browser.

- [ ] **Step 3: Manual verification**

- [ ] Three action cards render with icons and subtitles
- [ ] New modal: type a name/ml/abv, units preview updates live
- [ ] New modal: enter a name that matches an existing template → error message appears
- [ ] Enter ml modal: units preview updates live; entry is saved with no name
- [ ] Other modal: searchable; tapping a row closes the modal
- [ ] Favorites chips appear after logging templates via Other; tapping shows toast

- [ ] **Step 4: Kill dev servers and commit**

```bash
kill %1 %2 2>/dev/null
git add backend/schemas.py backend/routers/templates.py frontend/src/
git commit -m "feat: add Home tab with action cards, modals, and favorites chips"
```

---

## Task 14: Frontend — Log tab

**Files:**
- Replace: `frontend/src/tabs/LogTab.tsx`

- [ ] **Step 1: Replace `frontend/src/tabs/LogTab.tsx`**

```tsx
import { useState } from 'react'
import { TrashIcon, PencilIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useEntries, useDeleteEntry, useConfirmAll, useUpdateEntry } from '../api/entries'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { groupByDate, localMidnightISO, todayKey, standardUnits } from '../utils'
import type { DrinkEntry } from '../types'

export default function LogTab() {
  const { data: entries = [] } = useEntries()
  const deleteEntry = useDeleteEntry()
  const confirmAll = useConfirmAll()

  const [filter, setFilter] = useState<'unconfirmed' | 'confirmed'>('unconfirmed')
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set([todayKey()]))
  const [editingEntry, setEditingEntry] = useState<DrinkEntry | null>(null)

  const filtered = entries.filter((e) => e.is_marked === (filter === 'confirmed'))
  const groups = groupByDate(filtered)
  const today = todayKey()

  const hasEligibleToConfirm = entries
    .filter((e) => !e.is_marked)
    .some((e) => {
      const d = new Date(e.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return key < today
    })

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      next.has(date) ? next.delete(date) : next.add(date)
      return next
    })
  }

  function handleConfirmAll() {
    confirmAll.mutate(localMidnightISO())
  }

  return (
    <div className="flex flex-col h-screen pb-16">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 bg-neutral-50 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Log</h1>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto pb-28">
        {filtered.length === 0 ? (
          <EmptyState
            message={filter === 'confirmed' ? 'No confirmed entries' : 'No unconfirmed entries'}
          />
        ) : (
          <div className="px-4 flex flex-col gap-2 pt-2">
            {groups.map(({ date, entries: dayEntries }) => {
              const isExpanded = expandedDates.has(date)
              const totalUnits = dayEntries.reduce((s, e) => s + e.standard_units, 0)
              const label = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long', day: 'numeric', month: 'short',
              })
              return (
                <div key={date}>
                  {/* Day header */}
                  <button
                    onClick={() => toggleDate(date)}
                    className="w-full flex justify-between items-center py-2"
                  >
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {totalUnits.toFixed(1)} units
                      </span>
                      <span className="text-neutral-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Entries */}
                  {isExpanded && (
                    <div className="flex flex-col gap-1">
                      {dayEntries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          isConfirmed={filter === 'confirmed'}
                          onEdit={() => setEditingEntry(entry)}
                          onDelete={() => deleteEntry.mutate(entry.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Confirm All + segmented control */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 flex flex-col gap-2 bg-neutral-50/90 dark:bg-neutral-900/90 backdrop-blur-sm">
        {filter === 'unconfirmed' && (
          <button
            onClick={handleConfirmAll}
            disabled={!hasEligibleToConfirm || confirmAll.isPending}
            className="flex items-center justify-center gap-2 bg-blue-500 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white disabled:text-neutral-400 font-semibold text-sm py-2.5 rounded-full transition-colors"
          >
            <CheckCircleIcon className="w-5 h-5" />
            Confirm All
          </button>
        )}
        <div className="flex rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
          {(['unconfirmed', 'confirmed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  )
}

// ── EntryRow ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  isConfirmed,
  onEdit,
  onDelete,
}: {
  entry: DrinkEntry
  isConfirmed: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const displayName = entry.template?.name ?? entry.custom_name
  const canEdit = !isConfirmed && entry.template_id === null
  const time = new Date(entry.timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="flex items-center gap-2 bg-white dark:bg-neutral-800 rounded-xl px-3 py-2.5">
      <div className="flex-1 min-w-0">
        {displayName && (
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {displayName}
          </p>
        )}
        <p className="text-xs text-neutral-500 tabular-nums">
          {entry.ml}ml · {entry.abv.toFixed(1)}% · {time}
        </p>
      </div>
      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
        {entry.standard_units.toFixed(1)}
        <span className="text-xs font-normal text-neutral-400 ml-0.5">u</span>
      </span>
      {!isConfirmed && (
        <>
          {canEdit && (
            <button onClick={onEdit} className="p-1 text-neutral-400 hover:text-blue-500 transition-colors">
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button onClick={onDelete} className="p-1 text-neutral-400 hover:text-red-500 transition-colors">
            <TrashIcon className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  )
}

// ── EditEntryModal ────────────────────────────────────────────────────────────

function EditEntryModal({ entry, onClose }: { entry: DrinkEntry; onClose: () => void }) {
  const updateEntry = useUpdateEntry()
  const hasName = entry.custom_name !== null
  const [name, setName] = useState(entry.custom_name ?? '')
  const [ml, setMl] = useState(String(entry.ml))
  const [abv, setAbv] = useState(String(entry.abv))
  const [timestamp, setTimestamp] = useState(
    // datetime-local input expects "YYYY-MM-DDTHH:MM"
    new Date(entry.timestamp).toISOString().slice(0, 16),
  )

  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const preview = !isNaN(mlNum) && !isNaN(abvNum) ? standardUnits(mlNum, abvNum) : null
  const isValid =
    !isNaN(mlNum) && !isNaN(abvNum) && (!hasName || name.trim().length > 0)

  function handleSave() {
    const data: Parameters<typeof updateEntry.mutate>[0] = {
      id: entry.id,
      ml: mlNum,
      abv: abvNum,
      timestamp: new Date(timestamp).toISOString(),
    }
    if (hasName) data.custom_name = name.trim()
    updateEntry.mutate(data, { onSuccess: onClose })
  }

  return (
    <Modal open onClose={onClose} title="Edit Entry">
      <div className="flex flex-col gap-3">
        {hasName && (
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        )}
        <Field label="Amount (ml)">
          <input className={inputCls} inputMode="decimal" value={ml} onChange={(e) => setMl(e.target.value)} />
        </Field>
        <Field label="ABV (%)">
          <input className={inputCls} inputMode="decimal" value={abv} onChange={(e) => setAbv(e.target.value)} />
        </Field>
        <Field label="Time">
          <input className={inputCls} type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
        </Field>
        {preview !== null && (
          <p className="text-xs text-neutral-500 tabular-nums">
            Standard units: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{preview.toFixed(1)}</span>
          </p>
        )}
        <button onClick={handleSave} disabled={!isValid || updateEntry.isPending} className={primaryBtn}>
          Save
        </button>
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const primaryBtn =
  'w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Start dev stack and manually verify**

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 &
cd frontend && npm run dev
```

- [ ] Log a few entries via Home tab, then switch to Log tab
- [ ] Entries grouped by date; today's group expanded, yesterday's collapsed
- [ ] Toggle expand/collapse by tapping day header
- [ ] Segmented control switches Unconfirmed / Confirmed
- [ ] Delete button removes an entry; it disappears from the list
- [ ] Edit button (pencil) appears only on `template_id == null` entries
- [ ] Edit modal: name field only for custom_name entries; ml/abv/time editable
- [ ] Confirm All button enabled only when there are pre-today unconfirmed entries
- [ ] After Confirm All: entries move to Confirmed tab; templates created for New entries

- [ ] **Step 3: Kill dev servers and commit**

```bash
kill %1 %2 2>/dev/null
git add frontend/src/tabs/LogTab.tsx
git commit -m "feat: add Log tab with grouped entries, confirm-all, and edit flow"
```

---

## Task 15: Frontend — Manage tab

**Files:**
- Replace: `frontend/src/tabs/ManageTab.tsx`

- [ ] **Step 1: Replace `frontend/src/tabs/ManageTab.tsx`**

```tsx
import { useState } from 'react'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '../api/templates'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { ApiError } from '../api/client'
import type { DrinkTemplate } from '../types'

export default function ManageTab() {
  const { data: templates = [] } = useTemplates()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<DrinkTemplate | null>(null)
  const [deleting, setDeleting] = useState<DrinkTemplate | null>(null)
  const deleteTemplate = useDeleteTemplate()

  function handleDelete() {
    if (!deleting) return
    deleteTemplate.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Manage</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-blue-500 active:scale-95 transition-transform"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState message="No drink templates — tap + to add one" />
      ) : (
        <div className="flex flex-col gap-2">
          {[...templates]
            .sort((a, b) => b.usage_count - a.usage_count)
            .map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onEdit={() => setEditing(t)}
                onDelete={() => setDeleting(t)}
              />
            ))}
        </div>
      )}

      <TemplateModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        templates={templates}
      />
      {editing && (
        <TemplateModal
          open
          onClose={() => setEditing(null)}
          template={editing}
          templates={templates}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleting(null)} />
          <div className="relative z-10 bg-white dark:bg-neutral-900 rounded-2xl p-5 mx-4 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
              Delete "{deleting.name}"?
            </h3>
            <p className="text-sm text-neutral-500 mb-4">
              This template will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TemplateRow ───────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onEdit,
  onDelete,
}: {
  template: DrinkTemplate
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
          {template.name}
        </p>
        <p className="text-xs text-neutral-500 tabular-nums">
          {template.default_ml}ml · {template.default_abv.toFixed(1)}%
          {template.entry_count > 0 && ` · ${template.entry_count} ${template.entry_count === 1 ? 'entry' : 'entries'}`}
        </p>
      </div>
      <button onClick={onEdit} className="p-1.5 text-neutral-400 hover:text-blue-500 transition-colors">
        <PencilIcon className="w-4 h-4" />
      </button>
      {template.entry_count === 0 && (
        <button onClick={onDelete} className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors">
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ── TemplateModal ─────────────────────────────────────────────────────────────

function TemplateModal({
  open,
  onClose,
  template,
  templates,
}: {
  open: boolean
  onClose: () => void
  template?: DrinkTemplate
  templates: DrinkTemplate[]
}) {
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()

  const [name, setName] = useState(template?.name ?? '')
  const [ml, setMl] = useState(template ? String(template.default_ml) : '')
  const [abv, setAbv] = useState(template ? String(template.default_abv) : '')
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!template
  const mlAbvLocked = isEdit && template.confirmed_entry_count > 0

  const mlNum = parseFloat(ml)
  const abvNum = parseFloat(abv)
  const isValid =
    name.trim().length > 0 &&
    (mlAbvLocked || (!isNaN(mlNum) && !isNaN(abvNum)))

  function handleSave() {
    const trimmed = name.trim()
    const isDuplicate = templates.some(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.id !== template?.id,
    )
    if (isDuplicate) {
      setError(`"${trimmed}" already exists`)
      return
    }

    if (isEdit) {
      const data: Parameters<typeof updateTemplate.mutate>[0] = { id: template.id, name: trimmed }
      if (!mlAbvLocked) { data.default_ml = mlNum; data.default_abv = abvNum }
      updateTemplate.mutate(data, { onSuccess: () => { reset(); onClose() } })
    } else {
      createTemplate.mutate(
        { name: trimmed, default_ml: mlNum, default_abv: abvNum },
        { onSuccess: () => { reset(); onClose() } },
      )
    }
  }

  function reset() { setName(''); setMl(''); setAbv(''); setError(null) }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title={isEdit ? 'Edit Template' : 'New Template'}>
      <div className="flex flex-col gap-3">
        {error && (
          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <Field label="Name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            autoFocus
          />
        </Field>
        <Field label={`Amount (ml)${mlAbvLocked ? ' — locked' : ''}`}>
          <input
            className={inputCls + (mlAbvLocked ? ' opacity-50 cursor-not-allowed' : '')}
            inputMode="decimal"
            value={ml}
            onChange={(e) => setMl(e.target.value)}
            disabled={mlAbvLocked}
          />
        </Field>
        <Field label={`ABV (%)${mlAbvLocked ? ' — locked' : ''}`}>
          <input
            className={inputCls + (mlAbvLocked ? ' opacity-50 cursor-not-allowed' : '')}
            inputMode="decimal"
            value={abv}
            onChange={(e) => setAbv(e.target.value)}
            disabled={mlAbvLocked}
          />
        </Field>
        {mlAbvLocked && (
          <p className="text-xs text-neutral-400">
            ml and ABV are locked because this template has confirmed entries.
          </p>
        )}
        <button onClick={handleSave} disabled={!isValid} className={primaryBtn}>
          Save
        </button>
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const primaryBtn =
  'w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Start dev stack and manually verify**

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 &
cd frontend && npm run dev
```

- [ ] Template list sorted by usage_count desc
- [ ] `+` opens add modal; duplicate name shows error
- [ ] Tap pencil opens edit modal; ml/abv locked when template has confirmed entries (confirm some via Log tab first)
- [ ] Trash only visible on templates with zero entries
- [ ] Delete confirmation dialog appears; confirm removes the template

- [ ] **Step 3: Kill dev servers and commit**

```bash
kill %1 %2 2>/dev/null
git add frontend/src/tabs/ManageTab.tsx
git commit -m "feat: add Manage tab with template CRUD and delete guard"
```

---

## Task 16: Frontend — Data tab

**Files:**
- Replace: `frontend/src/tabs/DataTab.tsx`

- [ ] **Step 1: Replace `frontend/src/tabs/DataTab.tsx`**

```tsx
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useEntries } from '../api/entries'
import EmptyState from '../components/EmptyState'
import { groupByDate, getFilterStart } from '../utils'
import type { FilterPeriod } from '../types'

const PERIODS: { id: FilterPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: '3m', label: '3M' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
]

export default function DataTab() {
  const { data: allEntries = [] } = useEntries()
  const [period, setPeriod] = useState<FilterPeriod>('week')

  const start = getFilterStart(period)
  const filtered = start
    ? allEntries.filter((e) => new Date(e.timestamp) >= start)
    : allEntries

  const groups = groupByDate(filtered)
  const chartData = [...groups]
    .reverse()
    .map(({ date, entries }) => ({
      date,
      units: parseFloat(entries.reduce((s, e) => s + e.standard_units, 0).toFixed(2)),
      label: new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
      }),
    }))

  const totalEntries = filtered.length
  const totalUnits = filtered.reduce((s, e) => s + e.standard_units, 0)
  const avgPerDay = groups.length > 0 ? totalUnits / groups.length : 0
  const heaviest = [...groups].sort((a, b) =>
    b.entries.reduce((s, e) => s + e.standard_units, 0) -
    a.entries.reduce((s, e) => s + e.standard_units, 0),
  )[0]

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">Data</h1>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 mb-4">
        {PERIODS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPeriod(id)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              period === id
                ? 'bg-blue-500 text-white'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bar chart */}
      {chartData.length === 0 ? (
        <EmptyState message="No data for this period" />
      ) : (
        <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl p-4 mb-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)} units`, 'Units']}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}
              />
              <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill="#3b82f6" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard title="Total Entries" value={String(totalEntries)} />
        <SummaryCard title="Total Units" value={totalUnits.toFixed(1)} />
        <SummaryCard title="Avg / Day" value={avgPerDay.toFixed(1)} />
        <SummaryCard
          title="Heaviest Day"
          value={
            heaviest
              ? heaviest.entries.reduce((s, e) => s + e.standard_units, 0).toFixed(1)
              : '—'
          }
          subtitle={
            heaviest
              ? new Date(heaviest.date + 'T12:00:00').toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric',
                })
              : undefined
          }
        />
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string
  value: string
  subtitle?: string
}) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-4">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">{value}</p>
      {subtitle && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Start dev stack and manually verify**

```bash
cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 &
cd frontend && npm run dev
```

- [ ] Filter pills: tapping each changes the chart and cards
- [ ] Bar chart renders with one bar per day, correct heights
- [ ] Summary cards update correctly per filter period
- [ ] Empty state shown when no entries in the period

- [ ] **Step 3: Build production bundle**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Kill dev servers and commit**

```bash
kill %1 %2 2>/dev/null
git add frontend/src/tabs/DataTab.tsx
git commit -m "feat: add Data tab with filter pills, bar chart, and summary cards"
```

---

## Task 17: PWA — manifest, service worker, icons

**Files:**
- Modify: `frontend/vite.config.ts`
- Create: `frontend/public/icons/icon-192x192.png`
- Create: `frontend/public/icons/icon-512x512.png`
- Create: `frontend/create_icons.py`

- [ ] **Step 1: Generate placeholder icons**

```bash
cat > /tmp/create_icons.py << 'EOF'
import struct, zlib, os

def solid_png(size, rgb):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    raw = b''.join(b'\x00' + bytes(rgb) * size for _ in range(size))
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw))
            + chunk(b'IEND', b''))

os.makedirs('frontend/public/icons', exist_ok=True)
for s in [192, 512]:
    with open(f'frontend/public/icons/icon-{s}x{s}.png', 'wb') as f:
        f.write(solid_png(s, (37, 99, 235)))
print('Icons created: 192x192 and 512x512')
EOF
python3 /tmp/create_icons.py
```

Expected output: `Icons created: 192x192 and 512x512`

- [ ] **Step 2: Replace `frontend/vite.config.ts` with PWA config**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DrinkLog',
        short_name: 'DrinkLog',
        description: 'Track your alcohol consumption',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: Build with PWA plugin**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds. Check that `dist/` contains `manifest.webmanifest` and `sw.js`:

```bash
ls frontend/dist/manifest.webmanifest frontend/dist/sw.js
```

- [ ] **Step 4: Rebuild Docker containers and end-to-end test**

```bash
docker compose up --build -d
sleep 5
curl -s http://localhost/api/templates
curl -s http://localhost/ | head -5
curl -s http://localhost/manifest.webmanifest | python3 -m json.tool
```

Expected:
- `/api/templates` returns `[]`
- `/` returns HTML
- `/manifest.webmanifest` returns valid JSON with `name: "DrinkLog"`

- [ ] **Step 5: iPhone PWA test**

On an iPhone on the same Tailscale network, open Safari, navigate to the server's IP on port 80, tap Share → Add to Home Screen. Verify:
- App icon appears on home screen
- Opening the app shows it in standalone mode (no Safari chrome)
- All 4 tabs function

- [ ] **Step 6: Commit**

```bash
docker compose down
git add frontend/public/icons/ frontend/vite.config.ts
git commit -m "feat: add PWA manifest and service worker for home screen install"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Task(s) |
|---|---|
| DrinkTemplate model | Task 2 |
| DrinkEntry model | Task 2 |
| `entry_count`, `confirmed_entry_count` on templates | Task 2 (model properties), Task 3 (schema) |
| Templates CRUD | Task 5 |
| Entries CRUD | Task 6 |
| confirm-all with cutoff | Task 6 (router), Task 7 (tests) |
| ml/abv lock when confirmed entries exist | Task 5 (update endpoint) |
| Delete blocked with entries | Task 5 |
| Docker Compose + nginx | Task 8 |
| Frontend scaffold | Task 9 |
| TypeScript types + utilities | Task 10 |
| TanStack Query hooks | Task 11 |
| Shared components | Task 12 |
| Home: 3 cards, New/Enter ml/Other modals | Task 13 |
| Home: favorites chips + toast | Task 13 |
| Log: grouped by date, collapse/expand | Task 14 |
| Log: segmented control, delete, edit modal | Task 14 |
| Log: Confirm All floating button | Task 14 |
| Manage: template list, add/edit modal | Task 15 |
| Manage: ml/abv lock UI | Task 15 |
| Manage: delete guard + confirmation | Task 15 |
| Data: filter pills | Task 16 |
| Data: bar chart (Recharts) | Task 16 |
| Data: 2×2 summary cards | Task 16 |
| PWA manifest + service worker | Task 17 |
| Dark mode | Tasks 12–16 (Tailwind `dark:` variants throughout) |
| Git workflow, no co-author | All commit steps |
