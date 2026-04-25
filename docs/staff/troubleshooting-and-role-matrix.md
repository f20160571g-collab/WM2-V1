# WM2 Staff Troubleshooting and Role Matrix

Last updated: 2026-03-29
Audience: Warehouse staff and supervisors
Owner: Operations + Technical Maintainers

## 1. Quick Role Matrix

| Capability | Viewer | Operator | Manager | Admin |
|---|---|---|---|---|
| View inventory | Yes | Yes | Yes | Yes |
| Search/filter/sort | Yes | Yes | Yes | Yes |
| Edit stock or row fields | No | Yes | Yes | Yes |
| Split and move | No | Yes | Yes | Yes |
| Add comments | No | Yes | Yes | Yes |
| Undo | No | No | Yes | Yes |
| Outbound commit | No | No | Yes | Yes |

## 2. Common Issues and What To Do

| Message or Symptom | Meaning | What to do |
|---|---|---|
| Invalid username or password | Login details rejected | Re-enter credentials, then contact admin if still failing |
| Session expired. Please login again | Token timed out | Login again |
| Permission denied for role | Role does not allow this action | Ask admin for required role |
| Conflict: row changed by another user | Someone else edited same row | Refresh, reopen item, retry |
| Conflict: stock changed by another user | Stock changed before save | Refresh and retry with current stock |
| Conflict: warehouse/floor/location changed | Placement changed before save | Refresh and choose correct current placement |
| Keep + Move mismatch | Split values do not match current stock | Correct values so Keep + Move equals current stock |
| Move stock must be at least 1 | Invalid move quantity | Enter positive integer move quantity |
| Location is required | Location field empty | Enter a valid location |
| Invalid packet type | Packet not allowed | Select allowed packet |
| Final commit requires online mode | Outbound final commit while offline | Reconnect internet and retry |
| Queue blocked | A queued item failed replay | Refresh, inspect item, retry manually |
| Order line not found | Line changed or removed | Refresh outbound list and recreate or update line |
| Fulfill quantity exceeds remaining | Allocation too high | Reduce allocations to remaining needed quantity |
| Allocation total must equal fulfill quantity | Allocation sum mismatch | Adjust row allocations to exact total |
| Insufficient stock at location | Not enough available stock | Reallocate from another location or reduce fulfill qty |

## 3. Decision Guide

When something fails, follow this order:

1. Read the exact message.
2. If it mentions session or auth, login again.
3. If it mentions permission, stop and contact admin.
4. If it mentions conflict, refresh and retry from current data.
5. If it mentions offline or queue, reconnect and replay.
6. If still unresolved, send error text and steps to technical maintainer.

## 4. Escalation Template

Use this format when escalating:

- user role:
- action attempted:
- exact message shown:
- item type and size:
- warehouse/floor/location:
- time of issue:
- whether internet was stable:

## 5. Change Log

- 2026-03-29: Initial troubleshooting and role matrix created.
