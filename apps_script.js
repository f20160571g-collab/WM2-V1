// ============================================================
//  WAREHOUSE INVENTORY — Google Apps Script
//  Paste this entire file into your Apps Script editor.
//  Deploy → New deployment → Web app
//  Execute as: Me | Who has access: Anyone
// ============================================================

const INVENTORY_SHEET = "Consolidated(Man)";
const COMMENTS_SHEET = "Comments";
const AUDIT_SHEET = "Audit";
const ORDERS_SHEET = "Orders";
const RECEIPTS_SHEET = "Receipts";
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_CACHE_PREFIX = "wh_session_";
const USERS_PROPERTY_KEY = 'USERS_JSON';
const UNDO_WINDOW_MINUTES = 15;
const NUMBER_EPSILON = 1e-6;
const RECEIPT_BACKDATE_DAYS = 90;

const ALLOWED_WAREHOUSES = ['J1', 'A1', 'A2'];
const ALLOWED_FLOORS = ['BS', 'GF', 'FF', 'SF', 'TF'];
const ALLOWED_PACKETS = ['Box', 'Jute Bag', 'Packet'];

const ROLE_DEFINITIONS = {
  viewer: {
    canRead: true,
    canWrite: false,
    canUndo: false,
    canOrderCommit: false,
    canAdmin: false,
  },
  operator: {
    canRead: true,
    canWrite: true,
    canUndo: false,
    canOrderCommit: false,
    canAdmin: false,
  },
  manager: {
    canRead: true,
    canWrite: true,
    canUndo: true,
    canOrderCommit: true,
    canAdmin: false,
  },
  admin: {
    canRead: true,
    canWrite: true,
    canUndo: true,
    canOrderCommit: true,
    canAdmin: true,
  },
};

const ROLE_ASSIGNMENTS = {
  'web-user': 'operator',
};

const SEARCH_ALIASES = {
  warehouse: ['warehouse', 'wh', 'godown'],
  floor: ['floor', 'level'],
  location: ['location', 'loc', 'bin', 'rack'],
  packet: ['packet', 'pack', 'bag', 'box'],
};

const FEATURE_FLAGS = {
  rolesEnabled: true,
  orderModeEnabled: true,
  offlineQueueEnabled: true,
};

// Column indices (1-based) — must match your sheet
const COL_TYPE = 1;  // A
const COL_SIZE = 2;  // B
const COL_DETAILS = 3;  // C
const COL_PACKET = 4;  // D
const COL_WAREHOUSE = 5;  // E
const COL_FLOOR = 6;  // F
const COL_STOCK = 7;  // G
const COL_LOCATION = 8;  // H
const COL_NOTES = 9;  // I
const COL_QTY = 10; // J
const COL_UNIT = 11; // K
const COL_LOOSE = 12; // L
const TOTAL_COLS = 12; // total columns to read per row

const ORDER_MODE_UNIT = 'UNIT';
const ORDER_MODE_BASE = 'BASE';

const RECEIPT_STATUS_DRAFT = 'DRAFT';
const RECEIPT_STATUS_POSTED = 'POSTED';
const RECEIPT_STATUS_CANCELLED = 'CANCELLED';

const RC_CREATED_AT = 1;
const RC_UPDATED_AT = 2;
const RC_POSTED_AT = 3;
const RC_RECEIPT_ID = 4;
const RC_LINE_ID = 5;
const RC_STATUS = 6;
const RC_ACTOR = 7;
const RC_TYPE = 8;
const RC_SIZE = 9;
const RC_PACKET = 10;
const RC_WAREHOUSE = 11;
const RC_FLOOR = 12;
const RC_LOCATION = 13;
const RC_RECEIVED_QTY = 14;
const RC_QTY_PER_UNIT = 15;
const RC_UNIT = 16;
const RC_LOOSE_QTY = 17;
const RC_NOTES = 18;
const RC_RECEIPT_DATE = 19;
const RC_LAST_REQUEST_ID = 20;
const RC_DETAILS = 21;
const RECEIPT_TOTAL_COLS = 21;

const ACTION_ROUTES = {
  authenticate: { requiresAuth: false, permission: null, handler: handleAuthenticate },
  getConfig: { requiresAuth: true, permission: 'canRead', handler: handleGetConfig },
  getData: { requiresAuth: true, permission: 'canRead', handler: handleGetData },
  updateRowFields: { requiresAuth: true, permission: 'canWrite', handler: handleUpdateRowFields },
  splitMove: { requiresAuth: true, permission: 'canWrite', handler: handleSplitMove },
  appendRow: { requiresAuth: true, permission: 'canWrite', handler: handleAppendRow },
  addComment: { requiresAuth: true, permission: 'canWrite', handler: handleAddComment },
  updateLooseQty: { requiresAuth: true, permission: 'canWrite', handler: handleUpdateLooseQty },
  transferLooseQty: { requiresAuth: true, permission: 'canWrite', handler: handleTransferLooseQty },
  createOrderDraft: { requiresAuth: true, permission: 'canOrderCommit', handler: handleCreateOrderDraft },
  listOrders: { requiresAuth: true, permission: 'canRead', handler: handleListOrders },
  updateOrderLine: { requiresAuth: true, permission: 'canOrderCommit', handler: handleUpdateOrderLine },
  cancelOrderLine: { requiresAuth: true, permission: 'canOrderCommit', handler: handleCancelOrderLine },
  commitOrderFulfillment: { requiresAuth: true, permission: 'canOrderCommit', handler: handleCommitOrderFulfillment },
  createReceiptDraft: { requiresAuth: true, permission: 'canOrderCommit', handler: handleCreateReceiptDraft },
  listReceipts: { requiresAuth: true, permission: 'canRead', handler: handleListReceipts },
  updateReceiptLine: { requiresAuth: true, permission: 'canOrderCommit', handler: handleUpdateReceiptLine },
  cancelReceiptLine: { requiresAuth: true, permission: 'canOrderCommit', handler: handleCancelReceiptLine },
  postReceipt: { requiresAuth: true, permission: 'canOrderCommit', handler: handlePostReceipt },
  undo: { requiresAuth: true, permission: 'canUndo', handler: handleUndo },
  listUndoCandidates: { requiresAuth: true, permission: 'canUndo', handler: handleListUndoCandidates },
};

// ── Router ──
function doPost(e) {
  try {
    const body = parsePostBody(e);
    const action = String(body.action || '').trim();

    if (!action) return errorResponse('Missing action.', 'BAD_REQUEST');

    const route = ACTION_ROUTES[action];
    if (!route) return errorResponse('Unknown action: ' + action, 'UNKNOWN_ACTION');

    const guardError = runActionGuards(body, route);
    if (guardError) return guardError;

    return route.handler(body);

  } catch (err) {
    return errorResponse(err && err.message ? err.message : 'Unexpected server error.', err && err.code ? err.code : 'SERVER_ERROR');
  }
}

function parsePostBody(e) {
  const raw = e && e.postData && typeof e.postData.contents === 'string'
    ? e.postData.contents
    : '';
  const text = String(raw || '').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (err) {
    const parseErr = new Error('Invalid JSON payload.');
    parseErr.code = 'BAD_REQUEST';
    throw parseErr;
  }
}

function runActionGuards(body, route) {
  if (route.requiresAuth) {
    const authErr = requireValidSession(body);
    if (authErr) return authErr;
  }

  if (route.permission) {
    const permissionErr = requirePermission(body, route.permission);
    if (permissionErr) return permissionErr;
  }

  return null;
}

function doGet(e) {
  return successResponse({ status: 'ok', message: 'Warehouse Inventory Apps Script is running.' });
}

function handleGetData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName(INVENTORY_SHEET);
  if (!inventorySheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');

  const inventoryLastRow = Math.max(inventorySheet.getLastRow(), 1);
  const inventoryValues = inventorySheet.getRange(1, 1, inventoryLastRow, TOTAL_COLS).getDisplayValues();
  const inventoryRawValues = inventorySheet.getRange(1, 1, inventoryLastRow, TOTAL_COLS).getValues();
  const rowVersions = {};
  for (var r = 2; r <= inventoryRawValues.length; r++) {
    rowVersions[String(r)] = computeRowVersion(inventoryRawValues[r - 1]);
  }

  const commentsSheet = ss.getSheetByName(COMMENTS_SHEET);
  let commentValues = [];
  if (commentsSheet) {
    const commentsLastRow = Math.max(commentsSheet.getLastRow(), 1);
    commentValues = commentsSheet.getRange(1, 1, commentsLastRow, 5).getDisplayValues();
  }

  return successResponse({
    inventoryValues: inventoryValues,
    rowVersions: rowVersions,
    commentValues: commentValues,
    serverTime: new Date().toISOString(),
  });
}

function handleGetConfig(body) {
  const roleContext = getRoleContext(body);
  return successResponse({
    warehouses: ALLOWED_WAREHOUSES,
    floors: ALLOWED_FLOORS,
    packetTypes: ALLOWED_PACKETS,
    role: roleContext.role,
    permissions: roleContext.permissions,
    actor: roleContext.actor,
    username: roleContext.username,
    authMode: roleContext.authMode,
    roles: ROLE_DEFINITIONS,
    searchAliases: SEARCH_ALIASES,
    featureFlags: FEATURE_FLAGS,
  });
}

// ── Read a full row for context ──
function readRow(sheet, rowNum) {
  return sheet.getRange(rowNum, 1, 1, TOTAL_COLS).getValues()[0];
}

