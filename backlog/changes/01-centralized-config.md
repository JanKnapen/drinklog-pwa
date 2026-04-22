# Centralized Unit Configuration Implementation Plan

## Problem
Currently, the unit divisors for alcohol (15.0) and caffeine (80.0) are hardcoded in both the backend (`models.py`) and frontend (`utils.ts`). Changing these requires manual updates in multiple files and code recompilation.

## Objective
Centralize these constants in a root `.env` file and use the backend as the single source of truth. The frontend will fetch these constants at runtime, ensuring consistency without leaking sensitive environment variables.

## Implementation Strategy

### 1. Root Configuration
Create a `.env` file at the project root to hold the constants.
- `ALCOHOL_UNIT_DIVISOR=15.0`
- `CAFFEINE_UNIT_DIVISOR=80.0`

### 2. Backend: Secure Config Layer
- **`backend/config.py`**: Create a configuration module that reads environment variables using `pydantic-settings` or `os.getenv`.
- **Whitelisting**: Define a specific dictionary or schema for "Public Configuration" that only includes non-sensitive constants.
- **API Endpoint**: Add a `GET /api/config` endpoint in `backend/main.py` (or a new router) that returns the whitelisted constants.

### 3. Backend: Model Integration
- Update `backend/models.py` to import the divisors from `config.py` instead of using hardcoded literals in the `@property` methods.

### 4. Frontend: Runtime Config Fetching
- **API Layer**: Add a fetcher for the new `/api/config` endpoint.
- **Context/State**: Fetch this configuration during app initialization (e.g., in `App.tsx` or a new `ConfigContext`).
- **Dynamic Calculation**: Update `frontend/src/utils.ts` to accept these divisors as parameters or ensure the utility functions use the values fetched from the API.

## Technical Tasks

### Task 1: Environment & Backend Config
- Create `.env` in the root.
- Update `docker-compose.yml` to pass these variables to the backend service.
- Create `backend/config.py` to parse these variables.
- Add `python-dotenv` to `backend/requirements.txt` if not already present.

### Task 2: Backend API & Models
- Implement `GET /api/config` in `backend/main.py`.
- Refactor `DrinkEntry.standard_units` and `CaffeineEntry.caffeine_units` in `backend/models.py` to use the config values.

### Task 3: Frontend Integration
- Create `frontend/src/api/config.ts` to handle the API call.
- Modify `frontend/src/utils.ts` calculation functions to be more flexible.
- Ensure the UI (previews in modals) uses the latest values from the backend.

## Security Considerations
- **No `VITE_` variables**: We will NOT use Vite's built-in env system for these constants to avoid build-time baking and to maintain the backend as the authority.
- **Explicit Whitelist**: Only variables explicitly added to the FastAPI config response will be visible to the frontend.

## Validation Criteria
1.  **Backend Accuracy**: Verify `/api/config` returns the values from `.env`.
2.  **Consistency**: Log a drink and verify the units calculated on the backend match the units displayed on the frontend.
3.  **Hot-Reload**: Change a value in `.env`, restart the backend container, and verify the frontend reflects the change without a rebuild.
