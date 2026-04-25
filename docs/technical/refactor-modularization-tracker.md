# WM2 Refactor Modularization Tracker

Last updated: 2026-04-19  
Audience: Technical maintainers  
Owner: Technical Maintainers

This tracker keeps the extraction sequence explicit so implementation stays aligned and low-risk.

## Phase Status

| Phase | Goal | Status | Notes |
|---|---|---|---|
| Phase 0 | Baseline and guardrails | Completed | Fixed regression checklist established; execute on each extraction checkpoint. |
| Phase 1 | Lock architecture rules | Completed | Dependency direction and layer constraints documented in architecture reference. |
| Phase 2 | Expand pure utility modules | Completed | Utility extractions in `foundation-utils.js`, `data-utils.js`, and `auth-utils.js` are active. |
| Phase 3 | Extract state container | Completed | `state-manager.js` selectors/mutators now back app state reads and writes. |
| Phase 4 | Create API and sync boundaries | Completed | `api-client.js` and `sync-service.js` are extracted and wired for queue/flush plus sync/config data boundaries. |
| Phase 5 | Extract domain services | Completed | `outbound-service.js`, `comments-service.js`, and `undo-service.js` are extracted and wired. |
| Phase 6 | Separate UI rendering and event routing | Completed | Comments/undo/filter/outbound/modal rendering extracted; dynamic and static controls route via delegated `data-action`; non-click shell/mode-sync handlers are bound in JS (inline attributes removed). |
| Phase 7 | Backend router hardening | Completed | `apps_script.js` now uses centralized action routing/guards and standardized success/error envelopes via shared helpers. |
| Phase 8 | Cleanup and enforce boundaries | Completed | Manual regression run signoff recorded with all checklist scenarios passing; non-blocking UX observations documented for later optimization. |

## Phase Definitions

### Phase 0: Baseline and guardrails
- Maintain a fixed regression checklist for:
  - login
  - sync
  - filters
  - modal edit/save
  - loose-stock location assignment
  - outbound draft/commit
  - comments
  - undo
  - role gates

### Phase 1: Lock architecture rules (blocks extraction)
- Dependency direction is fixed: `core -> api -> services -> ui -> bootstrap`.
- Rule: services cannot touch DOM.
- Rule: UI cannot call backend directly.

### Phase 2: Expand pure utility modules (parallel)
- Expand `foundation-utils.js` for formatting/normalization helpers from `app.js`.
- Expand `data-utils.js` for parse/group/filter/allocation pure logic.
- Expand `auth-utils.js` for permission/session predicates.

### Phase 3: Extract state container (depends on Phase 2)
- Encapsulate mutable globals in `state-manager.js`.
- Migrate reads first (selectors/getters), then writes (mutation methods).
- Add transitions for filters, modal, outbound, queue.

### Phase 4: Create API and sync boundaries (depends on Phase 3)
- Create `api-client.js` for Apps Script calls, retry/backoff, normalized responses.
- Create `sync-service.js` for offline queue, flush queue, full sync, config load.

### Phase 5: Extract domain services (depends on Phase 4; partially parallel)
- `outbound-service.js` for order lifecycle and commit orchestration.
- `comments-service.js` for comments workflow.
- `undo-service.js` for undo candidate load + execution.
- Services consume state-manager + api-client only.

### Phase 6: Separate UI rendering and event routing (depends on Phases 3-5)
- Split rendering into list/modal/outbound/filter renderer modules.
- Create `event-router.js` with delegated data-action events.
- Reduce `app.js` to bootstrap/composition root.

### Phase 7: Backend router hardening (parallel with late Phase 6)
- Refactor `apps_script.js` doPost branching into action map and centralized guards.
- Normalize success/error envelopes for consistent frontend handling.

### Phase 8: Cleanup and enforce boundaries
- Remove dead code from `app.js` after each extraction slice.
- Document module ownership and boundaries so new features land in the right layer.

## Current Active Slice

