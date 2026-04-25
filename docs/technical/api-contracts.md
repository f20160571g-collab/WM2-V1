# WM2 Technical Reference: API Contracts

Last updated: 2026-04-19
Audience: Technical maintainers
Owner: Technical Maintainers

All actions are sent as JSON to Apps Script `doPost` with an `action` field.

## 1. Common Request Pattern

Typical request envelope:

- `action`: backend action name
- `token`: session token (except authenticate)
- `requestId`: client mutation id (for traceability)
- `actor`: display actor name
- action-specific fields

## 2. Common Response Pattern

Success responses include:

- `success: true`
- action-specific payload

Failure responses include:

- `success: false`
- `error`
- optional `code` (for example `AUTH_REQUIRED`, `FORBIDDEN`, `CONFLICT`)
- optional conflict details

## 3. Action Matrix

| Action | Permission | Description |
|---|---|---|
| `authenticate` | none | Validate username/password and create session token |
| `getConfig` | `canRead` | Return runtime config, role, permissions, flags |
| `getData` | `canRead` | Return inventory values, row versions, comments |
| `updateRowFields` | `canWrite` | Update stock/qty/unit/placement fields |
| `updateLooseQty` | `canWrite` | Update loose base quantity for a row |
| `transferLooseQty` | `canWrite` | Transfer loose base quantity between locations |
| `splitMove` | `canWrite` | Split stock or relocate stock row |
| `appendRow` | `canWrite` | Append a new inventory row |
| `addComment` | `canWrite` | Add comment for item and size |
| `createOrderDraft` | `canOrderCommit` | Create outbound draft line |
| `listOrders` | `canRead` | List order lines and statuses |
| `updateOrderLine` | `canOrderCommit` | Update requested qty, notes, mode, and UOM |
| `cancelOrderLine` | `canOrderCommit` | Cancel order line |
| `commitOrderFulfillment` | `canOrderCommit` | Commit allocated fulfillment |
| `createReceiptDraft` | `canOrderCommit` | Create inbound draft line |
| `listReceipts` | `canRead` | List inbound receipt lines and statuses |
| `updateReceiptLine` | `canOrderCommit` | Update inbound draft line fields including receipt date |
| `cancelReceiptLine` | `canOrderCommit` | Cancel inbound draft line |
| `postReceipt` | `canOrderCommit` | Post inbound draft and merge/create inventory stock |
| `undo` | `canUndo` | Undo eligible recent action |
| `listUndoCandidates` | `canUndo` | Fetch undoable actions in time window |

## 4. Detailed Contracts

### 4.1 authenticate

Request fields:

- `username`
- `password`

Success response fields:

- `token`
- `expiresInSec`
- `actor`
- `role`
- `authMode`

Failure examples:

- invalid credentials
- missing username

### 4.2 getConfig

Request fields:

- `token`

Success response fields include:

- `warehouses`
- `floors`
- `packetTypes`
- `role`
- `permissions`
- `actor`
- `username`
- `authMode`
- `roles`
- `searchAliases`
- `featureFlags`

### 4.3 getData

Request fields:

- `token`

Success response fields:

- `inventoryValues`
- `rowVersions`
- `commentValues`
- `serverTime`

### 4.4 updateRowFields

Request fields:

- `row`
- `fields` object with one or more of:
  - `stock`
  - `qty`
  - `unit`
  - `warehouse`
  - `floor`
  - `location`
- `expectedVersion`
- `expectedOld` object (optional but recommended)

Rules:

- warehouse/floor/location must update together
- stock must be non-negative integer
- qty must be non-negative number
- unit must be empty, `kg`, or `pcs`

Success response fields:

- `row`
- `changedFields`
- `currentVersion`

Conflict and failure cases:

- stale version
- old value mismatch
- invalid placement or numeric values

### 4.5 splitMove

Request fields:

- `row`
- `keepStock`
- `moveStock`
- `newLocation`
- `newPacket`
- optional `newQty`
- optional `newUnit`
- `expectedVersion`

Rules:

- `keepStock + moveStock` must match current stock
- move stock must be positive
- packet and placement values must be valid

Success response fields:

- `row`
- `mode` (`split` or `relocation`)
- optional `newRowNum`
- `currentVersion`

### 4.6 appendRow

Request fields:

- `rowData` with inventory schema fields

Success response fields:

- `newRowNum`

### 4.7 addComment

Request fields:

- `item`
- `size`
- `comment`
- `author`

Success response fields:

- `timestamp`
- `item`
- `size`
- `author`

### 4.8 createOrderDraft

Request fields:

- optional `orderId`
- `line` with:
  - `type`
  - `size`
  - `packet`
  - `requestedQty`
  - optional `requestedMode` (`UNIT` or `BASE`)
  - optional `requestedUom` (`unit`, `pcs`, `kg` depending on mode)
  - optional `notes`

Success response fields:

- `orderId`
- `lineId`
- `status`

### 4.9 listOrders

Request fields:

- optional `includeClosed`
- optional `actorFilter`

Success response fields:

- `orders` array

### 4.10 updateOrderLine

Request fields:

- `orderId`
- `lineId`
- `requestedQty`
- `notes`
- optional `requestedMode` (`UNIT` or `BASE`)
- optional `requestedUom` (`unit`, `pcs`, `kg` depending on mode)

