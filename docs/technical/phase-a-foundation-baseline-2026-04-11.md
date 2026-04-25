# WM2 Phase A Foundation Baseline (2026-04-11)

Last updated: 2026-04-17
Audience: Technical maintainers
Owner: Technical Maintainers

## Purpose

This document is the Foundation Phase A baseline snapshot. It locks current behavior and structure before any modular refactor work begins.

Baseline anchor:
- Git tag: `pre-phase1-baseline-2026-04-11`
- Commit: `1402488`

## A1. Feature Freeze Rules

During Phase A and until Phase A exit criteria pass:

1. Allowed: bug fixes that restore existing behavior.
2. Allowed: documentation updates for runbooks and contracts.
3. Not allowed: net-new features.
4. Not allowed: broad UI redesign.
5. Not allowed: behavior-changing refactors.

Exception process:
1. Document reason and impact.
2. Update this baseline doc before merge.
3. Re-run the full checklist in section A3.

## A2. Structural Baseline Metrics

Captured from current `main` at baseline date.

| Metric | Value |
|---|---:|
| app.js lines | 1976 |
| apps_script.js lines | 2052 |
| index.html lines | 201 |
| styles.css lines | 385 |
| frontend named function count in app.js | 92 |
| top-level `let` declarations in app.js | 23 |
| `onclick=` occurrences in app.js templates | 22 |
| `onclick=` occurrences in index.html | 28 |
| backend router style | Explicit `if (action===...)` chain in doPost |

## A3. Behavioral Baseline Checklist

Run this checklist before Phase B starts and after each foundation phase.

| ID | Workflow | Expected baseline behavior | Status |
|---|---|---|---|
| A3-01 | Login and unlock | Valid credentials unlock app; invalid credentials show error | Pending |
| A3-02 | Session restore | Existing valid session bypasses lock screen on reload | Pending |
| A3-03 | getConfig/getData | App loads config and inventory without error banner | Pending |
| A3-04 | Filters/search | Search and all filter chips change visible list correctly | Pending |
| A3-05 | Modal open | Opening a card shows matching rows and totals | Pending |
| A3-06 | Quick stock save | +/- and save update stock and sync correctly | Pending |
| A3-07 | Row edit save | Warehouse/floor/location and qty/unit changes persist | Pending |
| A3-08 | Split/move | Split creates/updates target row and source row adjusts | Pending |
| A3-09 | Comments | Add comment updates list and persists after refresh | Pending |
| A3-10 | Outbound draft flow | Add/update/remove line works in outbound workspace | Pending |
| A3-11 | Outbound commit | Commit line updates inventory and order status | Pending |
| A3-12 | Commit all | Mixed success/failure summary renders correctly | Pending |
| A3-13 | Undo | Undo candidates load and one valid undo succeeds | Pending |
| A3-14 | Offline queue | Offline mutation queues and replays when online | Pending |
| A3-15 | Manual refresh | Refresh updates list and timestamps correctly | Pending |

## A4. Performance Reference Capture Sheet

Record values on representative data volume and typical operator device/browser.

| Metric | Run 1 | Run 2 | Run 3 | Notes |
|---|---:|---:|---:|---|
| Initial load to first render (ms) |  |  |  |  |
| Manual refresh completion (ms) |  |  |  |  |
| Filter response time (ms) |  |  |  |  |
| Modal open latency (ms) |  |  |  |  |
| Outbound tab switch latency (ms) |  |  |  |  |
| Commit single line completion (ms) |  |  |  |  |

## A5. Phase A Exit Criteria

Phase A is complete only when all conditions are true:

1. Freeze rules are accepted and followed.
2. All A3 checklist items are marked Pass at least once on current baseline.
3. Any known failures are logged with owner and fix plan.
4. Performance reference table has at least 3 captured runs.
5. Baseline tag and commit are unchanged as rollback target.

## A6. Ownership and Signoff

| Role | Owner | Date | Signoff |
|---|---|---|---|
| Technical maintainer |  |  |  |
| Product owner |  |  |  |
| QA/operations verifier |  |  |  |

## A7. Gate Run Log

### Gate Run 1 (2026-04-11, automated static pass)

