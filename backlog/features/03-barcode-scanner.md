# Barcode Scanning Feature Implementation Plan

## Problem
Users currently have to manually search for or create templates for every drink. Adding a barcode scanner will allow for instant logging of known drinks and faster creation of new templates via the Open Food Facts (OFF) database.

## Objective
Implement a camera-based barcode scanner in the Home Tab that identifies products, pre-fills data from the OFF API, and manages module-specific templates with a visual "barcode-linked" indicator.

## Implementation Strategy

### 1. Database & Model Updates
- **Models**: Add `barcode: Mapped[str | None] = mapped_column(String, nullable=True)` to both `DrinkTemplate` and `CaffeineTemplate` in `backend/models.py`.
- **Indexing**: Add an index on the `barcode` columns for fast lookups.

### 2. Backend: OFF Proxy & Lookup
- **Endpoint**: `GET /api/barcode/{code}?module=alcohol|caffeine`
- **Logic**:
    1.  Check the module-specific table for the barcode.
    2.  If found: Return the existing template ID and data.
    3.  If not found: Call `https://world.openfoodfacts.org/api/v2/product/{code}.json`.
    4.  **Parsing**: 
        - Convert `quantity` (e.g., "33cl", "0.5 L", "500ml") to float `ml` using a robust regex.
        - Map `alcohol_value` to `abv`.
        - Map `caffeine_100g` or `caffeine_serving` to `mg`.
    5.  Return the parsed product info.

### 3. Frontend: Scanner UI
- **Library**: Add `html5-qrcode` to `frontend/package.json`.
- **Icon**: Implement a custom SVG in `HomeTab.tsx` header with focus corners (mimicking MUI `QrCodeScanner`).
- **Overlay**: A full-screen fixed container with a camera view and a "Close" button.

### 4. Integration Logic
- **Success - Local Match**:
    - Close scanner.
    - Open a specialized `LogTemplateModal` (or similar) that allows adjusting only `timestamp` and `count` for the matched template.
- **Success - New Item (OFF)**:
    - Close scanner.
    - Open `NewAlcoholModal` or `NewCaffeineModal`.
    - **Pre-fill**: `name` = `Product Name Ⓑ`.
    - **Highlighting**: If `abv`, `ml`, or `mg` were NOT found in the API, the corresponding input fields will receive a `border-dashed border-2` style.

## Technical Tasks

### Task 1: Backend Infrastructure
- Update `models.py` and run/apply migrations (or re-create DB if in dev).
- Implement the barcode router and integration with `httpx` to call Open Food Facts.
- Add unit tests for the regex parsing (cl, ml, l).

### Task 2: Frontend Scanner Component
- Create `BarcodeScanner.tsx` component using `html5-qrcode`.
- Ensure it handles camera permissions and the full-screen overlay correctly.
- Add the scanner icon to `HomeTab.tsx`.

### Task 3: Modal Refactoring
- Update `NewAlcoholModal` and `NewCaffeineModal` to handle "Pre-fill" state and dashed-border highlighting.
- Implement the logic to append `Ⓑ` to the pre-filled name.
- Create/Update a modal for logging a specific template immediately after scanning a match.

## Validation Criteria
1.  **Local Match**: Scan a beer already in the DB. The log dialog for that beer should appear immediately.
2.  **OFF Lookup**: Scan a new item. The "Add Template" modal should open with the name, abv, and ml pre-filled and the `Ⓑ` symbol visible.
3.  **Manual Edit**: Verify the user can remove the `Ⓑ` or change the pre-filled values before saving.
4.  **Dashed Border**: Scan an item with missing data (e.g., no ABV in OFF). Verify the ABV field is highlighted with a dashed border.
5.  **Module Isolation**: Ensure scanning in Caffeine mode only searches/adds to Caffeine templates.
