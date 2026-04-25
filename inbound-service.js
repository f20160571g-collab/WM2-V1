// Inbound write-side facade used to keep UI handlers thin and consistent.

function createInboundService(deps = {}) {
  const {
    writeCreateReceiptDraft,
    writeListReceipts,
    writeUpdateReceiptLine,
    writeCancelReceiptLine,
    writePostReceipt,
    backdateDays = 90,
  } = deps;

  function requireFn(fn, name) {
    if (typeof fn !== 'function') {
      throw new Error(`${name} is not available`);
    }
  }

  function normalizeDateOnly(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (!Number.isFinite(parsed.getTime())) return '';
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function buildDateValidation(dateText) {
    const normalized = normalizeDateOnly(dateText);
    if (!normalized) {
      return { ok: false, message: 'Receipt date is required' };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const min = new Date(now);
    min.setDate(min.getDate() - Math.max(1, parseInt(backdateDays, 10) || 90));

    const parsed = new Date(`${normalized}T00:00:00`);
    if (!Number.isFinite(parsed.getTime())) {
      return { ok: false, message: 'Receipt date is invalid' };
    }
    if (parsed > now) {
      return { ok: false, message: 'Future receipt date is not allowed' };
    }
    if (parsed < min) {
      return { ok: false, message: `Receipt date cannot be older than ${Math.max(1, parseInt(backdateDays, 10) || 90)} days` };
    }

    return { ok: true, value: normalized };
  }

  function normalizeLinePayload(input = {}) {
    const payload = input && typeof input === 'object' ? input : {};
    const dateCheck = buildDateValidation(payload.receiptDate);
    if (!dateCheck.ok) {
      return { error: dateCheck.message };
    }

    const type = String(payload.type || '').trim();
    const size = String(payload.size || '').trim();
    const details = String(payload.details || '').trim();
    const packet = String(payload.packet || '').trim();
    const warehouse = String(payload.warehouse || '').trim();
    const floor = String(payload.floor || '').trim();
    const location = String(payload.location || '').trim();
    const notes = String(payload.notes || '').trim();

    const receivedQty = parseInt(payload.receivedQty, 10);
    if (!type || !size || !packet) return { error: 'Type, size and packet are required' };
    if (!warehouse || !floor || !location) return { error: 'Warehouse, floor and location are required' };
    if (!Number.isInteger(receivedQty) || receivedQty <= 0) return { error: 'Received qty must be a positive whole number' };

    const qtyText = String(payload.qtyPerUnit ?? '').trim();
    const unit = String(payload.unit || '').trim().toLowerCase();
    const looseText = String(payload.looseQty ?? '').trim();

    const qtyPerUnit = qtyText === '' ? null : Number.parseFloat(qtyText);
    const looseQty = looseText === '' ? 0 : Number.parseFloat(looseText);

    if (qtyPerUnit !== null && (!Number.isFinite(qtyPerUnit) || qtyPerUnit <= 0)) {
      return { error: 'Qty per unit must be a positive number' };
    }
    if (unit && unit !== 'kg' && unit !== 'pcs') {
      return { error: 'Unit must be kg or pcs' };
    }
    if ((qtyPerUnit !== null || unit) && !(qtyPerUnit !== null && unit)) {
      return { error: 'Qty per unit and unit must be provided together' };
    }
    if (!Number.isFinite(looseQty) || looseQty < 0) {
      return { error: 'Loose qty must be a non-negative number' };
    }
    if (looseQty > 0 && !(qtyPerUnit !== null && unit)) {
      return { error: 'Loose qty requires qty per unit and unit' };
    }
    if (unit === 'pcs' && !Number.isInteger(looseQty)) {
      return { error: 'Loose qty must be a whole number for pcs rows' };
    }

    return {
      value: {
        type,
        size,
        details,
        packet,
        warehouse,
        floor,
        location,
        receivedQty,
        qtyPerUnit,
        unit,
        looseQty,
        notes,
        receiptDate: dateCheck.value,
      },
    };
  }

  return {
    validateDate: buildDateValidation,

    async listReceipts() {
      requireFn(writeListReceipts, 'writeListReceipts');
      return writeListReceipts();
    },

    async createDraft(input = {}) {
      requireFn(writeCreateReceiptDraft, 'writeCreateReceiptDraft');
      const normalized = normalizeLinePayload(input);
      if (normalized.error) {
        return { success: false, message: normalized.error };
      }
      const response = await writeCreateReceiptDraft(normalized.value);
      return { success: true, response };
    },

    async saveLine(input = {}) {
      requireFn(writeUpdateReceiptLine, 'writeUpdateReceiptLine');
      const receiptId = String(input.receiptId || '').trim();
      const lineId = String(input.lineId || '').trim();
      if (!receiptId || !lineId) return { success: false, message: 'Receipt line identity is missing' };
      const normalized = normalizeLinePayload(input);
      if (normalized.error) {
        return { success: false, message: normalized.error };
      }
      const response = await writeUpdateReceiptLine(receiptId, lineId, normalized.value);
      return { success: true, response };
    },

    async cancelLine(input = {}) {
      requireFn(writeCancelReceiptLine, 'writeCancelReceiptLine');
      const receiptId = String(input.receiptId || '').trim();
      const lineId = String(input.lineId || '').trim();
      if (!receiptId || !lineId) return { success: false, message: 'Receipt line identity is missing' };
      const response = await writeCancelReceiptLine(receiptId, lineId);
      return { success: true, response };
    },

    async orchestratePostLine(input = {}) {
      requireFn(writePostReceipt, 'writePostReceipt');
      const receiptId = String(input.receiptId || '').trim();
      const lineId = String(input.lineId || '').trim();
      if (!receiptId || !lineId) return { success: false, message: 'Receipt line identity is missing' };
      const dateCheck = buildDateValidation(input.receiptDate);
      if (!dateCheck.ok) {
        return { success: false, message: dateCheck.message, reason: 'INVALID_DATE' };
      }
      try {
        const response = await writePostReceipt(receiptId, lineId);
        return { success: true, response };
      } catch (error) {
        return {
          success: false,
          error,
          message: String(error && error.message || 'Receipt posting failed'),
        };
      }
    },
  };
}
