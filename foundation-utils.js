// Shared pure helpers extracted from app.js during foundation refactor.

function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function packetIcon(pt) {
  if (pt === 'Box') return '📦';
  if (pt === 'Jute Bag') return '🧺';
  if (pt === 'Packet') return '🛍';
  return '📦';
}

function packetUnitLabel(pt) {
  if (pt === 'Box') return 'boxes';
  if (pt === 'Jute Bag') return 'bags';
  if (pt === 'Packet') return 'packets';
  return 'units';
}

function computeQtyTotals(rows) {
  const totals = {};
  rows.forEach(r => {
    if (!r.unit || r.qtyPerUnit === null) return;
    const loose = parseNullableNumber(r.looseQty) || 0;
    const val = (r.stock * r.qtyPerUnit) + loose;
    totals[r.unit] = (totals[r.unit] || 0) + val;
  });
  return totals;
}

function fmtQtyTotals(totals) {
  const parts = [];
  if (totals.pcs) parts.push(`${totals.pcs.toLocaleString()} pcs`);
  if (totals.kg) parts.push(`${totals.kg.toLocaleString()} kg`);
  return parts.join(' + ');
}

function fmtRowQty(r) {
  if (!r.unit || r.qtyPerUnit === null) return null;
  const total = r.stock * r.qtyPerUnit;
  const unitLabel = packetUnitLabel(r.packetType).replace(/s$/, '');
  return `${r.qtyPerUnit.toLocaleString()} ${r.unit}/${unitLabel} × ${r.stock} = ${total.toLocaleString()} ${r.unit}`;
}

function normalizeOrderNumber(value) {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000000) / 1000000;
}

function formatOrderNumber(value) {
  const num = normalizeOrderNumber(value);
  const eps = typeof ORDER_NUMBER_EPS === 'number' ? ORDER_NUMBER_EPS : 1e-6;
  if (Math.abs(num - Math.round(num)) <= eps) return String(Math.round(num));
  return String(num);
}

function parseNullableNumber(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '') return null;
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : null;
}

function normalizeDetailVariant(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getGroupDetailVariants(group) {
  if (group && Array.isArray(group.detailVariants) && group.detailVariants.length) return group.detailVariants;
  return Array.from((group && group.allDetails) || []).filter(Boolean);
}

function stockClass(s) {
  const lowStockThreshold = (typeof CONFIG !== 'undefined' && CONFIG && Number.isFinite(CONFIG.LOW_STOCK_THRESHOLD))
    ? CONFIG.LOW_STOCK_THRESHOLD
    : 5;
  if (s === 0) return 'out';
  if (s <= lowStockThreshold) return 'low';
  return 'good';
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return ts;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeRequestedMode(value) {
  const mode = String(value || '').trim().toUpperCase();
  return mode === 'BASE' ? 'BASE' : 'UNIT';
}

function normalizeRequestedUom(value, mode = 'UNIT') {
  const normalizedMode = normalizeRequestedMode(mode);
  if (normalizedMode === 'UNIT') return 'unit';
  const uom = String(value || '').trim().toLowerCase();
  if (uom === 'pcs' || uom === 'kg') return uom;
  return null;
}

function isWholeOrderNumber(value) {
  const num = normalizeOrderNumber(value);
  const eps = typeof ORDER_NUMBER_EPS === 'number' ? ORDER_NUMBER_EPS : 1e-6;
  return Math.abs(num - Math.round(num)) <= eps;
}

function getGroupBaseUom(group) {
  if (!group || !Array.isArray(group.locations)) return null;
  const units = new Set();
  group.locations.forEach(r => {
    const unit = String(r && r.unit || '').trim().toLowerCase();
    const qty = normalizeOrderNumber(r && r.qtyPerUnit);
    const eps = typeof ORDER_NUMBER_EPS === 'number' ? ORDER_NUMBER_EPS : 1e-6;
    if ((unit === 'pcs' || unit === 'kg') && qty > eps) units.add(unit);
  });
  if (units.size !== 1) return null;
  return Array.from(units)[0];
}

function resolveLineModeContext(line, group) {
  const requestedMode = normalizeRequestedMode(line && line.requestedMode);
  const baseUom = getGroupBaseUom(group);
  let requestedUom = normalizeRequestedUom(line && line.requestedUom, requestedMode);
  if (requestedMode === 'BASE' && !requestedUom) requestedUom = baseUom;
  if (requestedMode === 'UNIT') requestedUom = 'unit';
  const supportsBase = !!(baseUom || requestedUom === 'pcs' || requestedUom === 'kg');
  const numericMode = (requestedMode === 'BASE' && requestedUom === 'kg') ? 'decimal' : 'integer';
  const step = numericMode === 'decimal' ? '0.1' : '1';
  const min = numericMode === 'decimal' ? '0.1' : '1';
  const modeLabel = requestedMode === 'BASE' ? `BASE (${requestedUom || 'n/a'})` : 'UNIT';
  return { requestedMode, requestedUom, supportsBase, baseUom, numericMode, step, min, modeLabel };
}

function getRowAllocationMeta(row, modeCtx) {
  const qtyPerUnit = normalizeOrderNumber(row && row.qtyPerUnit);
  const unit = String(row && row.unit || '').trim().toLowerCase();
  const looseQty = Math.max(0, normalizeOrderNumber(row && row.looseQty));
  const stock = Math.max(0, parseInt(row && row.stock, 10) || 0);

  if (modeCtx && modeCtx.requestedMode === 'BASE') {
    const requestedUom = String(modeCtx.requestedUom || '').trim().toLowerCase();
    const eps = typeof ORDER_NUMBER_EPS === 'number' ? ORDER_NUMBER_EPS : 1e-6;
    const supportsRow = requestedUom && (unit === requestedUom) && qtyPerUnit > eps;
    const available = supportsRow
      ? normalizeOrderNumber(stock * qtyPerUnit + looseQty)
      : 0;
    const label = supportsRow
      ? `${formatOrderNumber(available)} ${requestedUom}`
      : `0 ${requestedUom || 'unit'}`;
    return { isUnitBased: true, unit, qtyPerUnit, available, step: modeCtx.step, label };
  }

  const available = normalizeOrderNumber(stock);
  return { isUnitBased: false, unit, qtyPerUnit, available, step: '1', label: formatOrderNumber(available) };
}

function computeAutoAllocation(locations, target, modeCtx) {
  const sorted = (locations || []).slice().sort((a, b) => getRowAllocationMeta(b, modeCtx).available - getRowAllocationMeta(a, modeCtx).available);
  const values = {};
  let remaining = Math.max(0, normalizeOrderNumber(target));
  const eps = typeof ORDER_NUMBER_EPS === 'number' ? ORDER_NUMBER_EPS : 1e-6;

  sorted.forEach(row => {
    if (remaining <= eps) return;
    const meta = getRowAllocationMeta(row, modeCtx);
    const max = Math.max(0, normalizeOrderNumber(meta.available));
    if (max <= eps) return;
    let take = Math.min(max, remaining);
    if (modeCtx && modeCtx.numericMode !== 'decimal') take = Math.floor(take);
    take = normalizeOrderNumber(take);
    if (take <= eps) return;
    values[row.rowNum] = take;
    remaining = normalizeOrderNumber(remaining - take);
  });

  return { values, remaining: Math.max(0, normalizeOrderNumber(remaining)) };
}
