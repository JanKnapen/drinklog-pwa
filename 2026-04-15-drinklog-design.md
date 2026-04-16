# DrinkLog — Design Spec
_Date: 2026-04-15_

## Overview

DrinkLog is a SwiftUI iOS app (iOS 17+) for tracking alcohol consumption throughout the day. Each drink entry records ml and ABV; units are normalised to "standard drinks" (1 unit = 10ml pure alcohol). No cutoff rules — timestamps are saved as-is.

---

## Data Models

### DrinkTemplate
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | Must be unique across all templates |
| defaultMl | Double | |
| defaultAbv | Double | |
| usageCount | Int | Incremented each time this template is used to log an entry |
| entries | [DrinkEntry] | SwiftData @Relationship, deleteRule: .nullify |

No `isFavorite` field. "Favourites" is a computed view concept: the top 5 templates by `usageCount`.

### DrinkEntry
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| template | DrinkTemplate? | @Relationship, nullified on template delete |
| customName | String? | Set only for unconfirmed "New" entries (pending template creation) |
| ml | Double | |
| abv | Double | |
| timestamp | Date | Saved as-is, no adjustments |
| isMarked | Bool | false = unconfirmed, true = confirmed |

**Computed:** `standardUnits = (ml × abv / 100) / 10.0`

**Display name resolution:** `template?.name ?? customName ?? nil` (Enter ml entries show no name)

### Relationship
`DrinkEntry.template` → `DrinkTemplate` with `deleteRule: .nullify` and `inverse: \DrinkEntry.template`.

---

## App Entry Point

`DrinkLogApp.swift` creates a `ModelContainer` for `[DrinkTemplate.self, DrinkEntry.self]` and injects it via `.modelContainer()`. No seed data — the app starts empty.

---

## File Structure

```
DrinkLog/
  DrinkLogApp.swift
  Models/
    DrinkTemplate.swift
    DrinkEntry.swift
  Views/
    Home/
      HomeView.swift
      NewDrinkSheet.swift
      EnterMlSheet.swift
      OtherDrinkSheet.swift
      FavoriteChipsRow.swift
    Log/
      LogView.swift
      EntryEditSheet.swift
    Manage/
      ManageView.swift
      TemplateEditSheet.swift
    Data/
      DataView.swift
      DrinkBarChart.swift
  Utilities/
    StandardUnits.swift
    ToastModifier.swift
```

---

## Tab 1 — Home

**Navigation:** root tab, icon `house`.

### Action buttons (stacked, full-width, 56pt tall, cornerRadius 12, 8pt gaps)

**New**
- Sheet with fields: name → ml → abv.
- Name uniqueness enforced: if a `DrinkTemplate` with that name already exists, show a snackbar error and block saving. User must use "Other" to log against an existing template.
- On save: creates a `DrinkEntry` with `customName` = entered name, `ml`, `abv`, `timestamp = now`, `isMarked = false`. **No template is created at this point.**
- Template creation is deferred until confirmation (see Log tab).

**Enter ml**
- Sheet with fields: ml + abv only.
- Saves a `DrinkEntry` with `template = nil`, `customName = nil`, `isMarked = false`.
- These entries display no name anywhere in the app.

**Other**
- Opens a modal sheet with a searchable `List` of all `DrinkTemplate` records, sorted by `usageCount` desc.
- Tapping a row immediately logs a `DrinkEntry` linked to that template using its `defaultMl` and `defaultAbv`, increments `usageCount`, and dismisses the sheet. No intermediate confirmation sheet.

### Favorites chips

Horizontal `ScrollView` below the buttons. Shows the top 5 templates by `usageCount` as tappable chip buttons (cornerRadius 12).

- Tapping a chip: logs a `DrinkEntry` with the template's default ml/abv, increments `usageCount`, shows a brief toast at the bottom of the screen ("Logged: [name]", 2 seconds).
- No long-press or unfavourite action — top-5 is computed automatically.
- Section is hidden if fewer than 1 template exists.

---

## Tab 2 — Log

**Navigation:** icon `list.bullet.clipboard`.

### Layout