// ── Update multiple editable row fields in one action ──
function handleUpdateRowFields(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const row = parseInt(body.row, 10);
  const fields = body.fields || {};
  const expectedOld = body.expectedOld || {};

  if (!Number.isInteger(row)) return errorResponse('Invalid row.', 'BAD_REQUEST');
  if (!fields || typeof fields !== 'object') return errorResponse('Missing fields payload.', 'BAD_REQUEST');

  const hasStock = Object.prototype.hasOwnProperty.call(fields, 'stock');
  const hasQty = Object.prototype.hasOwnProperty.call(fields, 'qty');
  const hasUnit = Object.prototype.hasOwnProperty.call(fields, 'unit');
  const hasWarehouse = Object.prototype.hasOwnProperty.call(fields, 'warehouse');
  const hasFloor = Object.prototype.hasOwnProperty.call(fields, 'floor');
  const hasLocation = Object.prototype.hasOwnProperty.call(fields, 'location');

  if (!(hasStock || hasQty || hasUnit || hasWarehouse || hasFloor || hasLocation)) {
    return errorResponse('No editable fields provided.', 'BAD_REQUEST');
  }

  const wantsPlacement = hasWarehouse || hasFloor || hasLocation;
  if (wantsPlacement && !(hasWarehouse && hasFloor && hasLocation)) {
    return errorResponse('Warehouse, floor and location must be updated together.', 'BAD_REQUEST');
  }

  const stock = hasStock ? parseInt(fields.stock, 10) : null;
  if (hasStock && (!Number.isInteger(stock) || stock < 0)) {
    return errorResponse('Stock must be a non-negative integer.', 'BAD_REQUEST');
  }

  const qtyRaw = hasQty ? String(fields.qty).trim() : '';
  const qty = hasQty ? parseFloat(qtyRaw) : null;
  if (hasQty && (qtyRaw === '' || qtyRaw.toLowerCase() === 'null' || isNaN(qty) || qty < 0)) {
    return errorResponse('Qty per unit must be a non-negative number.', 'BAD_REQUEST');
  }

  const unit = hasUnit ? String(fields.unit || '').trim().toLowerCase() : '';
  if (hasUnit && unit && ['kg', 'pcs'].indexOf(unit) === -1) {
    return errorResponse('Unit must be kg or pcs.', 'BAD_REQUEST');
  }

  const warehouse = hasWarehouse ? String(fields.warehouse || '').trim() : '';
  const floor = hasFloor ? String(fields.floor || '').trim() : '';
  const location = hasLocation ? String(fields.location || '').trim() : '';
  if (wantsPlacement) {
    if (!location) return errorResponse('Location is required.', 'BAD_REQUEST');
    if (ALLOWED_WAREHOUSES.indexOf(warehouse) === -1) {
      return errorResponse('Invalid warehouse. Allowed: ' + ALLOWED_WAREHOUSES.join(', '), 'BAD_REQUEST');
    }
    if (ALLOWED_FLOORS.indexOf(floor) === -1) {
      return errorResponse('Invalid floor. Allowed: ' + ALLOWED_FLOORS.join(', '), 'BAD_REQUEST');
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(INVENTORY_SHEET);
  if (!sheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
  if (!isValidInventoryRow(sheet, row)) return errorResponse('Invalid row.', 'BAD_REQUEST');

  const rowData = readRow(sheet, row);
  const versionConflict = checkExpectedVersion(rowData, body.expectedVersion);
  if (versionConflict) return versionConflict;

  const current = {
    stock: parseInt(rowData[COL_STOCK - 1], 10) || 0,
    qty: rowData[COL_QTY - 1] === '' || rowData[COL_QTY - 1] === null ? null : parseFloat(rowData[COL_QTY - 1]),
    unit: String(rowData[COL_UNIT - 1] || '').trim().toLowerCase() || null,
    warehouse: String(rowData[COL_WAREHOUSE - 1] || '').trim(),
    floor: String(rowData[COL_FLOOR - 1] || '').trim(),
    location: String(rowData[COL_LOCATION - 1] || '').trim(),
  };

  const conflict = checkExpectedOldValues(expectedOld, current);
  if (conflict) return conflict;

  const oldSnapshot = {
    stock: current.stock,
    qty: current.qty,
    unit: current.unit,
    warehouse: current.warehouse,
    floor: current.floor,
    location: current.location,
  };

  const changedFields = [];

  if (hasStock && stock !== current.stock) {
    sheet.getRange(row, COL_STOCK).setValue(stock);
    current.stock = stock;
    changedFields.push('stock');
  }
  if (hasQty && qty !== current.qty) {
    sheet.getRange(row, COL_QTY).setValue(qty);
    current.qty = qty;
    changedFields.push('qty');
  }
  if (hasUnit && unit !== current.unit) {
    sheet.getRange(row, COL_UNIT).setValue(unit);
    current.unit = unit || null;
    changedFields.push('unit');
  }
  if (wantsPlacement && warehouse !== current.warehouse) {
    sheet.getRange(row, COL_WAREHOUSE).setValue(warehouse);
    current.warehouse = warehouse;
    changedFields.push('warehouse');
  }
  if (wantsPlacement && floor !== current.floor) {
    sheet.getRange(row, COL_FLOOR).setValue(floor);
    current.floor = floor;
    changedFields.push('floor');
  }
  if (wantsPlacement && location !== current.location) {
    sheet.getRange(row, COL_LOCATION).setValue(location);
    current.location = location;
    changedFields.push('location');
  }

  if (!changedFields.length) {
    return successResponse({
      row: row,
      noChange: true,
      currentVersion: computeRowVersion(rowData),
    });
  }

  logAudit(ss, {
    action: 'ROW_FIELDS_UPDATE',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: new Date(),
    warehouse: current.warehouse || '—',
    floor: current.floor || '—',
    location: current.location || '—',
    type: rowData[COL_TYPE - 1] || '—',
    size: rowData[COL_SIZE - 1] || '—',
    packet: rowData[COL_PACKET - 1] || '—',
    oldValue: summarizeEditableFields(oldSnapshot),
    newValue: summarizeEditableFields(current),
    change: changedFields.join(', '),
    notes: '',
    sheetRow: row,
  });

  return successResponse({
    row: row,
    changedFields: changedFields,
    currentVersion: computeRowVersion(readRow(sheet, row)),
  });
}

function checkExpectedOldValues(expectedOld, current) {
  if (!expectedOld || typeof expectedOld !== 'object') return null;

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'stock')) {
    const expectedStock = parseInt(expectedOld.stock, 10);
    if (!isNaN(expectedStock) && expectedStock !== current.stock) {
      return errorResponse('Conflict: stock changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.stock,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'qty')) {
    const expectedQty = expectedOld.qty === null || expectedOld.qty === ''
      ? null
      : parseFloat(expectedOld.qty);
    if ((expectedQty === null && current.qty !== null) ||
        (expectedQty !== null && !isNaN(expectedQty) && expectedQty !== current.qty)) {
      return errorResponse('Conflict: qty changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.qty,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'unit')) {
    const expectedUnit = String(expectedOld.unit || '').trim().toLowerCase() || null;
    if (expectedUnit !== current.unit) {
      return errorResponse('Conflict: unit changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.unit,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'warehouse')) {
    const expectedWarehouse = String(expectedOld.warehouse || '').trim();
    if (expectedWarehouse !== String(current.warehouse || '').trim()) {
      return errorResponse('Conflict: warehouse changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.warehouse,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'floor')) {
    const expectedFloor = String(expectedOld.floor || '').trim();
    if (expectedFloor !== String(current.floor || '').trim()) {
      return errorResponse('Conflict: floor changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.floor,
      });
    }
  }

  if (Object.prototype.hasOwnProperty.call(expectedOld, 'location')) {
    const expectedLocation = String(expectedOld.location || '').trim();
    if (expectedLocation !== String(current.location || '').trim()) {
      return errorResponse('Conflict: location changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: current.location,
      });
    }
  }

  return null;
}

function summarizeEditableFields(data) {
  return [
    'stock=' + (data.stock !== null && data.stock !== undefined ? data.stock : '—'),
    'qty=' + (data.qty !== null && data.qty !== undefined ? data.qty : '—'),
    'unit=' + (data.unit || '—'),
    'warehouse=' + (data.warehouse || '—'),
    'floor=' + (data.floor || '—'),
    'location=' + (data.location || '—'),
  ].join(' | ');
}

function handleSplitMove(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const row = parseInt(body.row);
  const keepStock = parseInt(body.keepStock);
  const moveStock = parseInt(body.moveStock);
  const newLoc = String(body.newLocation || '').trim();
  const newUnit = String(body.newUnit || '').trim().toLowerCase();
  const newPacket = String(body.newPacket || '').trim();
  const newQty = body.newQty !== null && body.newQty !== undefined && body.newQty !== ''
    ? parseFloat(body.newQty)
    : null;

  if (!Number.isInteger(row) || row < 2) return errorResponse('Invalid row.', 'BAD_REQUEST');
  if (!Number.isInteger(keepStock) || keepStock < 0) return errorResponse('Invalid keep stock.', 'BAD_REQUEST');
  if (!Number.isInteger(moveStock) || moveStock <= 0) return errorResponse('Move stock must be at least 1.', 'BAD_REQUEST');
  if (!newLoc) return errorResponse('New location is required.', 'BAD_REQUEST');
  if (!newPacket || ALLOWED_PACKETS.indexOf(newPacket) === -1) return errorResponse('Invalid packet type.', 'BAD_REQUEST');
  if (newUnit && ['kg', 'pcs'].indexOf(newUnit) === -1) return errorResponse('Unit must be kg or pcs.', 'BAD_REQUEST');
  if (newQty !== null && (isNaN(newQty) || newQty < 0)) return errorResponse('Qty per unit must be a non-negative number.', 'BAD_REQUEST');

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!sheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
    if (!isValidInventoryRow(sheet, row)) return errorResponse('Invalid row.', 'BAD_REQUEST');

    const rowData = readRow(sheet, row);
    const versionConflict = checkExpectedVersion(rowData, body.expectedVersion);
    if (versionConflict) return versionConflict;

    const currentStock = parseInt(rowData[COL_STOCK - 1]) || 0;
    if (keepStock + moveStock !== currentStock) {
      return errorResponse('Conflict: stock changed by another user. Please refresh and retry.', 'CONFLICT', {
        currentValue: currentStock,
        currentVersion: computeRowVersion(rowData),
      });
    }

    const currentLoc = String(rowData[COL_LOCATION - 1] || '').trim();
    const currentPacket = String(rowData[COL_PACKET - 1] || '').trim();
    const isFullRelocation = keepStock === 0 && newLoc !== currentLoc && newPacket === currentPacket;

    if (isFullRelocation) {
      sheet.getRange(row, COL_LOCATION).setValue(newLoc);
      if (newQty !== null) sheet.getRange(row, COL_QTY).setValue(newQty);
      if (newUnit) sheet.getRange(row, COL_UNIT).setValue(newUnit);

      logAudit(ss, {
        action: 'SPLIT_MOVE',
        actor: actor,
        requestId: requestId,
        status: 'SUCCESS',
        timestamp: new Date(),
        warehouse: rowData[COL_WAREHOUSE - 1] || '—',
        floor: rowData[COL_FLOOR - 1] || '—',
        location: newLoc,
        type: rowData[COL_TYPE - 1] || '—',
        size: rowData[COL_SIZE - 1] || '—',
        packet: rowData[COL_PACKET - 1] || '—',
        oldValue: currentLoc,
        newValue: newLoc,
        change: `Relocation ${currentLoc} -> ${newLoc}`,
        notes: 'Atomic split/move relocation',
        sheetRow: row,
      });

      return successResponse({
        row: row,
        mode: 'relocation',
        currentVersion: computeRowVersion(readRow(sheet, row)),
      });
    }

    sheet.getRange(row, COL_STOCK).setValue(keepStock);

    const newRow = [
      rowData[COL_TYPE - 1] || '',
      rowData[COL_SIZE - 1] || '',
      rowData[COL_DETAILS - 1] || '',
      newPacket,
      rowData[COL_WAREHOUSE - 1] || '',
      rowData[COL_FLOOR - 1] || '',
      moveStock,
      newLoc,
      '',
      newQty !== null ? newQty : rowData[COL_QTY - 1],
      newUnit || String(rowData[COL_UNIT - 1] || '').trim().toLowerCase(),
      0,
    ];
    sheet.appendRow(newRow);
    const newRowNum = sheet.getLastRow();

    logAudit(ss, {
      action: 'SPLIT_MOVE',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: new Date(),
      warehouse: rowData[COL_WAREHOUSE - 1] || '—',
      floor: rowData[COL_FLOOR - 1] || '—',
      location: newLoc,
      type: rowData[COL_TYPE - 1] || '—',
      size: rowData[COL_SIZE - 1] || '—',
      packet: newPacket,
      oldValue: currentStock,
      newValue: `${keepStock} + ${moveStock}`,
      change: `Split ${currentStock} -> ${keepStock}/${moveStock}`,
      notes: `Atomic split/move from row ${row}`,
      sheetRow: newRowNum,
    });

    return successResponse({
      row: row,
      newRowNum: newRowNum,
      mode: 'split',
      currentVersion: computeRowVersion(readRow(sheet, row)),
    });
  } finally {
    lock.releaseLock();
  }
}

// ── Append a new row (split / move / repack) ──
function handleAppendRow(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const d = body.rowData;
  if (!d) return errorResponse('No rowData provided.', 'BAD_REQUEST');

  const rowValidationError = validateAppendRowData(d);
  if (rowValidationError) return errorResponse(rowValidationError, 'BAD_REQUEST');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(INVENTORY_SHEET);
  if (!sheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');

  // Build the row in column order A–L
  const newRow = [
    d.type || '',
    d.size || '',
    d.details || '',
    d.packetType || '',
    d.warehouse || '',
    d.floor || '',
    d.stock || 0,
    d.location || '',
    d.notes || '',
    d.qtyPerUnit !== undefined ? d.qtyPerUnit : '',
    d.unit || '',
    d.looseQty !== undefined ? d.looseQty : '',
  ];

  sheet.appendRow(newRow);
  const newRowNum = sheet.getLastRow();

  logAudit(ss, {
    action: 'ROW_APPENDED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: new Date(),
    warehouse: d.warehouse || '—',
    floor: d.floor || '—',
    location: d.location || '—',
    type: d.type || '—',
    size: d.size || '—',
    packet: d.packetType || '—',
    oldValue: '—',
    newValue: d.stock,
    change: `New row — Split/Move`,
    notes: d.notes || '',
    sheetRow: newRowNum,
  });

  return successResponse({ newRowNum: newRowNum });
}

// ── Add comment ──
function handleAddComment(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(COMMENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(COMMENTS_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Item', 'Size', 'Comment', 'Author']]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const timestamp = new Date();
  const item = String(body.item || '').trim();
  const size = String(body.size || '').trim();
  const comment = String(body.comment || '').trim();
  const author = String(body.author || 'Anonymous').trim();

  if (!item || !size) return errorResponse('Item and size are required.', 'BAD_REQUEST');
  if (!comment) return errorResponse('Comment text is empty.', 'BAD_REQUEST');

  sheet.appendRow([timestamp, item, size, comment, author]);
  return successResponse({ timestamp: timestamp.toISOString(), item: item, size: size, author: author });
}

function handleUpdateLooseQty(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const row = parseInt(body.row, 10);
  const looseQty = parseNonNegativeLooseQty(body.looseQty);

  if (!Number.isInteger(row) || row < 2) return errorResponse('Invalid row.', 'BAD_REQUEST');
  if (looseQty === null) return errorResponse('Loose quantity must be a non-negative number.', 'BAD_REQUEST');

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!sheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
    if (!isValidInventoryRow(sheet, row)) return errorResponse('Invalid row.', 'BAD_REQUEST');

    const rowData = readRow(sheet, row);
    const versionConflict = checkExpectedVersion(rowData, body.expectedVersion);
    if (versionConflict) return versionConflict;

    if (!hasBaseMetadata(rowData)) {
      return errorResponse('Loose quantity requires valid qty/unit metadata (pcs or kg).', 'CONFLICT');
    }

    const unit = parseRowUnit(rowData);
    if (!isValidLooseQtyForUnit(looseQty, unit)) {
      return errorResponse('Loose quantity must be a whole number for pcs rows.', 'BAD_REQUEST');
    }

    const oldLooseQty = parseRowLooseQty(rowData);
    if (numbersNearlyEqual(oldLooseQty, looseQty)) {
      return successResponse({
        row: row,
        looseQty: oldLooseQty,
        noChange: true,
        currentVersion: computeRowVersion(rowData),
      });
    }

    sheet.getRange(row, COL_LOOSE).setValue(looseQty);

    logAudit(ss, {
      action: 'LOOSE_UPDATED',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: new Date(),
      warehouse: String(rowData[COL_WAREHOUSE - 1] || '').trim() || '—',
      floor: String(rowData[COL_FLOOR - 1] || '').trim() || '—',
      location: String(rowData[COL_LOCATION - 1] || '').trim() || '—',
      type: String(rowData[COL_TYPE - 1] || '').trim() || '—',
      size: String(rowData[COL_SIZE - 1] || '').trim() || '—',
      packet: String(rowData[COL_PACKET - 1] || '').trim() || '—',
      oldValue: oldLooseQty,
      newValue: looseQty,
      change: 'loose_qty',
      notes: 'Unit ' + unit,
      sheetRow: row,
    });

    return successResponse({
      row: row,
      looseQty: looseQty,
      currentVersion: computeRowVersion(readRow(sheet, row)),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleTransferLooseQty(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const sourceRow = parseInt(body.sourceRow, 10);
  const transferQty = parsePositiveQuantity(body.transferQty);
  const destination = body.destination || {};
  const destinationWarehouse = String(destination.warehouse || '').trim();
  const destinationFloor = String(destination.floor || '').trim();
  const destinationLocation = String(destination.location || '').trim();
  const createDestinationIfMissing = destination.createIfMissing !== false;

  if (!Number.isInteger(sourceRow) || sourceRow < 2) return errorResponse('Invalid source row.', 'BAD_REQUEST');
  if (transferQty === null) return errorResponse('Transfer quantity must be greater than 0.', 'BAD_REQUEST');
  if (!destinationLocation) return errorResponse('Destination location is required.', 'BAD_REQUEST');
  if (ALLOWED_WAREHOUSES.indexOf(destinationWarehouse) === -1) {
    return errorResponse('Invalid destination warehouse. Allowed: ' + ALLOWED_WAREHOUSES.join(', '), 'BAD_REQUEST');
  }
  if (ALLOWED_FLOORS.indexOf(destinationFloor) === -1) {
    return errorResponse('Invalid destination floor. Allowed: ' + ALLOWED_FLOORS.join(', '), 'BAD_REQUEST');
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!sheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
    if (!isValidInventoryRow(sheet, sourceRow)) return errorResponse('Source row not found.', 'NOT_FOUND');

    const sourceRowData = readRow(sheet, sourceRow);
    const sourceVersionConflict = checkExpectedVersion(sourceRowData, body.expectedVersion);
    if (sourceVersionConflict) return sourceVersionConflict;

    if (!hasBaseMetadata(sourceRowData)) {
      return errorResponse('Source row needs valid qty/unit metadata (pcs or kg).', 'CONFLICT');
    }

    const sourceWarehouse = String(sourceRowData[COL_WAREHOUSE - 1] || '').trim();
    const sourceFloor = String(sourceRowData[COL_FLOOR - 1] || '').trim();
    const sourceLocation = String(sourceRowData[COL_LOCATION - 1] || '').trim();
    if (sourceWarehouse === destinationWarehouse && sourceFloor === destinationFloor && sourceLocation === destinationLocation) {
      return errorResponse('Source and destination location cannot be the same.', 'BAD_REQUEST');
    }

    const sourceUnit = parseRowUnit(sourceRowData);
    const sourceQtyPerPacket = parseRowQtyPerPacket(sourceRowData);
    if (!isValidLooseQtyForUnit(transferQty, sourceUnit)) {
      return errorResponse('Transfer quantity must be a whole number for pcs rows.', 'BAD_REQUEST');
    }

    const sourceLooseQty = parseRowLooseQty(sourceRowData);
    if (transferQty - sourceLooseQty > NUMBER_EPSILON) {
      return errorResponse('Transfer quantity exceeds available loose quantity.', 'CONFLICT', {
        details: {
          row: sourceRow,
          reason: 'insufficient_loose_qty',
          currentLooseQty: sourceLooseQty,
          transferQty: transferQty,
          unit: sourceUnit,
        },
      });
    }

    const dest = findLooseDestinationRow(sheet, sourceRowData, destinationWarehouse, destinationFloor, destinationLocation, sourceRow);
    var destinationRow = null;
    var destinationCreated = false;
    var oldDestinationLooseQty = 0;

    if (dest) {
      destinationRow = dest.row;
      const destinationRowData = dest.rowData;
      const expectedDestinationVersion = String(body.expectedDestinationVersion || '').trim();
      if (expectedDestinationVersion) {
        const currentDestinationVersion = computeRowVersion(destinationRowData);
        if (expectedDestinationVersion !== currentDestinationVersion) {
          return errorResponse('Destination row changed by another user. Please refresh and retry.', 'CONFLICT', {
            details: {
              row: destinationRow,
              reason: 'destination_version_mismatch',
            },
          });
        }
      }

      const destinationUnit = parseRowUnit(destinationRowData);
      const destinationQtyPerPacket = parseRowQtyPerPacket(destinationRowData);
      if (destinationUnit !== sourceUnit || !numbersNearlyEqual(destinationQtyPerPacket, sourceQtyPerPacket)) {
        return errorResponse('Destination row metadata mismatch (qty/unit).', 'CONFLICT', {
          details: {
            row: destinationRow,
            reason: 'destination_metadata_mismatch',
            sourceUnit: sourceUnit,
            sourceQtyPerPacket: sourceQtyPerPacket,
            destinationUnit: destinationUnit,
            destinationQtyPerPacket: destinationQtyPerPacket,
          },
        });
      }
      oldDestinationLooseQty = parseRowLooseQty(destinationRowData);
    } else {
      if (!createDestinationIfMissing) {
        return errorResponse('Destination row not found.', 'NOT_FOUND');
      }
      const newDestinationRowData = sourceRowData.slice();
      newDestinationRowData[COL_WAREHOUSE - 1] = destinationWarehouse;
      newDestinationRowData[COL_FLOOR - 1] = destinationFloor;
      newDestinationRowData[COL_LOCATION - 1] = destinationLocation;
      newDestinationRowData[COL_STOCK - 1] = 0;
      newDestinationRowData[COL_LOOSE - 1] = 0;
      sheet.appendRow(newDestinationRowData);
      destinationRow = sheet.getLastRow();
      destinationCreated = true;
      oldDestinationLooseQty = 0;
    }

    const newSourceLooseQty = normalizeNumberValue(Math.max(0, sourceLooseQty - transferQty));
    const newDestinationLooseQty = normalizeNumberValue(oldDestinationLooseQty + transferQty);

    sheet.getRange(sourceRow, COL_LOOSE).setValue(newSourceLooseQty);
    sheet.getRange(destinationRow, COL_LOOSE).setValue(newDestinationLooseQty);

    const sourceDataAfter = readRow(sheet, sourceRow);
    const destinationDataAfter = readRow(sheet, destinationRow);

    logAudit(ss, {
      action: 'LOOSE_TRANSFERRED_OUT',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: new Date(),
      warehouse: sourceWarehouse || '—',
      floor: sourceFloor || '—',
      location: sourceLocation || '—',
      type: String(sourceRowData[COL_TYPE - 1] || '').trim() || '—',
      size: String(sourceRowData[COL_SIZE - 1] || '').trim() || '—',
      packet: String(sourceRowData[COL_PACKET - 1] || '').trim() || '—',
      oldValue: sourceLooseQty,
      newValue: newSourceLooseQty,
      change: '-' + formatQuantityForText(transferQty) + ' ' + sourceUnit,
      notes: 'To row ' + destinationRow + ' (' + destinationWarehouse + '/' + destinationFloor + '/' + destinationLocation + ')',
      sheetRow: sourceRow,
    });

    logAudit(ss, {
      action: 'LOOSE_TRANSFERRED_IN',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: new Date(),
      warehouse: destinationWarehouse || '—',
      floor: destinationFloor || '—',
      location: destinationLocation || '—',
      type: String(sourceRowData[COL_TYPE - 1] || '').trim() || '—',
      size: String(sourceRowData[COL_SIZE - 1] || '').trim() || '—',
      packet: String(sourceRowData[COL_PACKET - 1] || '').trim() || '—',
      oldValue: oldDestinationLooseQty,
      newValue: newDestinationLooseQty,
      change: '+' + formatQuantityForText(transferQty) + ' ' + sourceUnit,
      notes: 'From row ' + sourceRow + (destinationCreated ? ' / destination-created' : ''),
      sheetRow: destinationRow,
    });

    return successResponse({
      sourceRow: sourceRow,
      destinationRow: destinationRow,
      destinationCreated: destinationCreated,
      transferQty: transferQty,
      unit: sourceUnit,
      sourceLooseQty: newSourceLooseQty,
      destinationLooseQty: newDestinationLooseQty,
      sourceCurrentVersion: computeRowVersion(sourceDataAfter),
      destinationCurrentVersion: computeRowVersion(destinationDataAfter),
    });
  } finally {
    lock.releaseLock();
  }
}

function ensureOrdersSheet(ss) {
  let sheet = ss.getSheetByName(ORDERS_SHEET);
  const headers = ['Created At', 'Updated At', 'Order ID', 'Line ID', 'Status', 'Actor', 'Type', 'Size', 'Packet', 'Requested Qty', 'Fulfilled Qty', 'Notes', 'Last Allocation JSON', 'Last Request ID', 'Requested Mode', 'Requested UOM'];
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaderRefresh = String(first[2] || '').trim() !== 'Order ID' ||
    String(first[14] || '').trim() !== 'Requested Mode' ||
    String(first[15] || '').trim() !== 'Requested UOM';
  if (needsHeaderRefresh) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureReceiptsSheet(ss) {
  let sheet = ss.getSheetByName(RECEIPTS_SHEET);
  const headers = [
    'Created At',
    'Updated At',
    'Posted At',
    'Receipt ID',
    'Line ID',
    'Status',
    'Actor',
    'Type',
    'Size',
    'Packet',
    'Warehouse',
    'Floor',
    'Location',
    'Received Qty',
    'Qty Per Unit',
    'Unit',
    'Loose Qty',
    'Notes',
    'Receipt Date',
    'Last Request ID',
    'Details',
  ];
  if (!sheet) {
    sheet = ss.insertSheet(RECEIPTS_SHEET);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaderRefresh = String(first[3] || '').trim() !== 'Receipt ID' ||
    String(first[18] || '').trim() !== 'Receipt Date' ||
    String(first[20] || '').trim() !== 'Details';
  if (needsHeaderRefresh) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatDateOnly(dateObj) {
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseDateOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || '').trim();
  if (!text) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const out = new Date(year, month, day);
    if (isNaN(out.getTime())) return null;
    if (out.getFullYear() !== year || out.getMonth() !== month || out.getDate() !== day) return null;
    return out;
  }

  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function validateReceiptDate(value) {
  const receiptDate = parseDateOnly(value);
  if (!receiptDate) {
    return { ok: false, message: 'Receipt date must be a valid date.', code: 'BAD_REQUEST' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() - RECEIPT_BACKDATE_DAYS);

  if (receiptDate > today) {
    return { ok: false, message: 'Future receipt dates are not allowed.', code: 'BAD_REQUEST' };
  }
  if (receiptDate < minDate) {
    return {
      ok: false,
      message: 'Receipt date cannot be older than ' + RECEIPT_BACKDATE_DAYS + ' days.',
      code: 'BAD_REQUEST',
    };
  }

  return {
    ok: true,
    date: receiptDate,
    iso: formatDateOnly(receiptDate),
  };
}

function normalizeReceiptLineInput(input, fallbackDate) {
  const line = input && typeof input === 'object' ? input : {};
  const type = String(line.type || '').trim();
  const size = String(line.size || '').trim();
  const details = String(line.details || '').trim();
  const packet = String(line.packet || '').trim();
  const warehouse = String(line.warehouse || '').trim();
  const floor = String(line.floor || '').trim();
  const location = String(line.location || '').trim();
  const notes = String(line.notes || '').trim();
  const receivedQty = parsePositiveQuantity(line.receivedQty);
  const unit = String(line.unit || '').trim().toLowerCase();
  const qtyPerUnitRaw = line.qtyPerUnit;
  const looseQtyRaw = line.looseQty;
  const receiptDateRaw = line.receiptDate || fallbackDate;

  const qtyPerUnit = qtyPerUnitRaw === null || qtyPerUnitRaw === undefined || String(qtyPerUnitRaw).trim() === ''
    ? null
    : parseFloat(qtyPerUnitRaw);
  const looseQty = looseQtyRaw === null || looseQtyRaw === undefined || String(looseQtyRaw).trim() === ''
    ? 0
    : parseNonNegativeLooseQty(looseQtyRaw);

  if (!type || !size || !packet) return { error: 'Type, size and packet are required.' };
  if (!warehouse || !floor || !location) return { error: 'Warehouse, floor and location are required.' };
  if (ALLOWED_PACKETS.indexOf(packet) === -1) return { error: 'Invalid packet type.' };
  if (ALLOWED_WAREHOUSES.indexOf(warehouse) === -1) return { error: 'Invalid warehouse. Allowed: ' + ALLOWED_WAREHOUSES.join(', ') };
  if (ALLOWED_FLOORS.indexOf(floor) === -1) return { error: 'Invalid floor. Allowed: ' + ALLOWED_FLOORS.join(', ') };
  if (receivedQty === null || !numbersNearlyEqual(receivedQty, Math.round(receivedQty))) {
    return { error: 'Received qty must be a positive whole number.' };
  }

  if (qtyPerUnit !== null && (!isFinite(qtyPerUnit) || qtyPerUnit <= 0)) {
    return { error: 'Qty per unit must be a positive number.' };
  }
  if (unit && ['kg', 'pcs'].indexOf(unit) === -1) {
    return { error: 'Unit must be kg or pcs.' };
  }
  if ((qtyPerUnit !== null || unit) && !(qtyPerUnit !== null && unit)) {
    return { error: 'Qty per unit and unit must be provided together.' };
  }
  if (looseQty === null) {
    return { error: 'Loose qty must be a non-negative number.' };
  }
  if (looseQty > 0 && !(qtyPerUnit !== null && unit)) {
    return { error: 'Loose qty requires qty per unit and unit metadata.' };
  }
  if (unit === 'pcs' && !numbersNearlyEqual(looseQty, Math.round(looseQty))) {
    return { error: 'Loose qty must be a whole number for pcs rows.' };
  }

  const dateValidation = validateReceiptDate(receiptDateRaw);
  if (!dateValidation.ok) return { error: dateValidation.message, code: dateValidation.code };

  return {
    value: {
      type: type,
      size: size,
      details: details,
      packet: packet,
      warehouse: warehouse,
      floor: floor,
      location: location,
      receivedQty: Math.round(receivedQty),
      qtyPerUnit: qtyPerUnit === null ? null : normalizeNumberValue(qtyPerUnit),
      unit: unit,
      looseQty: normalizeNumberValue(looseQty),
      notes: notes,
      receiptDate: dateValidation.date,
      receiptDateIso: dateValidation.iso,
    },
  };
}

function mapReceiptLineRow(row, sheetRow) {
  const receiptDate = parseDateOnly(row[RC_RECEIPT_DATE - 1]);
  return {
    createdAt: row[RC_CREATED_AT - 1],
    updatedAt: row[RC_UPDATED_AT - 1],
    postedAt: row[RC_POSTED_AT - 1],
    receiptId: String(row[RC_RECEIPT_ID - 1] || '').trim(),
    lineId: String(row[RC_LINE_ID - 1] || '').trim(),
    status: String(row[RC_STATUS - 1] || RECEIPT_STATUS_DRAFT).trim(),
    actor: String(row[RC_ACTOR - 1] || '').trim(),
    type: String(row[RC_TYPE - 1] || '').trim(),
    size: String(row[RC_SIZE - 1] || '').trim(),
    details: String(row[RC_DETAILS - 1] || '').trim(),
    packet: String(row[RC_PACKET - 1] || '').trim(),
    warehouse: String(row[RC_WAREHOUSE - 1] || '').trim(),
    floor: String(row[RC_FLOOR - 1] || '').trim(),
    location: String(row[RC_LOCATION - 1] || '').trim(),
    receivedQty: parseFloat(row[RC_RECEIVED_QTY - 1]) || 0,
    qtyPerUnit: row[RC_QTY_PER_UNIT - 1] === '' || row[RC_QTY_PER_UNIT - 1] === null
      ? null
      : parseFloat(row[RC_QTY_PER_UNIT - 1]),
    unit: String(row[RC_UNIT - 1] || '').trim().toLowerCase(),
    looseQty: parseFloat(row[RC_LOOSE_QTY - 1]) || 0,
    notes: String(row[RC_NOTES - 1] || '').trim(),
    receiptDate: receiptDate ? formatDateOnly(receiptDate) : '',
    lastRequestId: String(row[RC_LAST_REQUEST_ID - 1] || '').trim(),
    sheetRow: sheetRow,
  };
}

function generateReceiptId() {
  return 'RCP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function generateReceiptLineId() {
  return 'RLINE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getReceiptLineById(receiptsSheet, receiptId, lineId) {
  if (receiptsSheet.getLastRow() < 2) return null;
  const values = receiptsSheet.getRange(2, 1, receiptsSheet.getLastRow() - 1, RECEIPT_TOTAL_COLS).getValues();
  for (var i = 0; i < values.length; i++) {
    const line = mapReceiptLineRow(values[i], i + 2);
    if (line.receiptId === receiptId && line.lineId === lineId) return line;
  }
  return null;
}

function findInventoryRowForReceipt(sheet, line) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLS).getValues();

  for (var i = 0; i < values.length; i++) {
    const rowData = values[i];
    if (String(rowData[COL_TYPE - 1] || '').trim() !== line.type) continue;
    if (String(rowData[COL_SIZE - 1] || '').trim() !== line.size) continue;
    if (String(line.details || '').trim() && String(rowData[COL_DETAILS - 1] || '').trim() !== String(line.details || '').trim()) continue;
    if (String(rowData[COL_PACKET - 1] || '').trim() !== line.packet) continue;
    if (String(rowData[COL_WAREHOUSE - 1] || '').trim() !== line.warehouse) continue;
    if (String(rowData[COL_FLOOR - 1] || '').trim() !== line.floor) continue;
    if (String(rowData[COL_LOCATION - 1] || '').trim() !== line.location) continue;

    if (line.qtyPerUnit !== null || line.unit) {
      const rowQty = parseRowQtyPerPacket(rowData);
      const rowUnit = parseRowUnit(rowData);
      if (rowQty === null || rowUnit !== line.unit) continue;
      if (!numbersNearlyEqual(rowQty, line.qtyPerUnit)) continue;
    }

    return {
      row: i + 2,
      rowData: rowData,
    };
  }

  return null;
}

function mapOrderLineRow(row, sheetRow) {
  const requestedMode = normalizeOrderModeValue(row[14]) || ORDER_MODE_UNIT;
  const requestedUom = normalizeOrderUomValue(row[15], requestedMode);
  return {
    createdAt: row[0],
    updatedAt: row[1],
    orderId: String(row[2] || '').trim(),
    lineId: String(row[3] || '').trim(),
    status: String(row[4] || 'DRAFT').trim(),
    actor: String(row[5] || '').trim(),
    type: String(row[6] || '').trim(),
    size: String(row[7] || '').trim(),
    packet: String(row[8] || '').trim(),
    requestedQty: parseFloat(row[9]) || 0,
    fulfilledQty: parseFloat(row[10]) || 0,
    notes: String(row[11] || '').trim(),
    lastAllocationJson: String(row[12] || '').trim(),
    lastRequestId: String(row[13] || '').trim(),
    requestedMode: requestedMode,
    requestedUom: requestedUom,
    sheetRow: sheetRow,
  };
}

function generateOrderId() {
  return 'ORD-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function generateOrderLineId() {
  return 'LINE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeNumberValue(value) {
  return Math.round((parseFloat(value) || 0) * 1000000) / 1000000;
}

function numbersNearlyEqual(a, b) {
  return Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) <= NUMBER_EPSILON;
}

function parsePositiveQuantity(value) {
  const num = parseFloat(value);
  if (!isFinite(num) || num <= 0) return null;
  return normalizeNumberValue(num);
}

function normalizeOrderModeValue(value) {
  const mode = String(value || '').trim().toUpperCase();
  if (mode === ORDER_MODE_UNIT || mode === ORDER_MODE_BASE) return mode;
  return null;
}

function normalizeOrderUomValue(value, mode) {
  const normalizedMode = normalizeOrderModeValue(mode) || ORDER_MODE_UNIT;
  const uom = String(value || '').trim().toLowerCase();
  if (normalizedMode === ORDER_MODE_UNIT) return 'unit';
  if (uom === 'pcs' || uom === 'kg') return uom;
  return null;
}

function formatQuantityForText(value) {
  const num = normalizeNumberValue(value);
  if (numbersNearlyEqual(num, Math.round(num))) return String(Math.round(num));
  return String(num);
}

function parseRowQtyPerPacket(rowData) {
  const raw = rowData[COL_QTY - 1];
  if (raw === '' || raw === null || raw === undefined) return null;
  const num = parseFloat(raw);
  if (!isFinite(num) || num <= 0) return null;
  return normalizeNumberValue(num);
}

function parseRowUnit(rowData) {
  return String(rowData[COL_UNIT - 1] || '').trim().toLowerCase();
}

function parseRowLooseQty(rowData) {
  const raw = rowData[COL_LOOSE - 1];
  if (raw === '' || raw === null || raw === undefined) return 0;
  const num = parseFloat(raw);
  if (!isFinite(num) || num < 0) return 0;
  return normalizeNumberValue(num);
}

function parseNonNegativeLooseQty(value) {
  const num = parseFloat(value);
  if (!isFinite(num) || num < 0) return null;
  return normalizeNumberValue(num);
}

function isValidLooseQtyForUnit(value, unit) {
  if (unit !== 'pcs') return true;
  return numbersNearlyEqual(value, Math.round(value));
}

function hasBaseMetadata(rowData) {
  const qtyPerPacket = parseRowQtyPerPacket(rowData);
  const unit = parseRowUnit(rowData);
  return !!qtyPerPacket && (unit === 'kg' || unit === 'pcs');
}

function findLooseDestinationRow(sheet, sourceRowData, warehouse, floor, location, excludedRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLS).getValues();
  const srcType = String(sourceRowData[COL_TYPE - 1] || '').trim();
  const srcSize = String(sourceRowData[COL_SIZE - 1] || '').trim();
  const srcDetails = String(sourceRowData[COL_DETAILS - 1] || '').trim();
  const srcPacket = String(sourceRowData[COL_PACKET - 1] || '').trim();

  for (var i = 0; i < values.length; i++) {
    const rowNum = i + 2;
    if (rowNum === excludedRow) continue;
    const rowData = values[i];
    if (String(rowData[COL_TYPE - 1] || '').trim() !== srcType) continue;
    if (String(rowData[COL_SIZE - 1] || '').trim() !== srcSize) continue;
    if (String(rowData[COL_DETAILS - 1] || '').trim() !== srcDetails) continue;
    if (String(rowData[COL_PACKET - 1] || '').trim() !== srcPacket) continue;
    if (String(rowData[COL_WAREHOUSE - 1] || '').trim() !== warehouse) continue;
    if (String(rowData[COL_FLOOR - 1] || '').trim() !== floor) continue;
    if (String(rowData[COL_LOCATION - 1] || '').trim() !== location) continue;
    return { row: rowNum, rowData: rowData };
  }
  return null;
}

function isUnitBasedRow(rowData) {
  const qtyPerPacket = parseRowQtyPerPacket(rowData);
  const unit = parseRowUnit(rowData);
  return !!qtyPerPacket && unit === 'kg';
}

function samePlacementAndSku(rowData, meta) {
  return String(rowData[COL_TYPE - 1] || '').trim() === meta.type &&
    String(rowData[COL_SIZE - 1] || '').trim() === meta.size &&
    String(rowData[COL_PACKET - 1] || '').trim() === meta.packet &&
    String(rowData[COL_WAREHOUSE - 1] || '').trim() === meta.warehouse &&
    String(rowData[COL_FLOOR - 1] || '').trim() === meta.floor &&
    String(rowData[COL_LOCATION - 1] || '').trim() === meta.location;
}

function findResidueMergeCandidate(sheet, meta, excludedRows) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, TOTAL_COLS).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowNum = i + 2;
    if (excludedRows && excludedRows[rowNum]) continue;
    var rowData = values[i];
    if (!samePlacementAndSku(rowData, meta)) continue;
    var unit = parseRowUnit(rowData);
    if (unit !== meta.unit) continue;
    var qtyPerPacket = parseRowQtyPerPacket(rowData);
    if (qtyPerPacket === null || !numbersNearlyEqual(qtyPerPacket, meta.residueQtyPerPacket)) continue;
    return {
      row: rowNum,
      rowData: rowData,
    };
  }
  return null;
}

function handleCreateOrderDraft(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const orderId = String(body.orderId || '').trim() || generateOrderId();
  const line = body.line || {};
  const type = String(line.type || '').trim();
  const size = String(line.size || '').trim();
  const packet = String(line.packet || '').trim();
  const requestedQty = parsePositiveQuantity(line.requestedQty);
  const notes = String(line.notes || '').trim();
  const requestedMode = normalizeOrderModeValue(line.requestedMode) || ORDER_MODE_UNIT;
  const requestedUom = normalizeOrderUomValue(line.requestedUom, requestedMode);

  if (!type || !size || !packet) return errorResponse('Type, size and packet are required.', 'BAD_REQUEST');
  if (ALLOWED_PACKETS.indexOf(packet) === -1) return errorResponse('Invalid packet type.', 'BAD_REQUEST');
  if (requestedQty === null) return errorResponse('Requested quantity must be greater than 0.', 'BAD_REQUEST');
  if (!requestedUom) return errorResponse('Requested UOM is invalid for selected fulfillment mode.', 'BAD_REQUEST');
  if ((requestedMode === ORDER_MODE_UNIT || requestedUom === 'pcs') && !numbersNearlyEqual(requestedQty, Math.round(requestedQty))) {
    return errorResponse('Requested quantity must be a whole number for this mode.', 'BAD_REQUEST');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ensureOrdersSheet(ss);
  const now = new Date();
  const lineId = generateOrderLineId();

  ordersSheet.appendRow([now, now, orderId, lineId, 'DRAFT', actor, type, size, packet, requestedQty, 0, notes, '', requestId, requestedMode, requestedUom]);

  logAudit(ss, {
    action: 'ORDER_CREATED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: '—',
    floor: '—',
    location: '—',
    type: type,
    size: size,
    packet: packet,
    oldValue: '—',
    newValue: requestedQty,
    change: 'Draft line created',
    notes: orderId + ' / ' + lineId,
    sheetRow: ordersSheet.getLastRow(),
  });

  return successResponse({ orderId: orderId, lineId: lineId, status: 'DRAFT' });
}

function handleListOrders(body) {
  const includeClosed = body.includeClosed !== false;
  const actorFilter = String(body.actorFilter || '').trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ensureOrdersSheet(ss);
  if (ordersSheet.getLastRow() < 2) return successResponse({ orders: [] });

  const values = ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 16).getValues();
  const out = [];
  for (var i = values.length - 1; i >= 0; i--) {
    const line = mapOrderLineRow(values[i], i + 2);
    if (!includeClosed && (line.status === 'COMPLETE' || line.status === 'CANCELLED')) continue;
    if (actorFilter && line.actor !== actorFilter) continue;
    out.push(line);
  }
  return successResponse({ orders: out });
}

function getOrderLineById(ordersSheet, orderId, lineId) {
  if (ordersSheet.getLastRow() < 2) return null;
  const values = ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 16).getValues();
  for (var i = 0; i < values.length; i++) {
    const line = mapOrderLineRow(values[i], i + 2);
    if (line.orderId === orderId && line.lineId === lineId) return line;
  }
  return null;
}

function handleUpdateOrderLine(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const orderId = String(body.orderId || '').trim();
  const lineId = String(body.lineId || '').trim();
  const notes = String(body.notes || '').trim();
  const requestedQty = parsePositiveQuantity(body.requestedQty);
  const requestedModeInput = body.requestedMode;
  const requestedUomInput = body.requestedUom;

  if (!orderId || !lineId) return errorResponse('Order ID and line ID are required.', 'BAD_REQUEST');
  if (requestedQty === null) return errorResponse('Requested quantity must be greater than 0.', 'BAD_REQUEST');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ensureOrdersSheet(ss);
  const line = getOrderLineById(ordersSheet, orderId, lineId);
  if (!line) return errorResponse('Order line not found.', 'NOT_FOUND');
  if (line.status === 'COMPLETE' || line.status === 'CANCELLED') {
    return errorResponse('Completed/cancelled lines cannot be edited.', 'INVALID_STATE');
  }
  if (requestedQty + NUMBER_EPSILON < line.fulfilledQty) {
    return errorResponse('Requested quantity cannot be less than already fulfilled quantity.', 'BAD_REQUEST');
  }

  const existingMode = normalizeOrderModeValue(line.requestedMode) || ORDER_MODE_UNIT;
  const nextMode = requestedModeInput === undefined ? existingMode : normalizeOrderModeValue(requestedModeInput);
  if (!nextMode) return errorResponse('Requested fulfillment mode is invalid.', 'BAD_REQUEST');

  const rawUom = requestedUomInput === undefined ? line.requestedUom : requestedUomInput;
  const nextUom = normalizeOrderUomValue(rawUom, nextMode);
  if (!nextUom) return errorResponse('Requested UOM is invalid for selected fulfillment mode.', 'BAD_REQUEST');
  if ((nextMode === ORDER_MODE_UNIT || nextUom === 'pcs') && !numbersNearlyEqual(requestedQty, Math.round(requestedQty))) {
    return errorResponse('Requested quantity must be a whole number for this mode.', 'BAD_REQUEST');
  }

  const newStatus = line.fulfilledQty === 0 ? 'DRAFT' : (line.fulfilledQty >= requestedQty ? 'COMPLETE' : 'PARTIAL');
  const now = new Date();
  ordersSheet.getRange(line.sheetRow, 2).setValue(now);
  ordersSheet.getRange(line.sheetRow, 5).setValue(newStatus);
  ordersSheet.getRange(line.sheetRow, 10).setValue(requestedQty);
  ordersSheet.getRange(line.sheetRow, 12).setValue(notes);
  ordersSheet.getRange(line.sheetRow, 14).setValue(requestId);
  ordersSheet.getRange(line.sheetRow, 15).setValue(nextMode);
  ordersSheet.getRange(line.sheetRow, 16).setValue(nextUom);

  logAudit(ss, {
    action: 'ORDER_UPDATED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: '—',
    floor: '—',
    location: '—',
    type: line.type,
    size: line.size,
    packet: line.packet,
    oldValue: line.requestedQty,
    newValue: requestedQty,
    change: 'Draft line updated',
    notes: orderId + ' / ' + lineId,
    sheetRow: line.sheetRow,
  });

  return successResponse({ status: newStatus });
}

function handleCancelOrderLine(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const orderId = String(body.orderId || '').trim();
  const lineId = String(body.lineId || '').trim();
  if (!orderId || !lineId) return errorResponse('Order ID and line ID are required.', 'BAD_REQUEST');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ensureOrdersSheet(ss);
  const line = getOrderLineById(ordersSheet, orderId, lineId);
  if (!line) return errorResponse('Order line not found.', 'NOT_FOUND');
  if (line.status === 'COMPLETE') return errorResponse('Completed lines cannot be cancelled.', 'INVALID_STATE');

  const now = new Date();
  ordersSheet.getRange(line.sheetRow, 2).setValue(now);
  ordersSheet.getRange(line.sheetRow, 5).setValue('CANCELLED');
  ordersSheet.getRange(line.sheetRow, 14).setValue(requestId);

  logAudit(ss, {
    action: 'ORDER_CANCELLED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: '—',
    floor: '—',
    location: '—',
    type: line.type,
    size: line.size,
    packet: line.packet,
    oldValue: line.status,
    newValue: 'CANCELLED',
    change: 'Draft line cancelled',
    notes: orderId + ' / ' + lineId,
    sheetRow: line.sheetRow,
  });

  return successResponse({ status: 'CANCELLED' });
}

function handleCommitOrderFulfillment(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const orderId = String(body.orderId || '').trim();
  const lineId = String(body.lineId || '').trim();
  const fulfillQty = parsePositiveQuantity(body.fulfillQty);
  const allocations = Array.isArray(body.allocations) ? body.allocations : [];

  if (!orderId || !lineId) return errorResponse('Order ID and line ID are required.', 'BAD_REQUEST');
  if (fulfillQty === null) return errorResponse('Fulfill quantity must be greater than 0.', 'BAD_REQUEST');
  if (!allocations.length) return errorResponse('At least one location allocation is required.', 'BAD_REQUEST');

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inventorySheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!inventorySheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
    const ordersSheet = ensureOrdersSheet(ss);
    const line = getOrderLineById(ordersSheet, orderId, lineId);
    if (!line) return errorResponse('Order line not found.', 'NOT_FOUND');
    if (line.status === 'CANCELLED') return errorResponse('Cancelled line cannot be committed.', 'INVALID_STATE');

    const lineMode = normalizeOrderModeValue(line.requestedMode) || ORDER_MODE_UNIT;
    const lineUom = normalizeOrderUomValue(line.requestedUom, lineMode);
    if (lineMode === ORDER_MODE_BASE && !lineUom) {
      return errorResponse('Order line has invalid base UOM. Update line mode and retry.', 'CONFLICT');
    }
    if ((lineMode === ORDER_MODE_UNIT || lineUom === 'pcs') && !numbersNearlyEqual(fulfillQty, Math.round(fulfillQty))) {
      return errorResponse('Fulfill quantity must be a whole number for this line mode.', 'BAD_REQUEST');
    }

    const remaining = normalizeNumberValue(Math.max(0, line.requestedQty - line.fulfilledQty));
    if (fulfillQty - remaining > NUMBER_EPSILON) {
      return errorResponse('Fulfill quantity exceeds remaining requested quantity (' + formatQuantityForText(remaining) + ').', 'BAD_REQUEST');
    }

    var allocationTotal = 0;
    for (var ai = 0; ai < allocations.length; ai++) {
      const allocQty = normalizeNumberValue(parseFloat((allocations[ai] || {}).qty));
      if (!isFinite(allocQty) || allocQty <= 0) {
        return errorResponse('Invalid allocation payload at item ' + (ai + 1) + '.', 'BAD_REQUEST');
      }
      if ((lineMode === ORDER_MODE_UNIT || lineUom === 'pcs') && !numbersNearlyEqual(allocQty, Math.round(allocQty))) {
        return errorResponse('Allocation qty must be a whole number at item ' + (ai + 1) + '.', 'BAD_REQUEST');
      }
      allocationTotal = normalizeNumberValue(allocationTotal + allocQty);
    }
    if (!numbersNearlyEqual(allocationTotal, fulfillQty)) {
      return errorResponse('Allocation total must equal fulfill quantity.', 'BAD_REQUEST');
    }

    const updates = [];
    for (var i = 0; i < allocations.length; i++) {
      const alloc = allocations[i] || {};
      const row = parseInt(alloc.row, 10);
      const qtyRaw = parsePositiveQuantity(alloc.qty);
      const qty = qtyRaw === null ? null : normalizeNumberValue(qtyRaw);
      if (!Number.isInteger(row) || row < 2 || qty === null) {
        return errorResponse('Invalid allocation payload at item ' + (i + 1) + '.', 'BAD_REQUEST');
      }
      if (!isValidInventoryRow(inventorySheet, row)) {
        return errorResponse('Allocation row not found: ' + row, 'NOT_FOUND');
      }

      const rowData = readRow(inventorySheet, row);
      const rowType = String(rowData[COL_TYPE - 1] || '').trim();
      const rowSize = String(rowData[COL_SIZE - 1] || '').trim();
      const rowPacket = String(rowData[COL_PACKET - 1] || '').trim();
      if (rowType !== line.type || rowSize !== line.size || rowPacket !== line.packet) {
        return errorResponse('Allocation row ' + row + ' does not match order SKU.', 'CONFLICT', {
          details: {
            row: row,
            reason: 'sku_mismatch',
            expectedType: line.type,
            expectedSize: line.size,
            expectedPacket: line.packet,
            actualType: rowType,
            actualSize: rowSize,
            actualPacket: rowPacket,
          },
        });
      }

      const expectedWarehouse = String(alloc.warehouse || '').trim();
      const expectedFloor = String(alloc.floor || '').trim();
      const expectedLocation = String(alloc.location || '').trim();
      const actualWarehouse = String(rowData[COL_WAREHOUSE - 1] || '').trim();
      const actualFloor = String(rowData[COL_FLOOR - 1] || '').trim();
      const actualLocation = String(rowData[COL_LOCATION - 1] || '').trim();
      if ((expectedWarehouse && expectedWarehouse !== actualWarehouse) ||
          (expectedFloor && expectedFloor !== actualFloor) ||
          (expectedLocation && expectedLocation !== actualLocation)) {
        return errorResponse('Placement conflict at row ' + row + '. Please refresh and re-allocate.', 'CONFLICT', {
          details: {
            row: row,
            reason: 'placement_changed',
            warehouse: actualWarehouse,
            floor: actualFloor,
            location: actualLocation,
          },
        });
      }

      const expectedVersion = String(alloc.expectedVersion || '').trim();
      const currentVersion = computeRowVersion(rowData);
      if (expectedVersion && expectedVersion !== currentVersion) {
        return errorResponse('Conflict: row changed by another user. Please refresh and retry.', 'CONFLICT', {
          currentVersion: currentVersion,
          details: {
            row: row,
            reason: 'row_version_mismatch',
            warehouse: actualWarehouse,
            floor: actualFloor,
            location: actualLocation,
          },
        });
      }

      const currentStock = parseInt(rowData[COL_STOCK - 1], 10) || 0;
      const rowUnit = parseRowUnit(rowData);

      if (lineMode === ORDER_MODE_UNIT) {
        if (!Number.isInteger(qty)) {
          return errorResponse('Allocation qty must be an integer packet count at row ' + row + '.', 'BAD_REQUEST');
        }
        if (qty > currentStock) {
          return errorResponse('Insufficient stock at ' + actualWarehouse + '/' + actualFloor + '/' + actualLocation + '.', 'CONFLICT', {
            currentValue: currentStock,
            details: {
              row: row,
              reason: 'insufficient_stock',
              warehouse: actualWarehouse,
              floor: actualFloor,
              location: actualLocation,
              currentStock: currentStock,
              requestedQty: qty,
            },
          });
        }

        updates.push({
          row: row,
          qty: qty,
          newStock: currentStock - qty,
          oldStock: currentStock,
          oldLoose: null,
          newLoose: null,
          warehouse: actualWarehouse,
          floor: actualFloor,
          location: actualLocation,
          version: computeRowVersion(rowData),
          mode: 'packet',
          unit: rowUnit || '',
          consumedPackets: qty,
        });
        continue;
      }

      const qtyPerPacket = parseRowQtyPerPacket(rowData);
      const looseQty = parseRowLooseQty(rowData);
      if (!qtyPerPacket || rowUnit !== lineUom) {
        return errorResponse('Row ' + row + ' cannot fulfill in ' + lineUom + ' mode. Check qty/unit metadata.', 'CONFLICT', {
          details: {
            row: row,
            reason: 'base_meta_missing',
            warehouse: actualWarehouse,
            floor: actualFloor,
            location: actualLocation,
            unit: rowUnit,
            requestedUom: lineUom,
            qtyPerPacket: qtyPerPacket,
          },
        });
      }

      const availableBase = normalizeNumberValue(currentStock * qtyPerPacket + looseQty);
      if (qty - availableBase > NUMBER_EPSILON) {
        return errorResponse('Insufficient available ' + lineUom + ' at ' + actualWarehouse + '/' + actualFloor + '/' + actualLocation + '.', 'CONFLICT', {
          details: {
            row: row,
            reason: 'insufficient_base_available',
            warehouse: actualWarehouse,
            floor: actualFloor,
            location: actualLocation,
            currentStock: currentStock,
            currentAvailable: availableBase,
            requestedQty: qty,
            unit: lineUom,
          },
        });
      }

      const consumeFromLoose = Math.min(looseQty, qty);
      const remainingFromPackets = normalizeNumberValue(Math.max(0, qty - consumeFromLoose));
      const consumedPackets = remainingFromPackets <= NUMBER_EPSILON
        ? 0
        : Math.ceil((remainingFromPackets - NUMBER_EPSILON) / qtyPerPacket);
      if (consumedPackets > currentStock) {
        return errorResponse('Insufficient packets available at row ' + row + '. Please refresh and retry.', 'CONFLICT', {
          details: {
            row: row,
            reason: 'insufficient_packets_for_base',
            warehouse: actualWarehouse,
            floor: actualFloor,
            location: actualLocation,
            currentStock: currentStock,
            requestedQty: qty,
            unit: lineUom,
          },
        });
      }

      const suppliedFromPackets = normalizeNumberValue(consumedPackets * qtyPerPacket);
      const packetResidue = normalizeNumberValue(Math.max(0, suppliedFromPackets - remainingFromPackets));
      const looseAfterConsume = normalizeNumberValue(Math.max(0, looseQty - consumeFromLoose));
      const newLoose = normalizeNumberValue(looseAfterConsume + packetResidue);

      updates.push({
        row: row,
        qty: qty,
        newStock: currentStock - consumedPackets,
        oldStock: currentStock,
        oldLoose: looseQty,
        newLoose: newLoose,
        warehouse: actualWarehouse,
        floor: actualFloor,
        location: actualLocation,
        version: computeRowVersion(rowData),
        mode: 'base',
        unit: lineUom,
        qtyPerPacket: qtyPerPacket,
        consumedPackets: consumedPackets,
      });
    }

    updates.forEach(function(u) {
      inventorySheet.getRange(u.row, COL_STOCK).setValue(u.newStock);
      if (u.mode === 'base') inventorySheet.getRange(u.row, COL_LOOSE).setValue(u.newLoose);
    });

    const now = new Date();
    const newFulfilled = normalizeNumberValue(line.fulfilledQty + fulfillQty);
    const newStatus = (newFulfilled + NUMBER_EPSILON >= line.requestedQty) ? 'COMPLETE' : 'PARTIAL';

    ordersSheet.getRange(line.sheetRow, 2).setValue(now);
    ordersSheet.getRange(line.sheetRow, 5).setValue(newStatus);
    ordersSheet.getRange(line.sheetRow, 11).setValue(newFulfilled);
    ordersSheet.getRange(line.sheetRow, 13).setValue(JSON.stringify(updates.map(function(u) {
      return {
        row: u.row,
        qty: u.qty,
        mode: u.mode,
        unit: u.unit || '',
        oldLoose: u.oldLoose,
        newLoose: u.newLoose,
        qtyPerPacket: u.qtyPerPacket || null,
        consumedPackets: u.consumedPackets || 0,
        warehouse: u.warehouse,
        floor: u.floor,
        location: u.location,
      };
    })));
    ordersSheet.getRange(line.sheetRow, 14).setValue(requestId);

    updates.forEach(function(u) {
      var changeText = (u.mode === 'base')
        ? ('-' + formatQuantityForText(u.qty) + ' ' + (u.unit || 'unit') + ' (' + u.consumedPackets + ' packet' + (u.consumedPackets === 1 ? '' : 's') + ' opened)')
        : ('-' + formatQuantityForText(u.qty));
      logAudit(ss, {
        action: 'ORDER_COMMITTED',
        actor: actor,
        requestId: requestId,
        status: 'SUCCESS',
        timestamp: now,
        warehouse: u.warehouse || '—',
        floor: u.floor || '—',
        location: u.location || '—',
        type: line.type || '—',
        size: line.size || '—',
        packet: line.packet || '—',
        oldValue: u.oldStock,
        newValue: u.newStock,
        change: changeText,
        notes: orderId + ' / ' + lineId + (u.mode === 'base' ? (' / loose ' + formatQuantityForText(u.oldLoose) + '→' + formatQuantityForText(u.newLoose) + ' ' + (u.unit || '')) : ''),
        sheetRow: u.row,
      });
    });

    return successResponse({
      orderId: orderId,
      lineId: lineId,
      fulfilledQty: newFulfilled,
      requestedQty: line.requestedQty,
      requestedMode: lineMode,
      requestedUom: lineUom,
      status: newStatus,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleCreateReceiptDraft(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const receiptId = String(body.receiptId || '').trim() || generateReceiptId();
  const normalized = normalizeReceiptLineInput(body.line || {}, body.receiptDate);
  if (normalized.error) return errorResponse(normalized.error, normalized.code || 'BAD_REQUEST');

  const line = normalized.value;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const receiptsSheet = ensureReceiptsSheet(ss);
  const now = new Date();
  const lineId = generateReceiptLineId();

  receiptsSheet.appendRow([
    now,
    now,
    '',
    receiptId,
    lineId,
    RECEIPT_STATUS_DRAFT,
    actor,
    line.type,
    line.size,
    line.packet,
    line.warehouse,
    line.floor,
    line.location,
    line.receivedQty,
    line.qtyPerUnit === null ? '' : line.qtyPerUnit,
    line.unit || '',
    line.looseQty || 0,
    line.notes || '',
    line.receiptDate,
    requestId,
    line.details || '',
  ]);

  logAudit(ss, {
    action: 'RECEIPT_DRAFTED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: line.warehouse || '—',
    floor: line.floor || '—',
    location: line.location || '—',
    type: line.type || '—',
    size: line.size || '—',
    packet: line.packet || '—',
    oldValue: '—',
    newValue: line.receivedQty,
    change: 'Inbound draft line created',
    notes: receiptId + ' / ' + lineId + ' / receiptDate ' + line.receiptDateIso,
    sheetRow: receiptsSheet.getLastRow(),
  });

  return successResponse({
    receiptId: receiptId,
    lineId: lineId,
    status: RECEIPT_STATUS_DRAFT,
    receiptDate: line.receiptDateIso,
  });
}

function handleListReceipts(body) {
  const includeClosed = body.includeClosed !== false;
  const actorFilter = String(body.actorFilter || '').trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const receiptsSheet = ensureReceiptsSheet(ss);
  if (receiptsSheet.getLastRow() < 2) return successResponse({ receipts: [] });

  const values = receiptsSheet.getRange(2, 1, receiptsSheet.getLastRow() - 1, RECEIPT_TOTAL_COLS).getValues();
  const out = [];
  for (var i = values.length - 1; i >= 0; i--) {
    const line = mapReceiptLineRow(values[i], i + 2);
    if (!includeClosed && line.status !== RECEIPT_STATUS_DRAFT) continue;
    if (actorFilter && line.actor !== actorFilter) continue;
    out.push(line);
  }
  return successResponse({ receipts: out });
}

function handleUpdateReceiptLine(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const receiptId = String(body.receiptId || '').trim();
  const lineId = String(body.lineId || '').trim();
  if (!receiptId || !lineId) return errorResponse('Receipt ID and line ID are required.', 'BAD_REQUEST');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const receiptsSheet = ensureReceiptsSheet(ss);
  const current = getReceiptLineById(receiptsSheet, receiptId, lineId);
  if (!current) return errorResponse('Receipt line not found.', 'NOT_FOUND');
  if (current.status !== RECEIPT_STATUS_DRAFT) {
    return errorResponse('Only draft receipt lines can be edited.', 'INVALID_STATE');
  }

  const lineInput = body.line && typeof body.line === 'object' ? body.line : {};
  const merged = {
    type: lineInput.type === undefined ? current.type : lineInput.type,
    size: lineInput.size === undefined ? current.size : lineInput.size,
    details: lineInput.details === undefined ? current.details : lineInput.details,
    packet: lineInput.packet === undefined ? current.packet : lineInput.packet,
    warehouse: lineInput.warehouse === undefined ? current.warehouse : lineInput.warehouse,
    floor: lineInput.floor === undefined ? current.floor : lineInput.floor,
    location: lineInput.location === undefined ? current.location : lineInput.location,
    receivedQty: lineInput.receivedQty === undefined ? current.receivedQty : lineInput.receivedQty,
    qtyPerUnit: lineInput.qtyPerUnit === undefined ? current.qtyPerUnit : lineInput.qtyPerUnit,
    unit: lineInput.unit === undefined ? current.unit : lineInput.unit,
    looseQty: lineInput.looseQty === undefined ? current.looseQty : lineInput.looseQty,
    notes: lineInput.notes === undefined ? current.notes : lineInput.notes,
    receiptDate: lineInput.receiptDate === undefined ? current.receiptDate : lineInput.receiptDate,
  };
  const normalized = normalizeReceiptLineInput(merged, body.receiptDate || current.receiptDate);
  if (normalized.error) return errorResponse(normalized.error, normalized.code || 'BAD_REQUEST');

  const line = normalized.value;
  const now = new Date();
  receiptsSheet.getRange(current.sheetRow, RC_UPDATED_AT).setValue(now);
  receiptsSheet.getRange(current.sheetRow, RC_TYPE).setValue(line.type);
  receiptsSheet.getRange(current.sheetRow, RC_SIZE).setValue(line.size);
  receiptsSheet.getRange(current.sheetRow, RC_PACKET).setValue(line.packet);
  receiptsSheet.getRange(current.sheetRow, RC_WAREHOUSE).setValue(line.warehouse);
  receiptsSheet.getRange(current.sheetRow, RC_FLOOR).setValue(line.floor);
  receiptsSheet.getRange(current.sheetRow, RC_LOCATION).setValue(line.location);
  receiptsSheet.getRange(current.sheetRow, RC_RECEIVED_QTY).setValue(line.receivedQty);
  receiptsSheet.getRange(current.sheetRow, RC_QTY_PER_UNIT).setValue(line.qtyPerUnit === null ? '' : line.qtyPerUnit);
  receiptsSheet.getRange(current.sheetRow, RC_UNIT).setValue(line.unit || '');
  receiptsSheet.getRange(current.sheetRow, RC_LOOSE_QTY).setValue(line.looseQty || 0);
  receiptsSheet.getRange(current.sheetRow, RC_NOTES).setValue(line.notes || '');
  receiptsSheet.getRange(current.sheetRow, RC_RECEIPT_DATE).setValue(line.receiptDate);
  receiptsSheet.getRange(current.sheetRow, RC_LAST_REQUEST_ID).setValue(requestId);
  receiptsSheet.getRange(current.sheetRow, RC_DETAILS).setValue(line.details || '');

  logAudit(ss, {
    action: 'RECEIPT_UPDATED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: line.warehouse || '—',
    floor: line.floor || '—',
    location: line.location || '—',
    type: line.type || '—',
    size: line.size || '—',
    packet: line.packet || '—',
    oldValue: current.receivedQty,
    newValue: line.receivedQty,
    change: 'Inbound draft line updated',
    notes: receiptId + ' / ' + lineId + ' / receiptDate ' + line.receiptDateIso,
    sheetRow: current.sheetRow,
  });

  return successResponse({
    receiptId: receiptId,
    lineId: lineId,
    status: RECEIPT_STATUS_DRAFT,
    receiptDate: line.receiptDateIso,
  });
}

function handleCancelReceiptLine(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const receiptId = String(body.receiptId || '').trim();
  const lineId = String(body.lineId || '').trim();
  if (!receiptId || !lineId) return errorResponse('Receipt ID and line ID are required.', 'BAD_REQUEST');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const receiptsSheet = ensureReceiptsSheet(ss);
  const current = getReceiptLineById(receiptsSheet, receiptId, lineId);
  if (!current) return errorResponse('Receipt line not found.', 'NOT_FOUND');
  if (current.status === RECEIPT_STATUS_POSTED) {
    return errorResponse('Posted receipt lines cannot be cancelled.', 'INVALID_STATE');
  }
  if (current.status === RECEIPT_STATUS_CANCELLED) {
    return successResponse({ status: RECEIPT_STATUS_CANCELLED });
  }

  const now = new Date();
  receiptsSheet.getRange(current.sheetRow, RC_UPDATED_AT).setValue(now);
  receiptsSheet.getRange(current.sheetRow, RC_STATUS).setValue(RECEIPT_STATUS_CANCELLED);
  receiptsSheet.getRange(current.sheetRow, RC_LAST_REQUEST_ID).setValue(requestId);

  logAudit(ss, {
    action: 'RECEIPT_CANCELLED',
    actor: actor,
    requestId: requestId,
    status: 'SUCCESS',
    timestamp: now,
    warehouse: current.warehouse || '—',
    floor: current.floor || '—',
    location: current.location || '—',
    type: current.type || '—',
    size: current.size || '—',
    packet: current.packet || '—',
    oldValue: current.status,
    newValue: RECEIPT_STATUS_CANCELLED,
    change: 'Inbound draft line cancelled',
    notes: receiptId + ' / ' + lineId,
    sheetRow: current.sheetRow,
  });

  return successResponse({ status: RECEIPT_STATUS_CANCELLED });
}

function handlePostReceipt(body) {
  const actor = getActorFromBody(body);
  const requestId = getRequestId(body);
  const receiptId = String(body.receiptId || '').trim();
  const lineId = String(body.lineId || '').trim();
  if (!receiptId || !lineId) return errorResponse('Receipt ID and line ID are required.', 'BAD_REQUEST');

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inventorySheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!inventorySheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');
    const receiptsSheet = ensureReceiptsSheet(ss);
    const current = getReceiptLineById(receiptsSheet, receiptId, lineId);
    if (!current) return errorResponse('Receipt line not found.', 'NOT_FOUND');
    if (current.status === RECEIPT_STATUS_POSTED) {
      return errorResponse('Receipt line is already posted.', 'ALREADY_POSTED');
    }
    if (current.status !== RECEIPT_STATUS_DRAFT) {
      return errorResponse('Only draft receipt lines can be posted.', 'INVALID_STATE');
    }

    const normalized = normalizeReceiptLineInput(current, current.receiptDate);
    if (normalized.error) return errorResponse(normalized.error, normalized.code || 'BAD_REQUEST');
    const line = normalized.value;

    const existing = findInventoryRowForReceipt(inventorySheet, line);
    let targetRow = null;
    let oldStock = 0;
    let newStock = line.receivedQty;
    let oldLooseQty = 0;
    let newLooseQty = line.looseQty || 0;

    if (existing) {
      targetRow = existing.row;
      const rowData = existing.rowData;
      oldStock = parseInt(rowData[COL_STOCK - 1], 10) || 0;
      newStock = oldStock + line.receivedQty;
      oldLooseQty = parseRowLooseQty(rowData);
      newLooseQty = normalizeNumberValue(oldLooseQty + (line.looseQty || 0));

      inventorySheet.getRange(targetRow, COL_STOCK).setValue(newStock);
      if (line.qtyPerUnit !== null && parseRowQtyPerPacket(rowData) === null) {
        inventorySheet.getRange(targetRow, COL_QTY).setValue(line.qtyPerUnit);
      }
      if (line.unit && !parseRowUnit(rowData)) {
        inventorySheet.getRange(targetRow, COL_UNIT).setValue(line.unit);
      }
      if ((line.looseQty || 0) > 0) {
        inventorySheet.getRange(targetRow, COL_LOOSE).setValue(newLooseQty);
      }
    } else {
      const newRow = [
        line.type,
        line.size,
        line.details || '',
        line.packet,
        line.warehouse,
        line.floor,
        line.receivedQty,
        line.location,
        line.notes || '',
        line.qtyPerUnit === null ? '' : line.qtyPerUnit,
        line.unit || '',
        line.looseQty || 0,
      ];
      inventorySheet.appendRow(newRow);
      targetRow = inventorySheet.getLastRow();
    }

    const now = new Date();
    receiptsSheet.getRange(current.sheetRow, RC_UPDATED_AT).setValue(now);
    receiptsSheet.getRange(current.sheetRow, RC_POSTED_AT).setValue(now);
    receiptsSheet.getRange(current.sheetRow, RC_STATUS).setValue(RECEIPT_STATUS_POSTED);
    receiptsSheet.getRange(current.sheetRow, RC_LAST_REQUEST_ID).setValue(requestId);

    logAudit(ss, {
      action: 'RECEIPT_POSTED',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: now,
      warehouse: line.warehouse || '—',
      floor: line.floor || '—',
      location: line.location || '—',
      type: line.type || '—',
      size: line.size || '—',
      packet: line.packet || '—',
      oldValue: oldStock,
      newValue: newStock,
      change: '+' + formatQuantityForText(line.receivedQty),
      notes: receiptId + ' / ' + lineId + ' / receiptDate ' + line.receiptDateIso + (line.looseQty ? (' / loose ' + formatQuantityForText(oldLooseQty) + '→' + formatQuantityForText(newLooseQty)) : ''),
      sheetRow: targetRow,
    });

    return successResponse({
      receiptId: receiptId,
      lineId: lineId,
      status: RECEIPT_STATUS_POSTED,
      row: targetRow,
      stock: newStock,
      receiptDate: line.receiptDateIso,
    });
  } finally {
    lock.releaseLock();
  }
}

// ── Audit log ──
function logAudit(ss, data) {
  try {
    let auditSheet = ss.getSheetByName(AUDIT_SHEET);
    if (!auditSheet) {
      auditSheet = ss.insertSheet(AUDIT_SHEET);
      const headers = ['Timestamp', 'Action', 'Actor', 'Request ID', 'Status', 'Warehouse', 'Floor', 'Location', 'Type', 'Size', 'Packet', 'Old Value', 'New Value', 'Change', 'Notes', 'Sheet Row'];
      auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      auditSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f0f0f0');
      auditSheet.setFrozenRows(1);
      auditSheet.setColumnWidth(1, 160); // timestamp
      auditSheet.setColumnWidth(2, 120); // action
      auditSheet.setColumnWidth(4, 220); // request id
    } else {
      const existing = auditSheet.getRange(1, 1, 1, Math.max(auditSheet.getLastColumn(), 16)).getValues()[0];
      if (String(existing[2] || '').trim() !== 'Actor') {
        const headers = ['Timestamp', 'Action', 'Actor', 'Request ID', 'Status', 'Warehouse', 'Floor', 'Location', 'Type', 'Size', 'Packet', 'Old Value', 'New Value', 'Change', 'Notes', 'Sheet Row'];
        auditSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }

    auditSheet.appendRow([
      data.timestamp,
      data.action,
      data.actor || 'web-user',
      data.requestId || '',
      data.status || 'SUCCESS',
      data.warehouse,
      data.floor,
      data.location,
      data.type,
      data.size,
      data.packet,
      data.oldValue,
      data.newValue,
      data.change,
      data.notes,
      data.sheetRow,
    ]);

    // Colour code the Change cell
    const lastRow = auditSheet.getLastRow();
    const changeCell = auditSheet.getRange(lastRow, 14);
    const changeStr = String(data.change);
    if (changeStr.startsWith('+')) changeCell.setFontColor('#006400');
    else if (changeStr.startsWith('-')) changeCell.setFontColor('#8b0000');
    else changeCell.setFontColor('#666666');

    // Colour code the Action cell
    const actionCell = auditSheet.getRange(lastRow, 2);
    const actionColours = {
      'STOCK_UPDATE': '#0a1a30',
      'QTY_UPDATE': '#0a2a18',
      'LOCATION_UPDATE': '#2a2400',
      'PLACEMENT_UPDATE': '#1f2f4f',
      'ROW_FIELDS_UPDATE': '#113a3a',
      'ROW_APPENDED': '#2a0a2a',
      'SPLIT_MOVE': '#173b5e',
      'LOOSE_UPDATED': '#2f2f10',
      'LOOSE_TRANSFERRED_OUT': '#3f1a1a',
      'LOOSE_TRANSFERRED_IN': '#0f3a22',
      'ORDER_CREATED': '#3a2b10',
      'ORDER_UPDATED': '#2c3557',
      'ORDER_CANCELLED': '#5a1a1a',
      'ORDER_COMMITTED': '#124227',
      'RECEIPT_DRAFTED': '#2b3d1f',
      'RECEIPT_UPDATED': '#1e3d53',
      'RECEIPT_CANCELLED': '#5a1a1a',
      'RECEIPT_POSTED': '#1b4f2f',
    };
    if (actionColours[data.action]) {
      actionCell.setBackground(actionColours[data.action]).setFontColor('#ffffff');
    }

  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// ── Authentication ──
function handleAuthenticate(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!username) {
    return errorResponse('Username is required.', 'BAD_REQUEST');
  }

  const userRecord = getUserRecord(username);
  if (!userRecord || !isUserActive(userRecord) || !verifyUserPassword(username, password, userRecord)) {
    return errorResponse('Invalid username or password.', 'AUTH_INVALID');
  }

  const token = generateToken();

  const actor = String(userRecord.displayName || userRecord.actor || username).trim() || username;
  const role = normalizeRole(userRecord.role);

  const sessionData = {
    username: username,
    actor: actor,
    role: role,
    authMode: 'user',
    issuedAt: new Date().toISOString(),
  };

  CacheService.getScriptCache().put(TOKEN_CACHE_PREFIX + token, JSON.stringify(sessionData), SESSION_TTL_SECONDS);
  return successResponse({
    token: token,
    expiresInSec: SESSION_TTL_SECONDS,
    actor: actor,
    role: role,
    authMode: sessionData.authMode,
  });
}

function handleUndo(body) {
  const requestId = getRequestId(body);
  const actor = getActorFromBody(body);
  const targetRequestId = String(body.targetRequestId || '').trim();
  const now = new Date();
  const windowMs = UNDO_WINDOW_MINUTES * 60 * 1000;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = ss.getSheetByName(AUDIT_SHEET);
  if (!auditSheet || auditSheet.getLastRow() < 2) {
    return errorResponse('No reversible actions found.', 'NOT_FOUND');
  }

  const target = targetRequestId
    ? findAuditEntryByRequestId(auditSheet, targetRequestId)
    : findLatestUndoCandidateForActor(auditSheet, actor);

  if (!target) {
    return errorResponse('No reversible actions found for undo.', 'NOT_FOUND');
  }
  if (target.actor !== actor) {
    return errorResponse('You can only undo your own actions.', 'FORBIDDEN');
  }
  if (!isUndoAction(target.action)) {
    return errorResponse('This action type is not undoable yet.', 'INVALID_STATE');
  }
  if (isAlreadyUndone(auditSheet, target.requestId)) {
    return errorResponse('This action has already been undone.', 'ALREADY_UNDONE');
  }

  const actionAt = parseAuditTimestamp(target.timestamp);
  if (!actionAt || now.getTime() - actionAt.getTime() > windowMs) {
    return errorResponse('Undo window expired. Actions can only be undone within ' + UNDO_WINDOW_MINUTES + ' minutes.', 'UNDO_WINDOW_EXPIRED');
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const inventorySheet = ss.getSheetByName(INVENTORY_SHEET);
    if (!inventorySheet) return errorResponse('Sheet not found: ' + INVENTORY_SHEET, 'NOT_FOUND');

    const undoResult = applyUndoForEntry(ss, inventorySheet, target);

    logAudit(ss, {
      action: 'UNDO',
      actor: actor,
      requestId: requestId,
      status: 'SUCCESS',
      timestamp: now,
      warehouse: undoResult.warehouse || target.warehouse || '—',
      floor: undoResult.floor || target.floor || '—',
      location: undoResult.location || target.location || '—',
      type: undoResult.type || target.type || '—',
      size: undoResult.size || target.size || '—',
      packet: undoResult.packet || target.packet || '—',
      oldValue: target.newValue || '—',
      newValue: target.oldValue || '—',
      change: 'UNDO ' + target.action,
      notes: 'Reverses ' + target.requestId,
      sheetRow: undoResult.sheetRow || target.sheetRow || '',
    });

    return successResponse({
      undoneRequestId: target.requestId,
      undoneAction: target.action,
      details: undoResult,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleListUndoCandidates(body) {
  const actor = getActorFromBody(body);
  const now = new Date();
  const windowMs = UNDO_WINDOW_MINUTES * 60 * 1000;
  const maxLimit = 30;
  const rawLimit = parseInt(body.limit, 10);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : 10;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const auditSheet = ss.getSheetByName(AUDIT_SHEET);
  if (!auditSheet || auditSheet.getLastRow() < 2) {
    return successResponse({ actions: [] });
  }

  const rows = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 16).getValues();
  const undoneRequestIds = {};
  for (var i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const action = String(row[1] || '').trim();
    if (action !== 'UNDO') continue;
    const notes = String(row[14] || '').trim();
    const match = /Reverses\s+(.+)/i.exec(notes);
    if (match && match[1]) {
      undoneRequestIds[String(match[1]).trim()] = true;
    }
  }

  const candidates = [];
  for (var j = rows.length - 1; j >= 0; j--) {
    if (candidates.length >= limit) break;
    const entry = mapAuditRow(rows[j]);
    if (entry.actor !== actor) continue;
    if (!isUndoAction(entry.action)) continue;
    if (undoneRequestIds[entry.requestId]) continue;

    const actionAt = parseAuditTimestamp(entry.timestamp);
    if (!actionAt) continue;
    const expiresAt = new Date(actionAt.getTime() + windowMs);
    if (now.getTime() > expiresAt.getTime()) continue;

    candidates.push({
      requestId: entry.requestId,
      action: entry.action,
      timestamp: actionAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      type: entry.type,
      size: entry.size,
      warehouse: entry.warehouse,
      floor: entry.floor,
      location: entry.location,
      change: entry.change,
      notes: entry.notes,
    });
  }

  return successResponse({
    actions: candidates,
    undoWindowMinutes: UNDO_WINDOW_MINUTES,
  });
}

function isUndoAction(action) {
  return action === 'ROW_FIELDS_UPDATE' ||
    action === 'SPLIT_MOVE' ||
    action === 'LOOSE_UPDATED' ||
    action === 'LOOSE_TRANSFERRED_OUT';
}

function findAuditEntryByRequestIdAndAction(auditSheet, requestId, action) {
  if (!requestId || !action) return null;
  const rows = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 16).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][3] || '').trim() !== requestId) continue;
    if (String(rows[i][1] || '').trim() !== action) continue;
    return mapAuditRow(rows[i]);
  }
  return null;
}

function findAuditEntryByRequestId(auditSheet, requestId) {
  if (!requestId) return null;
  const rows = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 16).getValues();
  var fallback = null;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][3] || '').trim() !== requestId) continue;
    const entry = mapAuditRow(rows[i]);
    if (isUndoAction(entry.action)) return entry;
    if (!fallback) fallback = entry;
  }
  return fallback;
}

function findLatestUndoCandidateForActor(auditSheet, actor) {
  const rows = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 16).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    const entry = mapAuditRow(rows[i]);
    if (entry.action === 'UNDO') continue;
    if (entry.actor !== actor) continue;
    if (!isUndoAction(entry.action)) continue;
    if (isAlreadyUndone(auditSheet, entry.requestId)) continue;
    return entry;
  }
  return null;
}

function isAlreadyUndone(auditSheet, requestId) {
  const rows = auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, 16).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    const action = String(rows[i][1] || '').trim();
    const notes = String(rows[i][14] || '').trim();
    if (action === 'UNDO' && notes.indexOf('Reverses ' + requestId) !== -1) {
      return true;
    }
  }
  return false;
}

