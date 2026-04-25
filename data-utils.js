// Inventory data transformation helpers extracted from app.js.

const colToIdx = l => l.toUpperCase().charCodeAt(0) - 65;

function parseRows(rows, rowVersions = {}) {
  if (!rows || rows.length < 2) return [];

  const ti = colToIdx(CONFIG.COL_TYPE);
  const si = colToIdx(CONFIG.COL_SIZE);
  const di = colToIdx(CONFIG.COL_DETAILS);
  const pi = colToIdx(CONFIG.COL_PACKET);
  const wi = colToIdx(CONFIG.COL_WAREHOUSE);
  const fi = colToIdx(CONFIG.COL_FLOOR);
  const sti = colToIdx(CONFIG.COL_STOCK);
  const li = colToIdx(CONFIG.COL_LOCATION);
  const ni = colToIdx(CONFIG.COL_NOTES);
  const qi = colToIdx(CONFIG.COL_QTY);
  const ui = colToIdx(CONFIG.COL_UNIT);
  const loi = colToIdx(CONFIG.COL_LOOSE);

  return rows.slice(CONFIG.HEADER_ROW).map((r, i) => {
    const rowNum = i + CONFIG.HEADER_ROW + 1;
    return {
      rowNum: rowNum,
      version: rowVersions[String(rowNum)] || '',
      type: (r[ti] || '').trim(),
      size: (r[si] || '').trim(),
      details: (r[di] || '').trim(),
      packetType: (r[pi] || '').trim(),
      warehouse: (r[wi] || '').trim(),
      floor: (r[fi] || '').trim(),
      stock: Math.max(0, parseInt(r[sti] || '0', 10) || 0),
      location: (r[li] || '').trim(),
      notes: (r[ni] || '').trim(),
      qtyPerUnit: parseNullableNumber(r[qi]),
      unit: (r[ui] || '').trim().toLowerCase() || null,
      looseQty: parseNullableNumber(r[loi]) || 0,
    };
  }).filter(r => r.type || r.size);
}

function groupRows(rows) {
  const map = new Map();

  rows.forEach(r => {
    const key = `${r.type}||${r.size}||${r.packetType}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        type: r.type,
        size: r.size,
        packetType: r.packetType,
        totalStock: 0,
        locations: [],
        hasNotes: false,
        warehouses: new Set(),
        allDetails: new Set(),
        detailVariantMap: new Map(),
        detailVariants: [],
      });
    }

    const g = map.get(key);
    g.totalStock += r.stock;
    g.locations.push(r);
    if (r.notes) g.hasNotes = true;
    if (r.warehouse) g.warehouses.add(r.warehouse);
    if (r.details) {
      const detail = String(r.details).trim();
      const normalized = normalizeDetailVariant(detail);
      if (normalized && !g.detailVariantMap.has(normalized)) {
        g.detailVariantMap.set(normalized, detail);
      }
    }
  });

  return Array.from(map.values()).map(g => {
    g.detailVariants = Array.from(g.detailVariantMap.values());
    g.allDetails = new Set(g.detailVariants);
    return g;
  });
}

function findLiveLocationsForLine(rows, line, eps = 1e-6) {
  if (!Array.isArray(rows) || !line) return [];
  return rows.filter(r =>
    r.type === line.type &&
    r.size === line.size &&
    r.packetType === line.packet &&
    ((r.stock || 0) > 0 || normalizeOrderNumber(r.looseQty) > eps)
  );
}

function findDraftLineForGroup(lines, group) {
  if (!Array.isArray(lines) || !group) return null;
  return lines.find(line =>
    (line.status === 'DRAFT' || line.status === 'PARTIAL') &&
    line.type === group.type && line.size === group.size && line.packet === group.packetType
  ) || null;
}

function getActiveDraftLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(line => line.status === 'DRAFT' || line.status === 'PARTIAL');
}

function getReadyOutboundLines(lines, eps = 1e-6) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(line => {
    if (line.status === 'CANCELLED' || line.status === 'COMPLETE') return false;
    return Math.max(0, (line.requestedQty || 0) - (line.fulfilledQty || 0)) > eps;
  });
}

function getHistoryOutboundLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(line => line.status === 'COMPLETE' || line.status === 'CANCELLED');
}
