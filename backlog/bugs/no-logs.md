# Plan - Fix missing log notifications in HomeTab

The user reported that log notifications (Toasts) are missing for "New", "Enter ml/mg", and "Quick log" actions on the Home tab, while they work for "Other" and "New drinks".

## Analysis
- **Quick log**: `TemplateButton` in `HomeTab.tsx` calls `adapter.logFromTemplate(t)` but doesn't call `onToast`.
- **New**: `NewAlcoholModal` and `NewCaffeineModal` in `HomeTab.tsx` have an `onLogged` callback that doesn't pass the name and doesn't trigger `onToast` in the parent.
- **Enter ml/mg**: `EnterAlcoholModal` and `EnterCaffeineModal` do not have an `onLogged` callback at all.

## Proposed Changes

### 1. Update `useModuleAdapter.ts`
- Change `logFromTemplate` to return `Promise<void>` (using `mutateAsync`) so it can be awaited if needed, though for quick log we might just call it and show toast immediately.
- Actually, keep it simple: just ensure it's easy to call `onToast` after it. Making it return a Promise is cleaner for consistency.

### 2. Update `HomeTab.tsx`

#### Quick Log
- Update `TemplateButton` click handler to call `onToast(`Logged: ${t.name}`)`.

#### New Drink (Alcohol/Caffeine)
- Update `NewAlcoholModal` and `NewCaffeineModal` props to include `onLogged: (name: string) => void`.
- In `NewAlcoholModal.handleSubmit` and `NewCaffeineModal.handleSubmit`, call `onLogged(name.trim())`.
- In `HomeTab` render, update `onLogged` to `(name) => { onToast(`Logged: ${name}`); setModal(null) }`.

#### Enter Amount (Alcohol/Caffeine)
- Update `EnterAlcoholModal` and `EnterCaffeineModal` props to include `onLogged: (val: string) => void`.
- In `EnterAlcoholModal.handleSubmit`, call `onLogged(`${ml}ml`)` on success.
- In `EnterCaffeineModal.handleSubmit`, call `onLogged(`${mg}mg`)` on success.
- In `HomeTab` render, add `onLogged={(val) => { onToast(`Logged: ${val}`); setModal(null) }}`.

## Verification Plan
1. Click a template button (Quick Log) -> verify toast appears.
2. Click "New", fill and log -> verify toast appears with drink name.
3. Click "Enter ml/mg", fill and log -> verify toast appears with amount.
4. Verify both Alcohol and Caffeine modes.
