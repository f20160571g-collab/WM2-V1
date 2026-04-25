# WM2 Regression Checklist Baseline

Last updated: 2026-04-18  
Audience: Technical maintainers, release testers  
Owner: Technical Maintainers

Use this checklist before and after each extraction slice. Mark each item Pass/Fail and capture notes.

## Test Run Metadata

- Environment:
- Build/commit:
- Tester:
- Date/time:

## Fixed Regression Checklist

| Area | Scenario | Steps | Expected Result | Status | Notes |
|---|---|---|---|---|---|
| Login | Unlock with valid credentials | 1) Open app. 2) Enter valid user and password. 3) Submit unlock. | App shell opens, role badge appears, data loads without auth error. |  |  |
| Login | Invalid credential handling | 1) Enter invalid credentials. 2) Submit unlock. | Lock screen remains, error text displayed, no app shell access. |  |  |
| Sync | Manual refresh | 1) Click Refresh. 2) Wait for completion. | Sync indicator animates then returns normal; data and timestamp update; no stale error state. |  |  |
| Sync | Offline behavior | 1) Disable network. 2) Trigger refresh or write action. | User sees offline-safe message/queue behavior; app does not crash. |  |  |
| Filters | Combined filter application | 1) Set type, warehouse, floor, stock status, packet, and search filters. 2) Clear all. | Result count and cards reflect criteria; Clear all restores full set. |  |  |
| Modal edit/save | Edit row fields | 1) Open card modal. 2) Change editable fields. 3) Save. | Save succeeds (or queues offline), modal reflects updated values after refresh. |  |  |
| Loose-stock assignment | Transfer/assign loose stock location | 1) Open row with loose qty. 2) Assign/transfer to destination location. 3) Save. | Loose quantity and destination state update correctly with audit-safe behavior. |  |  |
| Outbound draft | Create/update outbound draft line | 1) Enable outbound mode. 2) Add SKU to outbound. 3) Adjust qty/mode. | Draft line appears/updates with correct pending quantities. |  |  |
| Outbound commit | Commit ready line | 1) Allocate quantities. 2) Commit line. | Commit succeeds online, status/history updates, conflicts render clearly when present. |  |  |
| Inbound draft | Create inbound draft line | 1) Open inbound workspace. 2) Enter SKU/placement/qty/date. 3) Create draft. | Draft line is created with status `DRAFT` and visible in inbound drafts tab. |  |  |
| Inbound date rules | Validate receipt date cap | 1) Edit draft receipt date to exactly 90 days ago. 2) Save. 3) Set date to 91 days ago and save again. | 90-day date is accepted; 91-day date is rejected with clear validation message. |  |  |
| Inbound post | Post receipt line | 1) Post a valid draft. 2) Refresh inventory. | Receipt transitions to `POSTED`; inventory stock increases at matching/new placement as expected. |  |  |
| Inbound batch | Post all drafts | 1) Create multiple inbound drafts. 2) Use Post All. | Batch summary reports success/fail counts and all successful lines become `POSTED`. |  |  |
| Comments | Add and render comments | 1) Open modal. 2) Add comment with author. 3) Reopen item. | Comment persists and displays correctly with author/timestamp. |  |  |
| Undo | Undo latest eligible action | 1) Perform undoable action. 2) Load undo candidates. 3) Execute undo. | Undo completes with success feedback and data returns to previous state. |  |  |
| Role gates | Viewer/operator/manager/admin boundaries | 1) Login as each role. 2) Attempt guarded actions (write, undo, commit). | UI controls and backend behavior match role permissions; blocked actions show clear message. |  |  |

## Exit Gate

Release/extraction slice is allowed only when:

- All checklist rows are Pass, or
- Any Fail rows include a tracked fix issue and explicit risk acceptance.
