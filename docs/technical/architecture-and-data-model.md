# WM2 Technical Reference: Architecture and Data Model

Last updated: 2026-04-19
Audience: Technical maintainers
Owner: Technical Maintainers

## 1. System Architecture

WM2 is a Google Sheets backed warehouse inventory system with:

- Frontend: single-page app in `app.js`, `index.html`, `styles.css`
- Backend: Google Apps Script in `apps_script.js`
- Storage: Google Sheets tabs

Core backend entry points:

- `doPost(e)` for action routing
- `doGet(e)` for health response

Core frontend runtime flow:

- Session bootstrap
- Config load
- Data sync
- UI render
- User mutations with optimistic conflict checks

## 2. Runtime Data Flow

1. Frontend authenticates with `action: authenticate`.
2. Backend returns token and role context.
3. Frontend calls `getConfig` to load:
   - warehouses
   - floors
   - packet types
   - role and permissions
   - feature flags
4. Frontend calls `getData` to fetch inventory rows, row versions, and comments.
5. Frontend parses and groups rows for display and filtering.
6. Mutations include request metadata and expected version data.
7. Backend validates and applies updates.
8. Audit rows are appended for mutation traceability.

## 3. Sheets and Schemas

### 3.1 Inventory Sheet

Sheet name: `Consolidated(Man)`

Columns:

| Column | Field | Meaning |
|---|---|---|
| A | Type | Item type |
| B | Size | Size descriptor |
| C | Details | Variant/detail text |
| D | Packet | Packet type |
| E | Warehouse | Warehouse code |
| F | Floor | Floor code |
| G | Stock | Packet count |
| H | Location | Shelf/bin location |
| I | Notes | Free text notes |
| J | Qty | Quantity per packet (optional) |
| K | Unit | Unit label (`kg` or `pcs`, optional) |
| L | Loose Qty | Loose base quantity at this row/location (optional) |

### 3.2 Comments Sheet

Sheet name: `Comments`

Columns:

| Column | Field |
|---|---|
| A | Timestamp |
| B | Item |
| C | Size |
| D | Comment |
| E | Author |

### 3.3 Orders Sheet

Sheet name: `Orders`

Columns include created/updated times, order and line IDs, status, actor, SKU, requested and fulfilled quantities, notes, last allocation JSON, and last request ID.

### 3.4 Receipts Sheet

Sheet name: `Receipts`

Columns include created/updated/posted times, receipt and line IDs, status, actor, SKU, placement, received quantity, optional qty/unit metadata, loose quantity, receipt date, and last request ID.

### 3.5 Audit Sheet

Sheet name: `Audit`

Columns include timestamp, action, actor, request ID, status, placement context, SKU context, old/new values, change text, notes, and sheet row.

## 4. Identity, Auth, and Session

- Token TTL is 24 hours.
- Tokens are cached in Apps Script `CacheService`.
- Session TTL is refreshed on each valid request.
- Frontend stores token and timestamps in session storage.

Authentication implementation anchors:

- Backend: `handleAuthenticate`, `requireValidSession`
- Frontend: `unlockApp`, `checkSession`, `saveSession`

## 5. Roles and Permissions

Role definitions:

- `viewer`: read only
- `operator`: read and write
- `manager`: read, write, undo, outbound commit
- `admin`: full access

Permission gates exist in both backend and frontend.

Backend enforcement:

- `requirePermission` is called per action group in `doPost`.

Frontend enforcement:

- `hasPermission` helper family
- UI state updates in `updateRoleUI`

## 6. Feature Flags

Backend defines feature flags and returns them via `getConfig`:

- `rolesEnabled`
- `orderModeEnabled`
- `offlineQueueEnabled`

Frontend stores runtime flags and checks them before enabling relevant workflows.

## 7. Frontend State Model

Important frontend state objects include:

- `rawData`: parsed row-level inventory
- `groups`: grouped cards by SKU key
- `filtered`: currently visible groups
- `allComments`: comments cache
- `mutationQueue`: offline mutation queue
- `orderLines`: outbound lines
- `receiptLines`: inbound lines
- `undoCandidates`: recent undoable actions

Important runtime mode flags:

- `orderModeActive`
- `outboundCaptureMode`
- `outboundTab`
- `inboundModeActive`
- `inboundTab`
- `isModalOpen`
- `pendingAutoRefresh`

## 8. Grouping and Search Model

Grouping key is based on type, size, and packet type.

Search and filters are applied on grouped rows and placement data, including:

- type
- size
- details
- warehouse
- floor
- location

Filters include stock status, packet, warehouse, floor, location text, and attention state.

## 9. Concurrency and Conflict Model

Concurrency is optimistic, with row version hashing:

- Frontend sends `expectedVersion` and selected old values.
- Backend compares current row state and returns conflict on mismatch.
- Conflict response includes `code: CONFLICT` with context.

Split/move and order commit use lock-protected critical sections with `LockService` document lock.

## 10. Audit Model

Audit is append-only and used for:

- operational traceability
- undo target lookup
- actor and request tracking

Common action values include:

- `ROW_FIELDS_UPDATE`
- `SPLIT_MOVE`
- `ROW_APPENDED`
- `ORDER_CREATED`
- `ORDER_UPDATED`
- `ORDER_CANCELLED`
- `ORDER_COMMITTED`
- `UNDO`