Scope:
1. Syntax/error scan on refactor-touched files.
2. Script load order verification for extracted modules.
3. Duplicate function-name collision check across module files.
4. Helper call-site sanity check from app integration points.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js`, `index.html`, `foundation-utils.js`, `auth-utils.js`, `data-utils.js`.
2. Script order in `index.html` verified as: `foundation-utils.js` -> `auth-utils.js` -> `data-utils.js` -> `app.js`.
3. No duplicate top-level function names found across extracted modules and `app.js`.
4. Extracted helper call sites resolved from `app.js` after module split.

Open gate items:
1. A3-01 through A3-15 remain manual verification items and must be executed in browser before leaving Phase A.
2. A4 performance table still requires 3 captured runs.

### Gate Run 2 (2026-04-11, automated static pass after filter-state migration)

Scope:
1. Phase C starter slice: centralized filter state introduced via `appState.filters`.
2. Filter/search paths migrated from standalone globals to `appState.filters`.
3. Export filter-summary generation migrated to `appState.filters`.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` after migration.
2. Legacy filter globals removed (`currentTypeFilter`, `currentStockFilter`, `currentPacketFilter`, `currentWhFilter`, `currentFloorFilter`, `showAttentionOnly`).
3. Filter usage references moved to `appState.filters` across filter chips, apply logic, and PDF export.

Open gate items:
1. Manual browser regression required for A3-04 through A3-12 before continuing Phase C expansion.
2. A4 performance capture table still requires 3 runs.

### Gate Run 3 (2026-04-11, automated static pass after search/location/sort state migration)

Scope:
1. Added centralized state fields for `search`, `location`, and `sort` under `appState.filters`.
2. Migrated filter execution path to read from centralized state.
3. Migrated PDF filter summary to use centralized search/location state.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` after migration.
2. `applyFilters()` now synchronizes UI inputs into `appState.filters` before filtering.
3. `updateFilterBadge()` now reads location state from `appState.filters.location`.

Open gate items:
1. Manual browser regression required for A3-04 through A3-12 with focus on location input, sort changes, search clear button, and PDF filter summary.
2. A4 performance capture table still requires 3 runs.

### Gate Run 4 (2026-04-11, automated static pass after modal-state migration)

Scope:
1. Added centralized modal state under app state (`currentGroup`, `isOpen`, `pendingAutoRefresh`).
2. Migrated sync pause/resume behavior to use centralized modal state.
3. Migrated modal open/save/close helpers and auto-refresh timer checks to centralized modal state.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` after migration.
2. Legacy modal globals removed in favor of app-state-backed modal fields.
3. Modal-aware refresh checks now reference centralized modal state in both manual and interval sync paths.

Open gate items:
1. Manual browser regression required for A3-05 through A3-12 with focus on modal open/close, modal save flows, split/move, and deferred refresh behavior while modal is open.
2. A4 performance capture table still requires 3 runs.

### Gate Run 5 (2026-04-11, automated static pass after outbound/UI state migration)

Scope:
1. Added centralized outbound state under app state (`orderModeActive`, `captureMode`, `tab`, `commitAllSummary`).
2. Added centralized UI action binding state under app state (`actionsBound`).
3. Migrated outbound mode toggle, capture toggle, tab switching, outbound rendering, and commit-all summary wiring to centralized state.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` after migration.
2. Legacy outbound/UI globals removed in favor of app-state-backed fields.
3. Outbound visibility and button state checks in `updateRoleUI()` now reference centralized outbound state.

Open gate items:
1. Manual browser regression required for A3-10 through A3-12 with focus on outbound open/close, capture mode, tab switching, commit-all summary visibility, and add/update/remove line actions.
2. A4 performance capture table still requires 3 runs.

### Gate Run 6 (2026-04-11, outbound commit behavior fix for pcs-per-packet rows)

Scope:
1. Treat `pcs` unit rows as packet-based in outbound allocation metadata.
2. Treat `pcs` unit rows as packet-based during backend commit fulfillment processing.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` and `apps_script.js`.
2. Frontend allocation metadata no longer classifies `pcs` rows as unit-split rows.
3. Backend commit fulfillment now routes `pcs` rows through packet commit path (no residue creation for full-box commit quantities).

Open gate items:
1. Manual browser regression required for outbound commit on a `pcs` row: commit quantity `1` must reduce stock by one packet only and must not create a residue row.
2. A4 performance capture table still requires 3 runs.

### Gate Run 7 (2026-04-11, packet-only outbound fulfillment model)

Scope:
1. Aligned outbound fulfillment to packet/unit stock consumption only (`final stock` is the committed quantity source).
2. Kept `qty per unit` and `unit` as descriptive metadata during outbound commit (no residue-line behavior).
3. Enforced whole-number outbound quantities in capture/update and allocation payload paths.

Result:
- PASS (automated static checks)

Evidence:
1. No editor errors in `app.js` and `apps_script.js`.
2. Outbound request/edit inputs now use whole-unit steps (`min=1`, `step=1`).
3. Backend commit fulfillment loop now only applies packet stock decrements and no longer executes unit-split packet residue creation.

Open gate items:
1. Manual browser verification required with scenario: `A, 10, 100, pcs` commit `3` from one location -> `A, 7, 100, pcs` and no new duplicate row.
2. A4 performance capture table still requires 3 runs.

### Gate Run 8 (2026-04-17, dual-mode fulfillment implementation slice 1)

