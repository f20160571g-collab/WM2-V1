# WM2 Documentation Index

Last updated: 2026-04-25
Audience: All
Owner: Technical Maintainers

This documentation set is split by audience so updates stay clear and low-risk.

## Start Here

- Staff operations guide: see `docs/staff/operations-guide.md`
- Staff troubleshooting and role matrix: see `docs/staff/troubleshooting-and-role-matrix.md`
- Technical architecture and data model: see `docs/technical/architecture-and-data-model.md`
- Technical API contracts: see `docs/technical/api-contracts.md`
- Technical runbooks and maintenance operations: see `docs/technical/runbooks.md`
- Refactor modularization tracker: see `docs/technical/refactor-modularization-tracker.md`
- Regression checklist baseline: see `docs/technical/regression-checklist.md`
- Inbound V1 tracker: see `docs/technical/inbound-v1-tracker.md`
- Inbound regression checklist baseline: see `docs/technical/inbound-regression-checklist.md`
- Inbound regression run template: see `docs/technical/regression-runs/2026-04-19-inbound-v1-template.md`
- Branching and environment strategy: see `docs/technical/branching-and-environment-strategy.md`
- Phase A foundation baseline and freeze gate: see `docs/technical/phase-a-foundation-baseline-2026-04-11.md`
- Documentation maintenance workflow: see `docs/maintenance/documentation-maintenance.md`

## Documentation Principles

- Match user-facing labels exactly as shown in `index.html`.
- Match behavior exactly as implemented in `app.js` and `apps_script.js`.
- Update both staff and technical docs together when a workflow changes.
- Keep staff language operational and plain.
- Keep technical language precise and implementation-grounded.

## Source Map (Single Source of Truth)

| Area | Primary Source Files | Notes |
|---|---|---|
| Header controls, filters, tabs, modal markup | `index.html` | User-visible labels and control structure |
| Frontend behavior and UI state | `app.js` | Workflows, permission gates, queue, outbound logic |
| Backend actions and validation | `apps_script.js` | Action contracts, locking, conflict checks, audit, undo |
| UI states and visibility styles | `styles.css` | Hidden/disabled/active visual behavior |

## Update Checklist

1. Confirm changed behavior in code first.
2. Update technical docs for architecture/API/runbook impact.
3. Update staff docs for workflow and troubleshooting impact.
4. Update this index date.
5. Add one-line release note in the maintenance doc changelog section.

## Scope Included

- Authentication and session behavior
- Role permissions
- Inventory workflows
- Split and move operations
- Comments workflow
- Offline queue behavior
- Undo workflow
- Outbound workspace workflow
- Inbound workspace workflow
- Partial fulfillment and residue behavior
- Conflict handling and recovery

## Scope Excluded

- Future features not implemented in code
- Screenshot catalog
- Localization packs
