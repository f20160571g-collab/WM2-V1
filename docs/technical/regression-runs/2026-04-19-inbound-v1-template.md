# WM2 Regression Run: Inbound V1 Signoff

Date: 2026-04-19
Owner: Technical Maintainers
Scope: Inbound mode V1 lifecycle and date-rule validation
Related checklist: docs/technical/inbound-regression-checklist.md
Related tracker: docs/technical/inbound-v1-tracker.md

## Test Run Metadata

- Environment:
- Build/commit:
- Tester:
- Date/time:

## Checklist Results

| Area | Scenario | Status (Pass/Fail) | Notes |
|---|---|---|---|
| Access | Inbound mode visibility by role |  |  |
| Draft create | Create inbound draft |  |  |
| Draft edit | Update inbound draft fields |  |  |
| Draft cancel | Cancel inbound draft |  |  |
| Date required | Missing receipt date validation |  |  |
| Date future | Future receipt date validation |  |  |
| Date boundary pass | 90-day backdate acceptance |  |  |
| Date boundary fail | 91-day backdate rejection |  |  |
| Post single | Post one valid draft line |  |  |
| Post all | Post all draft lines |  |  |
| Inventory merge path | Post to existing matching placement |  |  |
| Inventory append path | Post to new placement |  |  |
| Audit traceability | Verify audit entries for inbound actions |  |  |
| Online requirement | Post behavior when offline |  |  |

## Summary

- Overall result:
- Blocking failures:
- Risk acceptance (if any):
- Inbound V1 signoff decision:

## Static Preconditions (Automated)

Record static checks validated before manual run execution:

- JS parser checks passed across changed frontend/backend files.
- Inbound UI action hooks and router registrations are present.
- Backend inbound action routes and handlers are registered.
- Error diagnostics in changed files are clear.