function mapAuditRow(row) {
  return {
    timestamp: row[0],
    action: String(row[1] || '').trim(),
    actor: String(row[2] || '').trim(),
    requestId: String(row[3] || '').trim(),
    status: String(row[4] || '').trim(),
    warehouse: String(row[5] || '').trim(),
    floor: String(row[6] || '').trim(),
    location: String(row[7] || '').trim(),
    type: String(row[8] || '').trim(),
    size: String(row[9] || '').trim(),
    packet: String(row[10] || '').trim(),
    oldValue: row[11],
    newValue: row[12],
    change: String(row[13] || '').trim(),
    notes: String(row[14] || '').trim(),
    sheetRow: parseInt(row[15], 10),
  };
}

function parseAuditTimestamp(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  var dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

function applyUndoForEntry(ss, inventorySheet, entry) {
  if (entry.action === 'ROW_FIELDS_UPDATE') {
    return undoRowFieldsUpdate(inventorySheet, entry);
  }
  if (entry.action === 'SPLIT_MOVE') {
    return undoSplitMove(inventorySheet, entry);
  }
  if (entry.action === 'LOOSE_UPDATED') {
    return undoLooseUpdated(inventorySheet, entry);
  }
  if (entry.action === 'LOOSE_TRANSFERRED_OUT') {
    return undoLooseTransferOut(ss, inventorySheet, entry);
  }
  throw new Error('Unsupported undo action: ' + entry.action);
}

function parseAuditNumericValue(value) {
  const num = parseFloat(value);
  if (!isFinite(num)) return null;
  return normalizeNumberValue(num);
}

function undoRowFieldsUpdate(inventorySheet, entry) {
  const rowNum = entry.sheetRow;
  if (!Number.isInteger(rowNum) || !isValidInventoryRow(inventorySheet, rowNum)) {
    throw new Error('Cannot undo: target row not found.');
  }

  const snapshot = parseFieldSummary(entry.oldValue);
  const changed = String(entry.change || '').split(',').map(function(v) { return String(v || '').trim(); }).filter(Boolean);

  changed.forEach(function(field) {
    if (field === 'stock' && snapshot.stock !== null) {
      inventorySheet.getRange(rowNum, COL_STOCK).setValue(snapshot.stock);
    }
    if (field === 'qty') {
      if (snapshot.qty === null) inventorySheet.getRange(rowNum, COL_QTY).clearContent();
      else inventorySheet.getRange(rowNum, COL_QTY).setValue(snapshot.qty);
    }
    if (field === 'unit') {
      inventorySheet.getRange(rowNum, COL_UNIT).setValue(snapshot.unit || '');
    }
    if (field === 'warehouse') {
      inventorySheet.getRange(rowNum, COL_WAREHOUSE).setValue(snapshot.warehouse || '');
    }
    if (field === 'floor') {
      inventorySheet.getRange(rowNum, COL_FLOOR).setValue(snapshot.floor || '');
    }
    if (field === 'location') {
      inventorySheet.getRange(rowNum, COL_LOCATION).setValue(snapshot.location || '');
    }
  });

  const rowData = readRow(inventorySheet, rowNum);
  return {
    mode: 'row-fields',
    row: rowNum,
    currentVersion: computeRowVersion(rowData),
    warehouse: String(rowData[COL_WAREHOUSE - 1] || '').trim(),
    floor: String(rowData[COL_FLOOR - 1] || '').trim(),
    location: String(rowData[COL_LOCATION - 1] || '').trim(),
    type: String(rowData[COL_TYPE - 1] || '').trim(),
    size: String(rowData[COL_SIZE - 1] || '').trim(),
    packet: String(rowData[COL_PACKET - 1] || '').trim(),
    sheetRow: rowNum,
  };
}

function undoSplitMove(inventorySheet, entry) {
  if (String(entry.change || '').indexOf('Relocation ') === 0) {
    const rowNum = entry.sheetRow;
    if (!Number.isInteger(rowNum) || !isValidInventoryRow(inventorySheet, rowNum)) {
      throw new Error('Cannot undo relocation: row not found.');
    }
    const oldLoc = String(entry.oldValue || '').trim();
    inventorySheet.getRange(rowNum, COL_LOCATION).setValue(oldLoc);
    const rowData = readRow(inventorySheet, rowNum);
    return {
      mode: 'split-relocation',
      row: rowNum,
      currentVersion: computeRowVersion(rowData),
      warehouse: String(rowData[COL_WAREHOUSE - 1] || '').trim(),
      floor: String(rowData[COL_FLOOR - 1] || '').trim(),
      location: String(rowData[COL_LOCATION - 1] || '').trim(),
      type: String(rowData[COL_TYPE - 1] || '').trim(),
      size: String(rowData[COL_SIZE - 1] || '').trim(),
      packet: String(rowData[COL_PACKET - 1] || '').trim(),
      sheetRow: rowNum,
    };
  }

  const sourceMatch = /from row\s+(\d+)/i.exec(String(entry.notes || ''));
  const splitMatch = /^(\d+)\s*\+\s*(\d+)$/.exec(String(entry.newValue || '').trim());
  const oldTotal = parseInt(entry.oldValue, 10);
  const sourceRow = sourceMatch ? parseInt(sourceMatch[1], 10) : NaN;
  const newRow = entry.sheetRow;

  if (!Number.isInteger(oldTotal) || !Number.isInteger(sourceRow) || !Number.isInteger(newRow) || !splitMatch) {
    throw new Error('Cannot undo split: audit metadata incomplete.');
  }

  const keepStock = parseInt(splitMatch[1], 10);
  const moveStock = parseInt(splitMatch[2], 10);

  if (!isValidInventoryRow(inventorySheet, sourceRow) || !isValidInventoryRow(inventorySheet, newRow)) {
    throw new Error('Cannot undo split: source or split row missing.');
  }

  const sourceStockNow = parseInt(inventorySheet.getRange(sourceRow, COL_STOCK).getValue(), 10) || 0;
  const movedStockNow = parseInt(inventorySheet.getRange(newRow, COL_STOCK).getValue(), 10) || 0;
  if (sourceStockNow !== keepStock || movedStockNow !== moveStock) {
    throw new Error('Cannot undo split: stock changed since original action.');
  }

  inventorySheet.getRange(sourceRow, COL_STOCK).setValue(oldTotal);
  inventorySheet.deleteRow(newRow);
  const sourceData = readRow(inventorySheet, sourceRow);
  return {
    mode: 'split-split',
    row: sourceRow,
    deletedRow: newRow,
    currentVersion: computeRowVersion(sourceData),
    warehouse: String(sourceData[COL_WAREHOUSE - 1] || '').trim(),
    floor: String(sourceData[COL_FLOOR - 1] || '').trim(),
    location: String(sourceData[COL_LOCATION - 1] || '').trim(),
    type: String(sourceData[COL_TYPE - 1] || '').trim(),
    size: String(sourceData[COL_SIZE - 1] || '').trim(),
    packet: String(sourceData[COL_PACKET - 1] || '').trim(),
    sheetRow: sourceRow,
  };
}

function undoLooseUpdated(inventorySheet, entry) {
  const rowNum = entry.sheetRow;
  if (!Number.isInteger(rowNum) || !isValidInventoryRow(inventorySheet, rowNum)) {
    throw new Error('Cannot undo loose update: row not found.');
  }

  const rowData = readRow(inventorySheet, rowNum);
  if (!hasBaseMetadata(rowData)) {
    throw new Error('Cannot undo loose update: row metadata is invalid.');
  }

  const targetLooseQty = parseAuditNumericValue(entry.oldValue);
  const expectedCurrentLooseQty = parseAuditNumericValue(entry.newValue);
  if (targetLooseQty === null || expectedCurrentLooseQty === null) {
    throw new Error('Cannot undo loose update: audit values are invalid.');
  }

  const unit = parseRowUnit(rowData);
  if (!isValidLooseQtyForUnit(targetLooseQty, unit)) {
    throw new Error('Cannot undo loose update: old loose qty is invalid for row unit.');
  }

  const currentLooseQty = parseRowLooseQty(rowData);
  if (!numbersNearlyEqual(currentLooseQty, expectedCurrentLooseQty)) {
    throw new Error('Cannot undo loose update: loose qty changed since original action.');
  }

  inventorySheet.getRange(rowNum, COL_LOOSE).setValue(targetLooseQty);
  const rowDataAfter = readRow(inventorySheet, rowNum);
  return {
    mode: 'loose-updated',
    row: rowNum,
    looseQty: targetLooseQty,
    currentVersion: computeRowVersion(rowDataAfter),
    warehouse: String(rowDataAfter[COL_WAREHOUSE - 1] || '').trim(),
    floor: String(rowDataAfter[COL_FLOOR - 1] || '').trim(),
    location: String(rowDataAfter[COL_LOCATION - 1] || '').trim(),
    type: String(rowDataAfter[COL_TYPE - 1] || '').trim(),
    size: String(rowDataAfter[COL_SIZE - 1] || '').trim(),
    packet: String(rowDataAfter[COL_PACKET - 1] || '').trim(),
    sheetRow: rowNum,
  };
}

function undoLooseTransferOut(ss, inventorySheet, entry) {
  const sourceRow = entry.sheetRow;
  if (!Number.isInteger(sourceRow) || !isValidInventoryRow(inventorySheet, sourceRow)) {
    throw new Error('Cannot undo loose transfer: source row not found.');
  }

  const auditSheet = ss.getSheetByName(AUDIT_SHEET);
  if (!auditSheet || auditSheet.getLastRow() < 2) {
    throw new Error('Cannot undo loose transfer: audit sheet unavailable.');
  }
  const inEntry = findAuditEntryByRequestIdAndAction(auditSheet, entry.requestId, 'LOOSE_TRANSFERRED_IN');
  if (!inEntry || !Number.isInteger(inEntry.sheetRow)) {
    throw new Error('Cannot undo loose transfer: matching destination audit entry not found.');
  }

  const destinationRow = inEntry.sheetRow;
  if (!isValidInventoryRow(inventorySheet, destinationRow)) {
    throw new Error('Cannot undo loose transfer: destination row not found.');
  }

  const sourceOld = parseAuditNumericValue(entry.oldValue);
  const sourceNew = parseAuditNumericValue(entry.newValue);
  const destinationOld = parseAuditNumericValue(inEntry.oldValue);
  const destinationNew = parseAuditNumericValue(inEntry.newValue);
  const destinationWasCreated = String(inEntry.notes || '').indexOf('destination-created') !== -1;
  if (sourceOld === null || sourceNew === null || destinationOld === null || destinationNew === null) {
    throw new Error('Cannot undo loose transfer: audit values are invalid.');
  }

  const sourceRowData = readRow(inventorySheet, sourceRow);
  const destinationRowData = readRow(inventorySheet, destinationRow);
  const sourceUnit = parseRowUnit(sourceRowData);
  const destinationUnit = parseRowUnit(destinationRowData);
  if (sourceUnit !== destinationUnit) {
    throw new Error('Cannot undo loose transfer: source/destination unit mismatch.');
  }
  if (!isValidLooseQtyForUnit(sourceOld, sourceUnit) || !isValidLooseQtyForUnit(destinationOld, destinationUnit)) {
    throw new Error('Cannot undo loose transfer: old loose qty is invalid for row unit.');
  }

  const sourceCurrent = parseRowLooseQty(sourceRowData);
  const destinationCurrent = parseRowLooseQty(destinationRowData);
  if (!numbersNearlyEqual(sourceCurrent, sourceNew) || !numbersNearlyEqual(destinationCurrent, destinationNew)) {
    throw new Error('Cannot undo loose transfer: loose qty changed since original action.');
  }

  if (destinationWasCreated) {
    const destinationStock = parseInt(destinationRowData[COL_STOCK - 1], 10) || 0;
    if (destinationStock !== 0 || !numbersNearlyEqual(destinationOld, 0)) {
      throw new Error('Cannot undo loose transfer: destination row no longer matches created-row state.');
    }
  }

  inventorySheet.getRange(sourceRow, COL_LOOSE).setValue(sourceOld);
  var sourceRowAfter = sourceRow;
  var destinationAfterVersion = null;
  if (destinationWasCreated) {
    inventorySheet.deleteRow(destinationRow);
    if (sourceRow > destinationRow) sourceRowAfter = sourceRow - 1;
  } else {
    inventorySheet.getRange(destinationRow, COL_LOOSE).setValue(destinationOld);
    destinationAfterVersion = computeRowVersion(readRow(inventorySheet, destinationRow));
  }

  const sourceAfter = readRow(inventorySheet, sourceRowAfter);
  return {
    mode: 'loose-transfer',
    sourceRow: sourceRowAfter,
    destinationRow: destinationRow,
    sourceLooseQty: sourceOld,
    destinationLooseQty: destinationOld,
    sourceCurrentVersion: computeRowVersion(sourceAfter),
    destinationCurrentVersion: destinationAfterVersion,
    destinationDeleted: destinationWasCreated,
    warehouse: String(sourceAfter[COL_WAREHOUSE - 1] || '').trim(),
    floor: String(sourceAfter[COL_FLOOR - 1] || '').trim(),
    location: String(sourceAfter[COL_LOCATION - 1] || '').trim(),
    type: String(sourceAfter[COL_TYPE - 1] || '').trim(),
    size: String(sourceAfter[COL_SIZE - 1] || '').trim(),
    packet: String(sourceAfter[COL_PACKET - 1] || '').trim(),
    sheetRow: sourceRowAfter,
  };
}

function parseFieldSummary(raw) {
  const summary = {
    stock: null,
    qty: null,
    unit: null,
    warehouse: null,
    floor: null,
    location: null,
  };

  const text = String(raw || '').trim();
  if (!text) return summary;
  text.split('|').forEach(function(part) {
    const item = String(part || '').trim();
    const idx = item.indexOf('=');
    if (idx <= 0) return;
    const key = item.slice(0, idx).trim();
    const val = item.slice(idx + 1).trim();
    if (!Object.prototype.hasOwnProperty.call(summary, key)) return;
    if (val === '—' || val === '') {
      summary[key] = null;
      return;
    }
    if (key === 'stock') {
      const n = parseInt(val, 10);
      summary[key] = isNaN(n) ? null : n;
      return;
    }
    if (key === 'qty') {
      const q = parseFloat(val);
      summary[key] = isNaN(q) ? null : q;
      return;
    }
    summary[key] = val;
  });

  return summary;
}

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function requireValidSession(body) {
  const token = String(body.token || '').trim();
  if (!token) return errorResponse('Missing session token.', 'AUTH_REQUIRED');
  const rawSession = CacheService.getScriptCache().get(TOKEN_CACHE_PREFIX + token);
  if (!rawSession) return errorResponse('Session expired. Please login again.', 'AUTH_REQUIRED');

  // Sliding expiration: refresh token TTL on use.
  CacheService.getScriptCache().put(TOKEN_CACHE_PREFIX + token, rawSession, SESSION_TTL_SECONDS);
  return null;
}

function isValidInventoryRow(sheet, row) {
  return Number.isInteger(row) && row > 1 && row <= sheet.getLastRow();
}

function validateAppendRowData(d) {
  const type = String(d.type || '').trim();
  const size = String(d.size || '').trim();
  const warehouse = String(d.warehouse || '').trim();
  const floor = String(d.floor || '').trim();
  const location = String(d.location || '').trim();
  const unit = String(d.unit || '').trim().toLowerCase();
  const stock = parseInt(d.stock);
  const qty = d.qtyPerUnit !== undefined && d.qtyPerUnit !== null && d.qtyPerUnit !== ''
    ? parseFloat(d.qtyPerUnit)
    : null;
  const looseQty = d.looseQty !== undefined && d.looseQty !== null && d.looseQty !== ''
    ? parseFloat(d.looseQty)
    : 0;

  if (!type) return 'Type is required.';
  if (!size) return 'Size is required.';
  if (!warehouse) return 'Warehouse is required.';
  if (!floor) return 'Floor is required.';
  if (!location) return 'Location is required.';

  if (ALLOWED_WAREHOUSES.indexOf(warehouse) === -1) {
    return 'Invalid warehouse. Allowed: ' + ALLOWED_WAREHOUSES.join(', ');
  }
  if (ALLOWED_FLOORS.indexOf(floor) === -1) {
    return 'Invalid floor. Allowed: ' + ALLOWED_FLOORS.join(', ');
  }
  if (d.packetType && ALLOWED_PACKETS.indexOf(String(d.packetType).trim()) === -1) {
    return 'Invalid packet type.';
  }

  if (isNaN(stock) || stock < 0) return 'Stock must be a non-negative integer.';
  if (qty !== null && (isNaN(qty) || qty < 0)) return 'Qty per unit must be a non-negative number.';
  if (unit && ['kg', 'pcs'].indexOf(unit) === -1) return 'Unit must be kg or pcs.';
  if (!isFinite(looseQty) || looseQty < 0) return 'Loose qty must be a non-negative number.';
  if (unit === 'pcs' && !numbersNearlyEqual(looseQty, Math.round(looseQty))) return 'Loose qty must be a whole number for pcs rows.';

  return null;
}

function computeRowVersion(rowData) {
  const normalized = rowData.map(function(v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
    return String(v).trim();
  }).join('\u001f');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized);
  return digest.map(function(b) {
    const n = (b < 0) ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function checkExpectedVersion(rowData, expectedVersion) {
  const expected = String(expectedVersion || '').trim();
  if (!expected) return null;
  const current = computeRowVersion(rowData);
  if (expected === current) return null;
  return errorResponse('Conflict: row changed by another user. Please refresh and retry.', 'CONFLICT', {
    currentVersion: current,
  });
}

function getRequestId(body) {
  const id = String(body.requestId || '').trim();
  if (id) return id;
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function getActorFromBody(body) {
  const session = getSessionContext(body);
  if (session && session.actor) return String(session.actor).trim() || 'web-user';
  const actor = String(body.actor || '').trim();
  return actor || 'web-user';
}

function normalizeRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_DEFINITIONS[key] ? key : 'operator';
}

function getRoleAssignments() {
  const merged = {};
  Object.keys(ROLE_ASSIGNMENTS).forEach(function(actor) {
    merged[String(actor || '').trim()] = normalizeRole(ROLE_ASSIGNMENTS[actor]);
  });

  try {
    const raw = PropertiesService.getScriptProperties().getProperty('ROLE_ASSIGNMENTS_JSON');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function(actor) {
          merged[String(actor || '').trim()] = normalizeRole(parsed[actor]);
        });
      }
    }
  } catch (e) {
    console.warn('ROLE_ASSIGNMENTS_JSON parse failed: ' + e.message);
  }

  return merged;
}