`List` of entries sorted newest-first, grouped by calendar date. A segmented control pinned to the bottom switches between **Unconfirmed** (`isMarked == false`) and **Confirmed** (`isMarked == true`).

**Day headers:** date label (e.g. "Tuesday, 15 Apr") + total standard units for that day. Today's group is expanded by default; all others start collapsed. Tapping a header toggles expansion.

### Unconfirmed mode

**Row display:** display name (template name or customName; omitted for Enter ml entries), ml, abv%, standard units, timestamp.

**Tap to edit:** only for entries where `template == nil` (i.e. "New" pending-template entries and "Enter ml" raw entries).
- Edit sheet fields: name (editable for New entries only), ml, abv, timestamp (DatePicker).
- Saving updates the `DrinkEntry` in place. Does not create or modify any template.
- Entries linked to an existing template (logged via "Other") are not tap-editable.

**Swipe to delete:** available on all unconfirmed entries.

**Floating "Confirm All" button** (above segmented control):
- Sets `isMarked = true` on all unconfirmed entries whose `timestamp` is before today's calendar start.
- For each such entry that has `customName != nil` and `template == nil` (a pending "New" entry):
  - Create a `DrinkTemplate` with `name = customName`, `defaultMl = entry.ml`, `defaultAbv = entry.abv`, `usageCount = 1`.
  - Link `entry.template` to the new template.
  - Clear `entry.customName`.
- Enter ml entries (`customName == nil`, `template == nil`) are simply marked confirmed; no template is created.
- Today's entries are not touched.

**Warning badge:** none (duplicate template names are blocked at entry time).

### Confirmed mode

Read-only list. No tap action. No swipe-to-delete. Confirmed entries are permanent records.

---

## Tab 3 — Manage

**Navigation:** icon `wineglass`.

`List` of all `DrinkTemplate` records sorted by `usageCount` desc. `+` button top-right opens an add sheet.

**Row display:** name, defaultMl, defaultAbv%. No usageCount shown.

### Add sheet (`+`)
Fields: name, ml, abv. Name uniqueness enforced (snackbar error on conflict). On save: creates `DrinkTemplate` with `usageCount = 0`.

### Edit sheet (tap row)
- **No confirmed entries on this template:** all fields editable (name, ml, abv). Name uniqueness enforced (excluding the current template). Changing ml/abv does not retroactively update existing entries.
- **Any confirmed entries on this template:** only name is editable; ml and abv fields are locked/greyed out.

### Delete (swipe)
- **Template has any linked entries (confirmed or unconfirmed):** swipe-to-delete is disabled. No delete available.
- **Template has no linked entries:** swipe-to-delete shows a confirmation alert ("Delete [name]?") before removing.

---

## Tab 4 — Data

**Navigation:** icon `chart.bar`.

### Filter bar
Pill-style single-select buttons: Today | Week | Month | 3M | Year | All. Default: Week.

### Bar chart (Swift Charts)
- X axis: calendar date. Y axis: total standard units for that day.
- One bar per day that has at least one entry within the selected period.
- No reference line.

### Summary cards
2×2 grid of rounded cards (cornerRadius 12), all reflecting the active filter period:
- Total entries
- Total standard units
- Average units/day
- Heaviest day (date + unit count)

---

## Design System

- **Colour:** system background, label, secondaryLabel. Accent: systemBlue. Use Color assets — no hardcoded colours.
- **Typography:** SF Pro (system default).
- **Spacing:** 16pt margins, 8pt gaps.
- **Corners:** cornerRadius 12 on cards and chips.
- **Icons:** SF Symbols throughout. No custom assets.
- **Modes:** full light + dark mode support.

---

## Engineering Notes

- `@Model` for SwiftData entities. `@Query` for fetching.
- `#Preview` macros on every View.
- Build target: iOS Simulator (no code signing required).
- Git: initialise repo in project root. Commit after each tab is confirmed building. Conventional commit messages, no AI attribution.

---

## Git Workflow

- Initialise a git repository in the project root if one does not exist.
- Commit after each tab is complete and confirmed building on the simulator.
- Commit message format: `feat: add Home tab with favorites and quick-log buttons`
- No co-author lines, AI attribution, or "Generated by" footers.