## 11. Deployment and Config Notes

Apps Script deployment model:

- deploy backend as web app
- configure frontend `CONFIG.APPS_SCRIPT_URL`

Configuration constants are in:

- frontend `CONFIG` object in `app.js`
- backend constants in `apps_script.js`

Operational prerequisites:

- required sheet names exist or can be auto-created as implemented
- Apps Script properties for users and optional role assignments are configured

## 12. Known Design Constraints

- Undo only supports selected action types.
- Final outbound commit requires online mode.
- Final inbound post requires online mode.
- Inbound receipt date is required and backdated posting is capped at 90 days.
- Queue replay may stop on non-retryable failures and requires manual review.
- Comments are not part of undo operations.

## 13. Modularization Boundary Rules

Dependency direction for frontend extraction is fixed as:

- `core -> api -> services -> ui -> bootstrap`

Layer ownership:

- `core`: pure utility and data transformation modules (`foundation-utils.js`, `data-utils.js`, `auth-utils.js`).
- `api`: transport and response normalization (`api-client.js`).
- `services`: workflow orchestration and write/read operations (`sync-service.js`, `outbound-service.js`, `comments-service.js`, `undo-service.js`).
- `ui`: DOM rendering and event handling modules (`comments-renderer.js`, `undo-renderer.js`, `filter-renderer.js`, `outbound-renderer.js`, `modal-renderer.js`, `event-router.js`).
- `bootstrap`: app composition and startup orchestration (`app.js`).

Hard constraints:

- Services must not read from or write to DOM nodes.
- UI modules must not call backend transport directly; they must call service functions.
- API layer must not reference UI concerns.
- Core layer must remain side-effect free.

Acceptance checks for extracted modules:

- No `document`/`window` usage in service modules.
- No direct `fetch`/Apps Script transport calls in UI render/event code.
- Dependency imports/calls only point one direction along the layer chain.

## 14. Ownership Matrix

Frontend ownership map:

| Module | Layer | Primary responsibility |
|---|---|---|
| `foundation-utils.js` | core | String/date/number and shared low-level helpers |
| `data-utils.js` | core | Parse/group/filter/allocation pure transforms |
| `auth-utils.js` | core | Session/permission predicates |
| `api-client.js` | api | Apps Script transport and envelope handling |
| `sync-service.js` | services | Queue flush/full sync/config/data orchestration |
| `outbound-service.js` | services | Outbound draft/update/commit workflows |
| `inbound-service.js` | services | Inbound draft/update/post workflows |
| `comments-service.js` | services | Comment fetch/write workflow |
| `undo-service.js` | services | Undo candidate load and undo execution workflow |
| `comments-renderer.js` | ui | Comments panel markup |
| `undo-renderer.js` | ui | Undo candidate picker markup |
| `filter-renderer.js` | ui | Warehouse/floor/type filter chip markup |
| `outbound-renderer.js` | ui | Outbound line-card markup |
| `inbound-renderer.js` | ui | Inbound line-card markup |
| `modal-renderer.js` | ui | Modal location-row markup |
| `event-router.js` | ui | Delegated `data-action` click routing |
| `app.js` | bootstrap | Startup, wiring, state composition, and fallback listeners |

Backend ownership map:

| Module | Responsibility |
|---|---|
| `apps_script.js` router (`doPost`) | Action dispatch through `ACTION_ROUTES` and shared guard pipeline (`runActionGuards`) |
| `apps_script.js` guards | Session/permission enforcement via `requireValidSession` and `requirePermission` |
| `apps_script.js` envelope helpers | Consistent API envelopes via `successResponse` and `errorResponse` |
| `apps_script.js` handlers | Action-specific business logic and audit writes |

## 15. Contributor Placement Checklist

Before opening a change, route work using this quick checklist:

1. Is the change pure transformation/predicate logic with no IO?
   - Place in `core` (`foundation-utils.js`, `data-utils.js`, `auth-utils.js`).
2. Is the change backend transport or payload normalization?
   - Place in `api-client.js`.
3. Is the change workflow/business orchestration (queue, outbound, inbound, comments, undo)?
   - Place in `services` (`sync-service.js`, `outbound-service.js`, `inbound-service.js`, `comments-service.js`, `undo-service.js`).
4. Is the change markup generation or delegated UI event routing?
   - Place in `ui` renderer/router modules.
5. Is the change only composition/wiring/startup ordering?
   - Place in `app.js` bootstrap.

Backend checklist:

1. Add new actions in `ACTION_ROUTES` and gate through `runActionGuards`.
2. Return envelopes through `successResponse`/`errorResponse` helpers only.
3. Keep handler logic action-specific; keep shared concerns in helper functions.

## 16. Change Log

- 2026-03-29: Initial technical architecture and data model reference created.
- 2026-04-18: Added modularization dependency direction and hard layer boundaries.
- 2026-04-18: Added frontend/backend ownership matrix and updated module ownership to reflect extracted services/renderers/router boundaries.
- 2026-04-18: Added contributor placement checklist for frontend/backend boundary-safe changes.
- 2026-04-19: Added inbound lifecycle architecture notes, Receipts sheet model, and inbound module ownership entries.
