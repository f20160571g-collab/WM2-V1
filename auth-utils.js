// Session and token helpers extracted from app.js during foundation refactor.

let permissionProvider = () => ({});

function setPermissionProvider(provider) {
  if (typeof provider === 'function') permissionProvider = provider;
}

function resolvePermissions(permissions) {
  if (permissions && typeof permissions === 'object') return permissions;
  try {
    const provided = permissionProvider();
    return provided && typeof provided === 'object' ? provided : {};
  } catch (e) {
    return {};
  }
}

function hasPermission(key, permissions) {
  const perms = resolvePermissions(permissions);
  return !!(perms && perms[key]);
}

function canReadData(permissions) {
  return hasPermission('canRead', permissions);
}

function canWriteData(permissions) {
  return hasPermission('canWrite', permissions);
}

function canUndoData(permissions) {
  return hasPermission('canUndo', permissions);
}

function canOrderCommitData(permissions) {
  return hasPermission('canOrderCommit', permissions);
}

function checkSession() {
  try {
    const tok = sessionStorage.getItem('wh_auth_token');
    const ts = parseInt(sessionStorage.getItem('wh_auth_ts') || '0', 10);
    return !!tok && (Date.now() - ts) < CONFIG.SESSION_MS;
  } catch (e) {
    return false;
  }
}

function saveSession(token) {
  try {
    sessionStorage.setItem('wh_auth_token', token);
    sessionStorage.setItem('wh_auth_ts', Date.now().toString());
  } catch (e) {}
}

function getSessionToken() {
  try {
    return sessionStorage.getItem('wh_auth_token') || '';
  } catch (e) {
    return '';
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem('wh_auth_token');
    sessionStorage.removeItem('wh_auth_ts');
  } catch (e) {}
}
