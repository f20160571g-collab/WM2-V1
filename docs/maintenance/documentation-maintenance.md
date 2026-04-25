# WM2 Documentation Maintenance Guide

Last updated: 2026-03-29
Audience: Technical maintainers
Owner: Technical Maintainers

This guide explains how to keep documentation accurate as features change.

## 1. Required Rule

Any behavior or contract change in code must update docs in the same change set.

## 2. Which Docs To Update

Use this map:

- UI label or button text changed:
  - update `docs/staff/operations-guide.md`
  - update `docs/README.md` if navigation changed
- Workflow behavior changed in frontend:
  - update `docs/staff/operations-guide.md`
  - update `docs/technical/runbooks.md`
- Backend action contract changed:
  - update `docs/technical/api-contracts.md`
  - update troubleshooting tables if user-visible errors changed
- Role/permission rules changed:
  - update staff role matrix
  - update technical architecture doc
- New subsystem added:
  - add section to architecture and runbooks
  - include in docs index

## 3. Source-Check Process Before Editing Docs

1. Verify markup labels in `index.html`.
2. Verify runtime behavior in `app.js`.
3. Verify backend validation and responses in `apps_script.js`.
4. Verify style-driven hidden/disabled/active states in `styles.css` when relevant.

## 4. Documentation Style Contract

### Staff docs

- short direct steps
- plain operational language
- no internal implementation jargon
- include what to do next when errors happen

### Technical docs

- use exact action and state names
- include validation and failure behavior
- state scope and constraints explicitly
- keep contract tables current

## 5. Documentation PR Checklist

1. Behavior changed in code and docs together.
2. Any changed user-facing label updated in staff docs.
3. Any changed action contract updated in API doc.
4. Role matrix verified.
5. Troubleshooting messages verified.
6. Docs index date updated if scope changed.

## 6. Drift Prevention

- During code review, include docs impact review.
- Treat stale docs as a bug.
- Prefer small frequent doc updates over large delayed rewrites.

## 7. Release Note Template For Docs Changes

Use this section in change summary:

- Docs updated: [list docs files]
- Audience impact: [staff, maintainers, both]
- Behavior/contract changes covered: [short bullets]
- Follow-up needed: [yes/no and details]

## 8. Ownership Model

- Technical maintainer owns technical docs.
- Operations lead validates staff operational wording.
- Any contributor changing behavior is responsible for first docs update draft.

## 9. Change Log

- 2026-03-29: Initial documentation maintenance guide created.
