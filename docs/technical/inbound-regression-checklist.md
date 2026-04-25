# WM2 Inbound Regression Checklist Baseline

Last updated: 2026-04-19  
Audience: Technical maintainers, release testers  
Owner: Technical Maintainers

Use this checklist for inbound-specific verification. Mark each item Pass/Fail and capture notes.

## Test Run Metadata

- Environment:
- Build/commit:
- Tester:
- Date/time:

## Inbound Checklist

| Area | Scenario | Steps | Expected Result | Status | Notes |
|---|---|---|---|---|---|
| Access | Inbound mode visibility by role | 1) Login with each role. 2) Check inbound mode button/workspace availability. | UI visibility and actionability match permission model for each role. |  |  |
| Draft create | Create inbound draft | 1) Open inbound workspace. 2) Enter SKU/placement/qty/date. 3) Create draft. | Draft line is created with status `DRAFT` in Drafts tab. |  |  |
| Draft edit | Update inbound draft fields | 1) Edit a draft line. 2) Save line. | Updates persist and line remains in `DRAFT` unless posted/cancelled. |  |  |
| Draft cancel | Cancel inbound draft | 1) Select a draft line. 2) Cancel line. | Status transitions to `CANCELLED`; line appears in History tab. |  |  |
| Date required | Missing receipt date validation | 1) Create or save line without receipt date. | Action is blocked with clear validation message. |  |  |
| Date future | Future receipt date validation | 1) Set receipt date to tomorrow. 2) Save/post line. | Action is blocked with future-date validation message. |  |  |
| Date boundary pass | 90-day backdate acceptance | 1) Set receipt date to exactly 90 days ago. 2) Save line. | Save succeeds. |  |  |
| Date boundary fail | 91-day backdate rejection | 1) Set receipt date to 91 days ago. 2) Save line. | Save is rejected with backdate-cap validation message. |  |  |
| Post single | Post one valid draft line | 1) Post a single draft line. 2) Refresh views/data. | Line status becomes `POSTED`; inventory increases at matching/new placement. |  |  |
| Post all | Post all draft lines | 1) Create multiple drafts. 2) Click Post All Drafts. | Batch summary reports success/fail counts; successful lines move to `POSTED`. |  |  |
| Inventory merge path | Post to existing matching placement | 1) Post draft with SKU+placement matching existing row. | Existing inventory row stock is incremented correctly. |  |  |
| Inventory append path | Post to new placement | 1) Post draft with no existing placement match. | New inventory row is appended with expected values. |  |  |
| Audit traceability | Verify audit entries for inbound actions | 1) Perform draft/update/cancel/post. 2) Inspect Audit tab. | Audit includes inbound action type, actor, request id, and status context. |  |  |
| Online requirement | Post behavior when offline | 1) Disable network. 2) Attempt post line/post all. | Posting is blocked with clear online-required/offline-safe feedback. |  |  |

## Exit Gate

Inbound release is allowed only when:

- All checklist rows are Pass, or
- Any Fail rows include a tracked fix issue and explicit risk acceptance.
