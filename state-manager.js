// Lightweight state gateway used for incremental modularization without runtime behavior changes.

const STATE_BINDINGS = {};

function bindStateProviders(providers = {}) {
  if (!providers || typeof providers !== 'object') return;
  Object.keys(providers).forEach(key => {
    const candidate = providers[key];
    if (!candidate) return;
    if (typeof candidate === 'function') {
      STATE_BINDINGS[key] = { get: candidate };
      return;
    }
    const get = typeof candidate.get === 'function' ? candidate.get : null;
    const set = typeof candidate.set === 'function' ? candidate.set : null;
    if (get || set) STATE_BINDINGS[key] = { get, set };
  });
}

function getStateValue(key, fallback = null) {
  try {
    const binding = STATE_BINDINGS[key];
    if (!binding || typeof binding.get !== 'function') return fallback;
    const value = binding.get();
    return value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

function setStateValue(key, value) {
  try {
    const binding = STATE_BINDINGS[key];
    if (!binding || typeof binding.set !== 'function') return false;
    binding.set(value);
    return true;
  } catch (e) {
    return false;
  }
}

function getAppUiState() {
  return getStateValue('appState', null);
}

function getOutboundState() {
  const state = getAppUiState();
  return state && state.outbound ? state.outbound : null;
}

function getInboundState() {
  const state = getAppUiState();
  return state && state.inbound ? state.inbound : null;
}

function getOutboundOrderModeActiveState() {
  const outbound = getOutboundState();
  return !!(outbound && outbound.orderModeActive);
}

function getOutboundCaptureModeActiveState() {
  const outbound = getOutboundState();
  return !!(outbound && outbound.captureMode);
}

function getOutboundTabState() {
  const outbound = getOutboundState();
  return outbound && outbound.tab ? outbound.tab : 'ready';
}

function getOutboundCommitSummaryState() {
  const outbound = getOutboundState();
  return outbound && typeof outbound.commitAllSummary === 'string' ? outbound.commitAllSummary : '';
}

function getInboundModeActiveState() {
  const inbound = getInboundState();
  return !!(inbound && inbound.modeActive);
}

function getInboundTabState() {
  const inbound = getInboundState();
  return inbound && inbound.tab ? inbound.tab : 'drafts';
}

function getInboundPostSummaryState() {
  const inbound = getInboundState();
  return inbound && typeof inbound.postAllSummary === 'string' ? inbound.postAllSummary : '';
}

function getFiltersState() {
  const state = getAppUiState();
  return state && state.filters ? state.filters : null;
}

function updateFiltersState(patch = {}) {
  const filters = getFiltersState();
  if (!filters || !patch || typeof patch !== 'object') return filters;
  Object.assign(filters, patch);
  return filters;
}

function resetFiltersState(defaults = {}) {
  const filters = getFiltersState();
  if (!filters || !defaults || typeof defaults !== 'object') return filters;
  Object.keys(defaults).forEach(key => {
    filters[key] = defaults[key];
  });
  return filters;
}

function getModalState() {
  const state = getAppUiState();
  return state && state.modal ? state.modal : null;
}

function updateModalState(patch = {}) {
  const modal = getModalState();
  if (!modal || !patch || typeof patch !== 'object') return modal;
  Object.assign(modal, patch);
  return modal;
}

function openModalState(group) {
  const modal = getModalState();
  if (!modal) return modal;
  modal.currentGroup = group || null;
  modal.isOpen = !!group;
  return modal;
}

function closeModalState() {
  const modal = getModalState();
  if (!modal) return modal;
  modal.currentGroup = null;
  modal.isOpen = false;
  return modal;
}

function setModalPendingAutoRefreshState(flag) {
  const modal = getModalState();
  if (!modal) return modal;
  modal.pendingAutoRefresh = !!flag;
  return modal;
}

function updateOutboundState(patch = {}) {
  const outbound = getOutboundState();
  if (!outbound || !patch || typeof patch !== 'object') return outbound;
  Object.assign(outbound, patch);
  return outbound;
}

function updateInboundState(patch = {}) {
  const inbound = getInboundState();
  if (!inbound || !patch || typeof patch !== 'object') return inbound;
  Object.assign(inbound, patch);
  return inbound;
}

function setOutboundOrderModeActiveState(flag) {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.orderModeActive = !!flag;
  return outbound;
}

function toggleOutboundOrderModeActiveState() {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.orderModeActive = !outbound.orderModeActive;
  return outbound;
}

function setOutboundCaptureModeState(flag) {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.captureMode = !!flag;
  return outbound;
}

function toggleOutboundCaptureModeState() {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.captureMode = !outbound.captureMode;
  return outbound;
}

function setOutboundTabState(tab) {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  const next = String(tab || '').trim().toLowerCase();
  if (next === 'drafts' || next === 'ready' || next === 'history') {
    outbound.tab = next;
  }
  return outbound;
}

function setOutboundCommitSummaryState(summary) {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.commitAllSummary = String(summary || '').trim();
  return outbound;
}

function clearOutboundCommitSummaryState() {
  const outbound = getOutboundState();
  if (!outbound) return outbound;
  outbound.commitAllSummary = '';
  return outbound;
}

function setInboundModeActiveState(flag) {
  const inbound = getInboundState();
  if (!inbound) return inbound;
  inbound.modeActive = !!flag;
  return inbound;
}

function toggleInboundModeActiveState() {
  const inbound = getInboundState();
  if (!inbound) return inbound;
  inbound.modeActive = !inbound.modeActive;
  return inbound;
}

function setInboundTabState(tab) {
  const inbound = getInboundState();
  if (!inbound) return inbound;
  const next = String(tab || '').trim().toLowerCase();
  if (next === 'drafts' || next === 'posted' || next === 'history') {
    inbound.tab = next;
  }
  return inbound;
}

function setInboundPostSummaryState(summary) {
  const inbound = getInboundState();
  if (!inbound) return inbound;
  inbound.postAllSummary = String(summary || '').trim();
  return inbound;
}

function clearInboundPostSummaryState() {
  const inbound = getInboundState();
  if (!inbound) return inbound;
  inbound.postAllSummary = '';
  return inbound;
}

function getOutboundDraftLinesState() {
  const lines = getOrderLinesState();
  return lines.filter(line => line && line.status === 'DRAFT');
}

function getOutboundReadyLinesState(eps = 1e-6) {
  const lines = getOrderLinesState();
  return lines.filter(line => {
    if (!line) return false;
    if (line.status === 'CANCELLED' || line.status === 'COMPLETE') return false;
    return Math.max(0, (line.requestedQty || 0) - (line.fulfilledQty || 0)) > eps;
  });
}

function getOutboundHistoryLinesState() {
  const lines = getOrderLinesState();
  return lines.filter(line => line && (line.status === 'COMPLETE' || line.status === 'CANCELLED'));
}

function getOutboundPendingTotalState(eps = 1e-6) {
  const readyLines = getOutboundReadyLinesState(eps);
  return readyLines.reduce((sum, line) => sum + Math.max(0, (line.requestedQty || 0) - (line.fulfilledQty || 0)), 0);
}

function getInboundDraftLinesState() {
  const lines = getReceiptLinesState();
  return lines.filter(line => line && line.status === 'DRAFT');
}

function getInboundPostedLinesState() {
  const lines = getReceiptLinesState();
  return lines.filter(line => line && line.status === 'POSTED');
}

function getInboundHistoryLinesState() {
  const lines = getReceiptLinesState();
  return lines.filter(line => line && (line.status === 'POSTED' || line.status === 'CANCELLED'));
}

function getInboundPendingTotalState() {
  const draftLines = getInboundDraftLinesState();
  return draftLines.reduce((sum, line) => sum + Math.max(0, (line.receivedQty || 0)), 0);
}

function getOrderLinesState() {
  return getStateValue('orderLines', []);
}

function setOrderLinesState(lines) {
  const normalized = Array.isArray(lines) ? lines : [];
  setStateValue('orderLines', normalized);
  return normalized;
}

function getReceiptLinesState() {
  return getStateValue('receiptLines', []);
}

function setReceiptLinesState(lines) {
  const normalized = Array.isArray(lines) ? lines : [];
  setStateValue('receiptLines', normalized);
  return normalized;
}

function getFeatureFlagsState() {
  return getStateValue('runtimeFeatureFlags', {});
}

function setFeatureFlagsState(flags) {
  const normalized = (flags && typeof flags === 'object') ? flags : {};
  setStateValue('runtimeFeatureFlags', normalized);
  return normalized;
}

function getCurrentRoleState() {
  return getStateValue('currentRole', 'operator');
}

function setCurrentRoleState(role) {
  const normalized = String(role || 'operator').toLowerCase();
  setStateValue('currentRole', normalized);
  return normalized;
}

function getCurrentPermissionsState() {
  return getStateValue('currentPermissions', {});
}

function setCurrentPermissionsState(perms) {
  const normalized = (perms && typeof perms === 'object') ? perms : {};
  setStateValue('currentPermissions', normalized);
  return normalized;
}
