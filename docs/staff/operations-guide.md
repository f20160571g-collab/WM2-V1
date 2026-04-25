# WM2 Staff Operations Guide

Last updated: 2026-03-29
Audience: Warehouse staff and supervisors
Owner: Operations + Technical Maintainers

This guide explains daily use in simple operational steps.

## 1. Login

1. Open the app.
2. Enter username.
3. Enter password.
4. Select Unlock.

If login fails, check spelling and try again. If still blocked, contact admin.

## 2. What You See After Login

Top bar includes:

- role badge
- Outbound button
- Outbound Mode button
- Undo controls (if your role allows)
- Queue button (if needed)
- PDF button
- Refresh button

Main page includes:

- search bar
- filters panel
- sort dropdown
- inventory cards

## 3. Find Items Quickly

### Search

Type in the search box to find by type, size, details, warehouse, floor, or location.

### Filters

Use Filters to narrow by:

- warehouse
- floor
- stock status
- packet type
- location text
- needs attention

Use Clear all to reset filters.

### Sort

Use sort dropdown to order by stock, size, or type.

## 4. Read Inventory Cards

Each card shows:

- item type and size
- stock status
- packet type
- warehouse tags
- details chips
- badges for row count, notes, and comments

Select any card to open full location details.

## 5. Work in the Item Modal

Inside modal, each location row shows:

- warehouse, floor, location
- stock
- qty per unit and unit if present

### Quick stock change

1. Adjust stock value.
2. Select Save.

### Edit row details

Use Edit Row to update:

- warehouse
- floor
- location
- qty per unit
- unit

### Split and move stock

Use Split / Move when moving part of stock:

1. Enter Keep stock.
2. Enter Move stock.
3. Enter New location.
4. Select packet type and optional qty/unit.
5. Confirm action.

## 6. Add Comments

1. Enter your name (or leave default).
2. Enter comment text.
3. Select Add Comment.

Comments are visible to all users for that type and size.

## 7. Outbound Workspace (Manager/Admin)

Use Outbound button to open workspace.

Tabs:

- Drafts: lines being prepared
- Ready: lines with allocations ready to commit
- History: completed and cancelled lines

### Add or update lines

In inventory mode, use Outbound Mode button to enable capture.

Then on cards:

- Add adds a new line
- Update updates requested quantity
- Remove cancels that line

### Allocate and commit

1. Open Drafts or Ready.
2. Enter allocation quantities by location.
3. Commit one line or use Commit All Ready.

Final commit requires online connection.

## 8. Undo (Manager/Admin)

If enabled for your role:

1. Pick an action from Undo dropdown.
2. Select Undo.

Notes:

- only recent actions are listed
- only your own actions are undoable
- old actions may expire from undo window

## 9. Offline Queue

If internet drops during edits:

- changes are queued locally
- Queue button shows pending count
- queued changes replay when online

If queue replay stops, refresh and retry that specific change.

## 10. Daily Best Practices

1. Refresh before large batches.
2. Confirm item and location before save.
3. Use comments for handoff notes.
4. If conflict appears, refresh and retry from latest state.
5. For outbound, verify allocations before commit.

## 11. Role Reminder

- Viewer: read only
- Operator: inventory updates
- Manager: inventory updates + undo + outbound commits
- Admin: full access

## 12. Change Log

- 2026-03-29: Initial staff operations guide created.