Scope:
1. Added outbound line mode model (`UNIT` and `BASE`) with requested UOM persistence (`unit`/`pcs`/`kg`) in `Orders` schema.
2. Added inventory loose-quantity column handling (`L`) and base-fulfillment consumption logic in commit flow.
3. Added frontend mode-aware outbound drafting/allocation/edit controls and mode-specific numeric validation.

Result:
- PASS (automated static checks)

Evidence:
1. JavaScript syntax checks pass for `app.js`, `apps_script.js`, `data-utils.js`, and `foundation-utils.js`.
2. `Orders` sheet auto-upgrades headers to include `Requested Mode` and `Requested UOM`.
3. Backend commit path now supports:
	- `UNIT`: packet stock decrement only.
	- `BASE`: consumes available base qty from `stock * qty/unit + loose qty`, updates `stock` and `loose qty` without creating residue rows.

Open gate items:
1. Manual browser regression required for both modes:
	- `UNIT`: existing packet-only commit scenarios remain unchanged.
	- `BASE pcs`: whole-number base commits, with stock + loose updates.
	- `BASE kg`: decimal base commits, with stock + loose updates.
2. Confirm `Consolidated(Man)` column `L` is available and reserved for loose qty values in production sheet.
3. A4 performance capture table still requires 3 runs.

### Gate Run 9 (2026-04-18, loose-stock location assignment)

Scope:
1. Added backend actions to edit loose qty per row and transfer loose qty between locations.
2. Added modal UI controls for loose qty save and transfer workflows.
3. Added validation for loose qty in append-row path and updated API/data-model docs.

Result:
- PASS (automated static checks)

Evidence:
1. JavaScript syntax checks pass for `app.js` and `apps_script.js`.
2. Apps Script router now supports `updateLooseQty` and `transferLooseQty` write actions.
3. Modal row UI now exposes loose save and transfer controls with unit-aware validation (pcs integer, kg decimal).

Open gate items:
1. Manual browser verification required for loose flows:
	- Save loose qty on existing row.
	- Transfer loose qty to existing destination row.
	- Transfer loose qty to non-existing destination row (creates stock=0 destination row).
2. Confirm audit visibility for `LOOSE_UPDATED`, `LOOSE_TRANSFERRED_OUT`, and `LOOSE_TRANSFERRED_IN` actions in operations workflow.
3. A4 performance capture table still requires 3 runs.

### Gate Run 10 (2026-04-18, loose hardening and undo coverage)

Scope:
1. Prevented split/move from copying loose qty into newly created split rows.
2. Extended undo action support to include loose update and loose transfer-out actions.
3. Added audit-driven validation in loose undo paths to reject stale reversals.

Result:
- PASS (automated static checks)

Evidence:
1. JavaScript syntax checks pass for `apps_script.js` after hardening changes.
2. `SPLIT_MOVE` new-row path now initializes loose qty to `0` instead of cloning source loose qty.
3. Undo action selector now includes `LOOSE_UPDATED` and `LOOSE_TRANSFERRED_OUT` via backend action filters.

Open gate items:
1. Manual browser verification required:
	- Split/move row with non-zero loose qty and confirm no duplicate loose qty on new split row.
	- Undo `LOOSE_UPDATED` and confirm row loose qty reverts correctly.
	- Undo `LOOSE_TRANSFERRED_OUT` and confirm both source and destination loose qty revert.
2. A4 performance capture table still requires 3 runs.

### Gate Run 11 (2026-04-18, targeted undo request-id reliability)

Scope:
1. Fixed targeted undo lookup to prefer undoable entries when multiple audit rows share one request ID.
2. Ensured loose transfer request IDs resolve to `LOOSE_TRANSFERRED_OUT` for undo path, instead of non-undoable paired rows.

Result:
- PASS (automated static checks)

Evidence:
1. JavaScript syntax checks pass for `apps_script.js` after lookup fix.
2. `findAuditEntryByRequestId()` now returns an undoable action when available for the same request ID.

Open gate items:
1. Manual browser verification required: targeted undo by request ID for a loose transfer should succeed (same behavior as "undo latest").
2. A4 performance capture table still requires 3 runs.

### Gate Run 12 (2026-04-18, full-state restore for transfer-created destination rows)

Scope:
1. Extended loose transfer undo to delete destination rows that were created by the original transfer action.
2. Added safety checks so created-row deletion only happens when destination row still matches expected created-row state.

Result:
- PASS (automated static checks)

Evidence:
1. JavaScript syntax checks pass for `apps_script.js` after undo enhancement.
2. Undo result now returns `destinationDeleted=true` when transfer-created destination row is removed.

Open gate items:
1. Manual browser verification required: transfer loose to a new destination row, then undo and confirm destination row is removed.
2. A4 performance capture table still requires 3 runs.
