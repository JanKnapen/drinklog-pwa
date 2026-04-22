# Quick Log Jump Prevention Implementation Plan

## Problem
Currently, the quick log buttons on the Home Tab "jump" or reorder immediately after being tapped. This is caused by:
1.  **Category Migration:** A drink moving from "Most Used" to "Today" (currently rendered below it).
2.  **Immediate Re-sorting:** Re-ranking "Today" items by timestamp/frequency instantly after a log.

## Objective
Provide a stable UI where buttons do not move while the user is actively logging from the Quick Log section. The UI should only refresh when the user navigates back to the tab or performs a "manual" action from the top cards.

## Implementation Strategy

### 1. Stability Snapshotting
Move the ranking logic in `HomeTab.tsx` into a state-managed "snapshot".
- **State Definition:** Create a `snapshot` state that holds the calculated `todayTopTwo`, `alltimeItems`, and `pendingDrinks`.
- **Initialization:** Calculate the snapshot on component mount or when the `activeModule` changes.
- **Update Triggers:**
    - **Tab Navigation:** Since `HomeTab` is unmounted when switching tabs (in `App.tsx`), the snapshot will naturally refresh on return.
    - **Manual Actions:** The "New", "Enter amount", and "Other" actions (the `ActionCard` buttons) should trigger a `refreshSnapshot()` call after a successful log to reflect new templates or significant data changes.
    - **Quick Log Tap:** Tapping a `TemplateButton` in the Quick Log section **must NOT** trigger a snapshot refresh. The log happens in the background via the adapter, but the UI remains static.

### 2. Visual "Gravity Flip"
Reorder the rendered sections to move active items to the top and rename headers.
- **Header:** "Quick Log" (uppercase header)
- **Top Section:** Today's Top 2 templates.
- **Separator:** A small text label "Most used" (only shown if all-time favorites follow today's favorites).
- **Middle Section:** All-time favorites (filling remaining slots up to 5 total).
- **Bottom Section:** The "New drinks" button (for unconfirmed manual entries).

## Technical Tasks

### Task 1: Refactor `HomeTab.tsx` Logic
- Define a `QuickLogSnapshot` interface.
- Implement a `refreshSnapshot` function using `useCallback` that performs the existing filtering/sorting logic.
- Use `useEffect` to call `refreshSnapshot` on mount and when `activeModule` changes.
- Use a `useRef` or similar check to ensure we don't snapshot before the data (from `useModuleAdapter`) is actually loaded from the server.

### Task 2: Update UI Rendering
- Swap the mapping order: Render `todayTopTwo` first, then `alltimeItems`.
- Rename the existing "Today" separator label to "Most used".
- Ensure conditional rendering for the "Most used" label (only if both sections have content).

### Task 3: Hook up Refresh Triggers
- Update the `onLogged` callbacks for `NewAlcoholModal`, `NewCaffeineModal`, `EnterAlcoholModal`, `EnterCaffeineModal`, and `OtherModal`.
- These callbacks should now call `refreshSnapshot()` in addition to showing the toast.
- **Crucial:** Do NOT add `refreshSnapshot()` to the `onClick` of the `TemplateButton`s in the main list.

## Validation Criteria
1.  **No Jump on Tap:** Log a drink from the "Most used" section. It should NOT disappear or move to "Today" immediately.
2.  **Top Actions Update:** Log a drink via "Other" or "Enter amount". The Quick Log list SHOULD refresh to show the new state.
3.  **Tab Stability:** Navigate to "Log" tab and back to "Home". The Quick Log list SHOULD show the updated rankings.
4.  **Module Switch:** Switch between Alcohol and Caffeine. The list should update correctly for the new module.
