# WM2 Inbound V1 Tracker

Last updated: 2026-04-19  
Audience: Technical maintainers  
Owner: Technical Maintainers

This tracker keeps inbound rollout and validation steps explicit so release verification remains repeatable.

## Scope Lock (V1)

- Inbound lifecycle: `DRAFT` -> `POSTED` or `CANCELLED`
- Required business date: `receiptDate` only
- Expiry: not in scope
- Manufacturer/challan: not in scope
- Backdated posting: allowed up to 90 days

## Status Snapshot

| Stream | Goal | Status | Notes |
|---|---|---|---|
| Backend actions | Add/create/list/update/cancel/post receipt workflows | Completed | Actions routed in Apps Script backend with shared envelope patterns. |
| Frontend state/service | Add inbound state and service orchestration | Completed | Inbound service and state-manager bindings are active. |
| Inbound workspace UI | Add inbound mode, tabs, line actions | Completed | Draft, Posted, and History tabs are wired with delegated actions. |
| Technical docs | Update API, architecture, runbooks, checklist | Completed | Core docs updated for inbound lifecycle behavior and rules. |
| Regression signoff | Execute and record inbound run | Ready | Use inbound checklist and run template for final signoff entry. |

## Validation Gates

### Gate 1: Functional

- Draft creation succeeds for valid input.
- Draft update/cancel persists correctly.
- Single-line post transitions to `POSTED` and updates inventory.
- Post-all processes all draft lines and reports summary.

### Gate 2: Date rules

- Receipt date is mandatory.
- Future date is rejected.
- Exactly 90 days back is accepted.
- 91 days back is rejected.

### Gate 3: Access and safety

- Role-gated write actions are blocked for unauthorized roles.
- Backend rejects invalid status transitions.
- Audit entries are created for draft/update/cancel/post actions.

## Final Exit Criteria

Inbound V1 is ready for closure when:

- All rows in `docs/technical/inbound-regression-checklist.md` are `Pass`, or
- Any `Fail` row has a tracked fix and explicit risk acceptance in run notes.