- Keep Phase 0 execution gate active by running the regression checklist at each major extraction checkpoint.
- Start Phase 6 by identifying renderer and event-routing seams in `app.js` and selecting first extraction target.
- Phase 6 started with comments renderer extraction (`comments-renderer.js`); continue with outbound/filter/modal renderer splits.
- Undo picker renderer extracted to `undo-renderer.js`; continue with higher-complexity outbound and filter renderer splits.
- Warehouse/floor filter chip rendering extracted to `filter-renderer.js`; remaining major UI split is outbound/modal rendering.
- Outbound line-card markup generation extracted to `outbound-renderer.js`; modal rendering and event-router extraction remain.
- Type filter chip rendering is now delegated via `filter-renderer.js`; next major UI extraction target is modal location rows.
- Modal location-row markup generation extracted to `modal-renderer.js`; next Phase 6 target is event-router delegation and remaining list/render seams.
- Event-router bootstrap added via `event-router.js` for delegated header action handling; continue migrating inline/direct handlers to routed actions.
- Event-router delegation expanded to core header actions (`sync`, `export`, `queue flush`, `undo`) with fallback listeners kept in `bindUiActions`.
- Event-router delegation now covers dynamic inventory/outbound actions (`open modal`, `toggle details`, `add/update outbound`, `cancel/save/commit line`) through `data-action` attributes.
- Modal close and comment submit controls now route through event-router `data-action` handlers, with fallback listeners retained.
- Modal row action controls (adjust/save stock, loose transfer, row edit, split/confirm) now use `data-action` routing instead of inline handlers.
- Outbound static controls (refresh, commit-all, tab switches, service-notice refresh) now use delegated `data-action` routing.
- Static toolbar/filter controls (unlock, clear search, filter panel toggle, stock/packet/all chips, attention, clear-all) now route through delegated `data-action` handlers.
- Modal background close now routes through delegated `close-modal-bg` action while preserving event-target guard behavior.
- Static non-click shell events (lock Enter key flow, location input filtering, sort select change) now bind via `bindUiActions` instead of inline attributes.
- Mode select synchronization now uses delegated `change` handling via `data-sync-mode-target` instead of inline `onchange` handlers.
- Phase 7 started: `apps_script.js` `doPost` now resolves actions through `ACTION_ROUTES` and evaluates auth/permission guards via shared `runActionGuards` before handler dispatch.
- Phase 7 response normalization advanced: router-level failures now use shared `errorResponse`, with safe request-body parsing (`parsePostBody`) and consistent error codes (`BAD_REQUEST`, `UNKNOWN_ACTION`, `SERVER_ERROR`, `AUTH_REQUIRED`, `FORBIDDEN`).
- Phase 6 closure audit complete: no remaining inline event-handler attributes were found in `index.html` or JS templates for common DOM events (`click`, `change`, `input`, `keydown`, `submit`, etc.).
- Phase 7 envelope normalization expanded: shared `successResponse` now backs core read/auth paths (`doGet`, `getData`, `getConfig`, `authenticate`, `listOrders`), and these paths now use explicit error codes for common failures (`NOT_FOUND`, `BAD_REQUEST`, `AUTH_INVALID`).
- Phase 7 envelope normalization expanded again across order/undo flows: `create/update/cancel/commit` order handlers and undo endpoints now return `successResponse` for success cases and coded `errorResponse` failures (`BAD_REQUEST`, `NOT_FOUND`, `INVALID_STATE`, `ALREADY_UNDONE`, `FORBIDDEN`, plus existing `CONFLICT`/`UNDO_WINDOW_EXPIRED`).
- Phase 7 envelope normalization now also covers split/append/comment/loose-stock workflows (`splitMove`, `appendRow`, `addComment`, `updateLooseQty`, `transferLooseQty`) via shared `successResponse`/`errorResponse` with explicit `BAD_REQUEST` and `NOT_FOUND` handling plus existing conflict metadata paths.
- Phase 7 closure audit complete: all backend success/error envelopes now route through shared `successResponse`/`errorResponse` helpers (direct handler-level `success: true/false` payload construction removed).
- Phase 8 started: technical ownership matrix added in `architecture-and-data-model.md` for frontend layers and backend router/guard/envelope responsibilities.
- Phase 8 dead-code sweep started in frontend bootstrap: fallback rendering branches removed for filter chips/comments now that renderer modules are mandatory script dependencies loaded before `app.js`.
- Phase 8 dead-code sweep expanded: outbound line rendering, modal location-row rendering, and undo picker rendering now unconditionally delegate to extracted renderer modules (legacy inline fallback templates removed).
- Phase 8 bootstrap cleanup advanced: redundant `typeof create*` module-existence guards were removed from client/service/router initializers in `app.js` because these modules are guaranteed by static script load order.
- Phase 8 state-wrapper cleanup advanced: `app.js` compatibility branches that checked for state-manager accessors/mutators before fallbacking to direct global writes were removed; wrappers now delegate directly to `state-manager.js` APIs.
- Phase 8 bootstrap provider cleanup advanced: top-level compatibility guards around `setPermissionProvider` and `bindStateProviders` were removed, and state-root accessors now read directly from state-manager bindings.
- Phase 8 static boundary audit complete: service modules show no runtime DOM coupling (excluding IIFE global attach boilerplate), UI modules show no direct backend transport calls, inline event-handler attributes are cleared, and parser checks pass across modularized JS files.
- Phase 8 exit gate remaining: execute the manual regression checklist in `docs/technical/regression-checklist.md` and record pass/fail signoff.
- Regression run template prepared for closeout signoff at `docs/technical/regression-runs/2026-04-18-phase8-closeout-template.md`.
- Phase 8 closeout readiness revalidated after latest app URL update commit: no fallback compatibility guards remain in `app.js`, no inline event-handler attributes remain in `index.html`/JS templates, and module-boundary static checks remain clean.
- Phase 8 manual regression signoff recorded in `docs/technical/regression-runs/2026-04-18-phase8-closeout-template.md`: all checklist areas passed; accepted non-blocking notes include minor outbound interaction lag and viewer-only local input edits without persistence.
- Post-closeout UX follow-up notes documented in `docs/technical/runbooks.md` for later optimization planning (outbound interaction lag and viewer-mode non-actionable input affordances).
