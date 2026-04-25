// Outbound write-side facade used to keep UI handlers thin and consistent.

function createOutboundService(deps = {}) {
  const {
    writeCreateOrderDraft,
    writeListOrders,
    writeUpdateOrderLine,
    writeCancelOrderLine,
    writeCommitOrderFulfillment,
    isWholeOrderNumber,
  } = deps;

  function requireFn(fn, name) {
    if (typeof fn !== 'function') {
      throw new Error(`${name} is not available`);
    }
  }

  function buildCommitConflict(err) {
    const msg = String(err && err.message || 'Commit failed');
    const details = err && typeof err.details === 'object' ? err.details : null;
    const parts = [];
    if (details) {
      if (details.row) parts.push(`Row ${details.row}`);
      if (details.warehouse || details.floor || details.location) {
        parts.push([details.warehouse || '?', details.floor || '?', details.location || '?'].join('/'));
      }
      if (details.currentStock !== undefined) parts.push(`Current stock ${details.currentStock}`);
      if (details.currentAvailable !== undefined) {
        const unit = String(details.unit || '').trim();
        parts.push(`Current available ${details.currentAvailable}${unit ? ` ${unit}` : ''}`);
      }
      if (details.requestedQty !== undefined) parts.push(`Requested ${details.requestedQty}`);
    }
    return {
      message: msg,
      detail: parts.join(' · '),
      parts,
      details,
    };
  }

  return {
    async listOrders() {
      requireFn(writeListOrders, 'writeListOrders');
      return writeListOrders();
    },

    async createOrUpdateDraft(input = {}) {
      const {
        existingLine = null,
        group = null,
        requestedQty = 0,
        requestedMode = 'UNIT',
        requestedUom = 'unit',
      } = input;

      requireFn(writeUpdateOrderLine, 'writeUpdateOrderLine');
      requireFn(writeCreateOrderDraft, 'writeCreateOrderDraft');

      if (existingLine && existingLine.orderId && existingLine.lineId) {
        const response = await writeUpdateOrderLine(
          existingLine.orderId,
          existingLine.lineId,
          requestedQty,
          existingLine.notes || '',
          requestedMode,
          requestedUom
        );
        return {
          operation: 'update',
          response,
          orderId: existingLine.orderId,
          lineId: existingLine.lineId,
        };
      }

      const line = {
        type: group && group.type || '',
        size: group && group.size || '',
        packet: group && group.packetType || '',
        requestedQty,
        requestedMode,
        requestedUom,
        notes: '',
      };
      const response = await writeCreateOrderDraft(line);
      return {
        operation: 'create',
        response,
      };
    },

    async saveLine(input = {}) {
      const {
        orderId = '',
        lineId = '',
        qty = 0,
        notes = '',
        requestedMode = 'UNIT',
        requestedUom = 'unit',
      } = input;
      requireFn(writeUpdateOrderLine, 'writeUpdateOrderLine');
      return writeUpdateOrderLine(orderId, lineId, qty, notes, requestedMode, requestedUom);
    },

    async cancelLine(input = {}) {
      const { orderId = '', lineId = '' } = input;
      requireFn(writeCancelOrderLine, 'writeCancelOrderLine');
      return writeCancelOrderLine(orderId, lineId);
    },

    async commitLine(input = {}) {
      const {
        orderId = '',
        lineId = '',
        fulfillQty = 0,
        allocations = [],
      } = input;
      requireFn(writeCommitOrderFulfillment, 'writeCommitOrderFulfillment');
      return writeCommitOrderFulfillment(orderId, lineId, fulfillQty, allocations);
    },

    buildCommitConflict,

    async orchestrateCommitLine(input = {}) {
      const {
        orderId = '',
        lineId = '',
        line = null,
        remaining = 0,
        allocations = [],
        total = 0,
        modeCtx = null,
        options = {},
        confirmMessage = '',
        confirmFn = null,
        eps = 1e-6,
      } = input;

      const opts = {
        skipConfirm: false,
        ...options,
      };

      if (!Array.isArray(allocations) || allocations.length === 0) {
        return {
          success: false,
          reason: 'NO_ALLOCATIONS',
          message: 'Enter allocation qty for at least one placement',
        };
      }

      const numericTotal = Number.isFinite(total) ? total : 0;
      const numericRemaining = Number.isFinite(remaining) ? remaining : 0;
      const requiresWholeNumber = !(modeCtx && modeCtx.numericMode === 'decimal');
      if (requiresWholeNumber && typeof isWholeOrderNumber === 'function' && !isWholeOrderNumber(numericTotal)) {
        return {
          success: false,
          reason: 'WHOLE_NUMBER_REQUIRED',
          message: 'Allocation must be a whole number for this mode',
        };
      }

      if ((numericTotal - numericRemaining) > eps) {
        return {
          success: false,
          reason: 'EXCEEDS_REMAINING',
          message: `Allocation exceeds remaining qty (${numericRemaining})`,
        };
      }

      if (!opts.skipConfirm && typeof confirmFn === 'function') {
        const accepted = await Promise.resolve(confirmFn(confirmMessage || 'Commit fulfillment?'));
        if (!accepted) {
          return {
            success: false,
            cancelled: true,
          };
        }
      }

      try {
        requireFn(writeCommitOrderFulfillment, 'writeCommitOrderFulfillment');
        await writeCommitOrderFulfillment(orderId, lineId, numericTotal, allocations);
        return {
          success: true,
          total: numericTotal,
          orderId,
          lineId,
          line,
        };
      } catch (err) {
        const conflict = buildCommitConflict(err);
        return {
          success: false,
          error: err,
          conflict,
          message: conflict.message,
          orderId,
          lineId,
          line,
        };
      }
    },
  };
}