Success response fields:

- `status`

### 4.11 cancelOrderLine

Request fields:

- `orderId`
- `lineId`

Success response fields:

- `status`

### 4.12 commitOrderFulfillment

Request fields:

- `orderId`
- `lineId`
- `fulfillQty`
- `allocations` array entries with:
  - `row`
  - `qty`
  - `warehouse`
  - `floor`
  - `location`
  - `expectedVersion`

Rules:

- allocation total must equal fulfill quantity
- each allocation row must match order SKU
- each allocation row placement must match expectation
- version conflicts reject commit
- stock sufficiency required
- `UNIT` mode consumes packet stock (whole numbers only)
- `BASE` mode consumes base quantity using `stock * qty/unit + loose qty` and updates both stock and loose qty

Success response fields:

- `orderId`
- `lineId`
- `fulfilledQty`
- `requestedQty`
- `requestedMode`
- `requestedUom`
- `status`

### 4.13 updateLooseQty

Request fields:

- `row`
- `looseQty`
- `expectedVersion`

Rules:

- row must have valid qty/unit metadata (`pcs` or `kg`)
- loose qty must be non-negative
- `pcs` loose qty must be whole number

Success response fields:

- `row`
- `looseQty`
- `currentVersion`

### 4.14 transferLooseQty

Request fields:

- `sourceRow`
- `transferQty`
- `destination` object with:
  - `warehouse`
  - `floor`
  - `location`
  - optional `createIfMissing`
- `expectedVersion` (source row)

Rules:

- source and destination location cannot be same
- transfer qty must be > 0 and <= source loose qty
- `pcs` transfer qty must be whole number
- destination row must match SKU and qty/unit metadata or will be created (if `createIfMissing` is true)

Success response fields:

- `sourceRow`
- `destinationRow`
- `destinationCreated`
- `transferQty`
- `unit`
- `sourceLooseQty`
- `destinationLooseQty`
- `sourceCurrentVersion`
- `destinationCurrentVersion`

### 4.15 undo

Request fields:

- optional `targetRequestId` (if omitted, latest undoable action for actor is targeted)

Rules:

- only actor's own actions
- only supported action types
- currently supported: `ROW_FIELDS_UPDATE`, `SPLIT_MOVE`, `LOOSE_UPDATED`, `LOOSE_TRANSFERRED_OUT`
- only within undo window
- no double undo for same target request

Undo behavior note:

- For `LOOSE_TRANSFERRED_OUT`, if the original transfer created a new destination row, undo deletes that row when it is still in created-row state.

Success response fields:

- `undoneRequestId`
- `undoneAction`
- `details`

### 4.16 listUndoCandidates

Request fields:

- optional `limit`

Success response fields:

- `actions` array
- `undoWindowMinutes`

### 4.17 createReceiptDraft

Request fields:

- optional `receiptId`
- `line` with:
  - `type`
  - `size`
  - `packet`
  - `warehouse`
  - `floor`
  - `location`
  - `receivedQty` (whole number)
  - `receiptDate` (`YYYY-MM-DD`, required)
  - optional `qtyPerUnit`
  - optional `unit` (`kg` or `pcs`)
  - optional `looseQty`
  - optional `notes`

Rules:

- receipt date is required
- receipt date cannot be in future
- receipt date can be backdated at most 90 days
- loose qty requires qty/unit metadata

Success response fields:

- `receiptId`
- `lineId`
- `status`
- `receiptDate`

### 4.18 listReceipts

Request fields:

- optional `includeClosed`
- optional `actorFilter`

Success response fields:

- `receipts` array

### 4.19 updateReceiptLine

Request fields:

- `receiptId`
- `lineId`
- `line` object (same fields as `createReceiptDraft`)

Rules:

- only `DRAFT` lines are editable
- receipt date boundary rules match draft creation

Success response fields:

- `receiptId`
- `lineId`
- `status`
- `receiptDate`

### 4.20 cancelReceiptLine

Request fields:

- `receiptId`
- `lineId`

Rules:

- only draft lines can be cancelled

Success response fields:

- `status`

### 4.21 postReceipt

Request fields:

- `receiptId`
- `lineId`

Rules:

- online only (frontend enforced)
- only `DRAFT` lines can be posted
- posting merges stock into matching inventory row or appends a new row
- posted rows transition to `POSTED`

Success response fields:

- `receiptId`
- `lineId`
- `status`
- `row`
- `stock`
- `receiptDate`

## 5. Error Codes and Handling Expectations

Common backend codes:

- `AUTH_REQUIRED`: token missing or expired
- `FORBIDDEN`: role lacks required permission
- `CONFLICT`: stale or mismatched data state
- `UNDO_WINDOW_EXPIRED`: undo request outside allowed time window

Frontend handling expectation:

- Retry only on retryable network errors.
- Do not auto-retry semantic conflicts.
- Refresh and reallocate after conflict.
- Reauthenticate after auth required.

## 6. API Change Management Rules

When adding or changing actions:

1. Update backend router and permission guard mapping.
2. Update this contract document in same change set.
3. Update frontend mutation wrappers.
4. Add or update troubleshooting notes for new failure mode.

## 7. Change Log

- 2026-03-29: Initial API contracts reference created.
- 2026-04-19: Added inbound draft/list/update/cancel/post action contracts with receipt date boundary rules.