function getUserRecord(username) {
  const key = String(username || '').trim().toLowerCase();
  if (!key) return null;
  const users = getUsersMap();
  return users[key] || null;
}

function getUsersMap() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(USERS_PROPERTY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    Object.keys(parsed).forEach(function(username) {
      const normalized = String(username || '').trim().toLowerCase();
      if (!normalized) return;
      const user = parsed[username] || {};
      out[normalized] = {
        role: normalizeRole(user.role),
        active: user.active !== false,
        displayName: String(user.displayName || user.actor || normalized).trim(),
        salt: String(user.salt || '').trim(),
        passwordHash: String(user.passwordHash || '').trim().toLowerCase(),
        password: String(user.password || ''),
      };
    });
    return out;
  } catch (e) {
    console.warn('USERS_JSON parse failed: ' + e.message);
    return {};
  }
}

function isUserActive(userRecord) {
  return !!(userRecord && userRecord.active !== false);
}

function verifyUserPassword(username, password, userRecord) {
  if (!userRecord) return false;

  if (userRecord.passwordHash && userRecord.salt) {
    const computed = sha256Hex(String(username).toLowerCase() + ':' + userRecord.salt + ':' + String(password || ''));
    return computed === String(userRecord.passwordHash || '').toLowerCase();
  }

  // Migration fallback: allow plain password records from USERS_JSON while transitioning to hashes.
  if (userRecord.password) {
    return String(userRecord.password) === String(password || '');
  }

  return false;
}

