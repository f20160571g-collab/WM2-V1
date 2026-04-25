# WM2 Technical Reference: Runbooks

Last updated: 2026-04-19
Audience: Technical maintainers
Owner: Technical Maintainers

## 1. Operational Runbook: Startup and Health

### Goal

Confirm frontend and backend are correctly connected and usable.

### Steps

1. Open app and authenticate with a known active user.
2. Confirm `getConfig` and `getData` complete successfully.
3. Confirm inventory cards render and last sync updates.
4. Confirm role badge and gated controls match expected role.

### If Failure

- If auth fails, verify users configuration in Apps Script properties.
- If config/data fail, verify Apps Script deployment URL and access permissions.

## 2. Runbook: Offline Queue

### What it does

Queue-able mutations are stored locally when offline or on network failure and replayed when connectivity returns.

### Queue structure

- local storage key: `wh_offline_queue_v1`
- each item contains `id`, `kind`, `payload`, `createdAt`

### Replay behavior

- sequential replay
- stops on blocking semantic failure
- full sync after replay success

### Recovery steps when queue is blocked

1. Inspect error message shown in UI.
2. Run a manual refresh.
3. Re-apply failed action with current row state.
4. If auth error, relogin then flush queue again.

## 3. Runbook: Undo

### What is undoable

- row field updates
- split/move actions

### What is not undoable

- unsupported action types
- expired actions outside undo window
- already-undone target actions

### Undo checks

- action actor must match current actor
- action must be within configured time window
- action target must still be reversable against current state

### Recovery for undo failure

1. If window expired, perform manual correction as new action.
2. If source state changed, manually reconcile row values.
3. Record reconciliation in audit notes if needed.

## 4. Runbook: Outbound Lifecycle

### Lifecycle states

- `DRAFT`
- `PARTIAL`
- `COMPLETE`
- `CANCELLED`

### Normal flow

1. Create draft lines.
2. Update requested quantities and notes.
3. Allocate line quantities to concrete inventory rows.
4. Commit single line or commit all ready lines.
5. Review history tab for completed/cancelled lines.

### Commit requirements

- online mode
- matching allocation total
- placement and version consistency
- sufficient stock

### Recovery from commit conflict

1. Refresh orders and inventory.
2. Rebuild allocation using current row availability.
3. Retry commit.

## 5. Runbook: Partial Fulfillment and Residue

### Context

For unit-based rows (`qty` + `unit` present), fulfillments can consume partial packet quantity.

### Behavior

- backend computes full packets consumed plus remainder
- if remainder exists, residue packet entry is created or merged at same placement and SKU

### Merge logic

Residue merges only if all match:

- type
- size
- packet
- warehouse
- floor
- location
- unit
- qty per packet

### Failure handling

- insufficient stock: reject with conflict details
- placement/version mismatch: reject and require refresh/reallocation

## 6. Runbook: Conflict Management

### Conflict sources

- stale row version
- expected old value mismatch
- placement mismatch during order commit
- stock insufficiency

### Resolution pattern

1. Do not blind retry.
2. Refresh current data.
3. Re-open modal or order line.
4. Re-enter changes from current state.

## 7. Runbook: Roles and Access Troubleshooting

### Symptoms

- hidden or disabled buttons
- forbidden API responses

### Checks

1. Confirm role from config response.
2. Confirm permission requirements for attempted action.
3. Confirm UI permission helper state in frontend.
4. Confirm backend `requirePermission` branch for action.

## 8. Runbook: Deployment and Configuration Changes

### Update backend deployment URL

1. Deploy new Apps Script web app version.
2. Replace frontend URL in `CONFIG.APPS_SCRIPT_URL`.
3. Verify authenticate, getConfig, getData, and one mutation flow.

### Update warehouse/floor/packet options

1. Update backend allowed constants.
2. Verify config response contains updated lists.
3. Verify frontend filter options and edit controls reflect new values.

### Update users and roles

1. Update Apps Script properties for users and optional role assignments.
2. Verify login with affected users.
3. Verify UI and action permissions.

## 9. Regression Checklist