function sha256Hex(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return digest.map(function(b) {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

function getSessionContext(body) {
  const token = String((body && body.token) || '').trim();
  if (!token) return null;
  const rawSession = CacheService.getScriptCache().get(TOKEN_CACHE_PREFIX + token);
  if (!rawSession) return null;

  try {
    const parsed = JSON.parse(rawSession);
    if (parsed && typeof parsed === 'object') {
      return {
        username: String(parsed.username || '').trim().toLowerCase(),
        actor: String(parsed.actor || '').trim() || 'web-user',
        role: normalizeRole(parsed.role || 'operator'),
        authMode: String(parsed.authMode || '').trim() || 'user',
      };
    }
  } catch (e) {
    // Backward compatibility for legacy token values.
  }

  return {
    username: '',
    actor: 'web-user',
    role: 'operator',
    authMode: 'legacy',
  };
}

function getRoleContext(body) {
  const session = getSessionContext(body);
  if (session) {
    return {
      actor: session.actor,
      role: session.role,
      permissions: ROLE_DEFINITIONS[session.role],
      authMode: session.authMode,
      username: session.username,
    };
  }

  const actor = getActorFromBody(body);
  const assignments = getRoleAssignments();
  const role = normalizeRole(assignments[actor] || 'operator');
  return {
    actor: actor,
    role: role,
    permissions: ROLE_DEFINITIONS[role],
    authMode: 'legacy',
    username: '',
  };
}

function requirePermission(body, permissionKey) {
  const roleContext = getRoleContext(body);
  if (roleContext.permissions && roleContext.permissions[permissionKey]) return null;
  return errorResponse('Permission denied for role: ' + roleContext.role, 'FORBIDDEN', {
    role: roleContext.role,
    requiredPermission: permissionKey,
  });
}

function errorResponse(message, code, extras) {
  const payload = {
    success: false,
    error: String(message || 'Unexpected server error.'),
    code: String(code || 'ERROR'),
  };

  if (extras && typeof extras === 'object') {
    Object.keys(extras).forEach(function(key) {
      payload[key] = extras[key];
    });
  }

  return jsonResponse(payload);
}

function successResponse(payload) {
  const out = { success: true };
  if (payload && typeof payload === 'object') {
    Object.keys(payload).forEach(function(key) {
      out[key] = payload[key];
    });
  }
  return jsonResponse(out);
}

// ── Helper ──
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