Run this after feature changes:

1. Login and session restore.
2. Inventory fetch and grouping render.
3. Stock quick save from modal.
4. Row edit save with placement changes.
5. Split and move success path.
6. Comment add flow.
7. Offline queue enqueue and replay.
8. Undo candidate list and one undo action.
9. Outbound create, allocate, commit single.
10. Outbound commit all with mixed outcomes.
11. Partial fulfillment residue merge/create path.

## 10. Runbook: Module Placement and Boundary Triage

Use this triage whenever a new change request arrives:

1. Classify the requested change:
	- pure transform/predicate logic -> `core` (`foundation-utils.js`, `data-utils.js`, `auth-utils.js`)
	- backend transport/payload wiring -> `api-client.js`
	- workflow orchestration -> `services` (`sync-service.js`, `outbound-service.js`, `comments-service.js`, `undo-service.js`)
	- markup or delegated UI interaction -> `ui` renderers/router modules
	- startup composition/wiring -> `app.js`
2. Confirm dependency direction remains `core -> api -> services -> ui -> bootstrap`.
3. Reject placements that would require:
	- DOM access from services
	- direct backend calls from UI render/event modules
	- transport logic inside bootstrap-only composition code

Backend triage rules:

1. Add/modify action routing in `ACTION_ROUTES` and guards in `runActionGuards`.
2. Return API envelopes through `successResponse`/`errorResponse` only.
3. Keep action-specific business behavior in handlers; move shared concerns into helpers.

## 11. Post-Closeout UX Follow-Ups

The Phase 8 regression signoff recorded two non-blocking UX observations that were accepted for later optimization:

1. Outbound interaction lag
	 - Observation: slight lag while opening outbound workspace and while add/update SKU actions are triggered.
	 - Impact: no functional/data-integrity issue observed; usability only.
	 - Suggested next pass:
		 - profile event handlers and render timing around outbound mode toggles and line updates
		 - check redundant rerenders in outbound UI update paths
		 - measure time-to-interaction before/after optimization

2. Viewer-mode editable-looking inputs
	 - Observation: in viewer role, some input fields can still be changed locally (for example comment author text and outbound qty fields) even though no write action is permitted.
	 - Impact: permission model remains enforced; backend write is blocked and no persistent mutation occurs.
	 - Suggested next pass:
		 - align viewer UX by disabling or readonly-marking non-actionable inputs
		 - add explanatory helper text/tooltips for read-only context
		 - verify role-gate consistency across modal and outbound panels

## 12. Runbook: Inbound Lifecycle

### Lifecycle states

- `DRAFT`
- `POSTED`
- `CANCELLED`

### Normal flow

1. Open inbound workspace.
2. Create one or more draft receipt lines with SKU, placement, received qty, and receipt date.
3. Update or cancel draft lines as needed.
4. Post single line or post all draft lines.
5. Verify posted/history tabs and inventory stock updates.

### Receipt date rules

- receipt date is required on every draft line
- future dates are not allowed
- backdated receipt date is allowed up to 90 days from today

### Post requirements

- online mode
- receipt line status must be `DRAFT`
- valid receipt date within 90-day cap
- positive received qty

### Post behavior

- if matching inventory row exists at same SKU and placement, stock is incremented
- if no matching row exists, a new inventory row is appended
- receipt line status transitions to `POSTED`
- audit captures actor, request id, and receipt date context

### Recovery from inbound post conflict/failure

1. Refresh receipts and inventory.
2. Re-check placement and quantity fields.
3. Retry post for failed lines only.

## 13. Change Log

- 2026-04-11: Added Phase A foundation baseline reference at `docs/technical/phase-a-foundation-baseline-2026-04-11.md`.
- 2026-03-29: Initial technical runbooks created.
- 2026-04-18: Added module placement and boundary triage runbook for Phase 8 maintenance.
- 2026-04-19: Added post-closeout non-blocking UX follow-up notes from Phase 8 regression signoff.
- 2026-04-19: Added inbound lifecycle runbook with receipt date and 90-day backdate rules.
