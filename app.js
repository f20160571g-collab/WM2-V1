// ============================================================
//  CONFIG
// ============================================================
const WM2_RUNTIME_CONFIG = (typeof window !== 'undefined' && window.WM2_RUNTIME_CONFIG && typeof window.WM2_RUNTIME_CONFIG === 'object')
  ? window.WM2_RUNTIME_CONFIG
  : {};

const CONFIG = {
  ENV_NAME:            String(WM2_RUNTIME_CONFIG.ENV_NAME || 'production').trim().toLowerCase(),
  APPS_SCRIPT_URL:     String(WM2_RUNTIME_CONFIG.APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwcuEVIltrQDeZK2J40wKjKkA8ms3r9gZHBX4UKEHTIfdxyvcbzAiEXiOH-rcCBhmfO/exec").trim(),

  SHEET_NAME:          "Consolidated(Man)",
  COMMENTS_SHEET_NAME: "Comments",

  COL_TYPE:      "A",
  COL_SIZE:      "B",
  COL_DETAILS:   "C",
  COL_PACKET:    "D",
  COL_WAREHOUSE: "E",
  COL_FLOOR:     "F",
  COL_STOCK:     "G",
  COL_LOCATION:  "H",
  COL_NOTES:     "I",
  COL_QTY:       "J",
  COL_UNIT:      "K",
  COL_LOOSE:     "L",

  HEADER_ROW: 1,
  LOW_STOCK_THRESHOLD: 5,
  DEFAULT_WAREHOUSES: ['J1','A1','A2'],
  DEFAULT_FLOORS: ['BS','GF','FF','SF','TF'],
  AUTO_REFRESH_MS: 60000,
  SESSION_MS: 24 * 60 * 60 * 1000,
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_MS: 1000,
};
// ============================================================

document.getElementById('sfLow').textContent = `Low ≤ ${CONFIG.LOW_STOCK_THRESHOLD}`;

// ── State ──
let rawData=[], groups=[], filtered=[], allComments=[];
let isConfigured=false;
let toastTimer=null;
let runtimeWarehouses=[...CONFIG.DEFAULT_WAREHOUSES];
let runtimeFloors=[...CONFIG.DEFAULT_FLOORS];
let runtimeSearchAliases={};
let runtimeFeatureFlags={};
let currentRole='operator';
let currentPermissions={
  canRead:true,
  canWrite:true,
  canUndo:false,
  canOrderCommit:false,
  canAdmin:false,
};
setPermissionProvider(()=>currentPermissions||{});
let undoCandidates=[];
let syncService=null;
const OFFLINE_QUEUE_KEY='wh_offline_queue_v1';
let undoCandidatesLoading=false;
let orderLines=[];
let receiptLines=[];
let outboundService=null;
let inboundService=null;
let apiClient=null;
let commentsService=null;
let undoService=null;
let eventRouter=null;
let outboundServiceInitFailed=false;
let outboundServiceWarningShown=false;
let inboundServiceInitFailed=false;
let inboundServiceWarningShown=false;
let detailExpandedKeys=new Set();
const ORDER_NUMBER_EPS=1e-6;
const RECEIPT_BACKDATE_DAYS=90;
const appState={
  filters:{
    type:'ALL',
    stock:'ALL',
    packet:'ALL',
    warehouse:'ALL',
    floor:'ALL',
    attentionOnly:false,
    search:'',
    location:'',
    sort:'stock-desc',
  },
  modal:{
    currentGroup:null,
    isOpen:false,
    pendingAutoRefresh:false,
  },
  outbound:{
    orderModeActive:false,
    captureMode:false,
    tab:'ready',
    commitAllSummary:'',
  },
  inbound:{
    modeActive:false,
    tab:'drafts',
    postAllSummary:'',
  },
  ui:{
    actionsBound:false,
  },
};

bindStateProviders({
  appState:{get:()=>appState},
  orderLines:{get:()=>orderLines,set:(value)=>{orderLines=Array.isArray(value)?value:[];}},
  receiptLines:{get:()=>receiptLines,set:(value)=>{receiptLines=Array.isArray(value)?value:[];}},
  runtimeFeatureFlags:{get:()=>runtimeFeatureFlags,set:(value)=>{runtimeFeatureFlags=(value&&typeof value==='object')?value:{};}},
  currentRole:{get:()=>currentRole,set:(value)=>{currentRole=String(value||'operator').toLowerCase();}},
  currentPermissions:{get:()=>currentPermissions,set:(value)=>{currentPermissions=(value&&typeof value==='object')?value:{};}},
});

function getAppStateRef(){
  return getAppUiState();
}

function getOutboundStateRef(){
  return getAppStateRef().outbound;
}

function getInboundStateRef(){
  return getAppStateRef().inbound;
}

function setOutboundOrderModeActiveRef(flag){
  return setOutboundOrderModeActiveState(flag);
}

function toggleOutboundOrderModeActiveRef(){
  return toggleOutboundOrderModeActiveState();
}

function setOutboundCaptureModeRef(flag){
  return setOutboundCaptureModeState(flag);
}

function toggleOutboundCaptureModeRef(){
  return toggleOutboundCaptureModeState();
}

function setOutboundTabRef(tab){
  return setOutboundTabState(tab);
}

function setOutboundCommitSummaryRef(summary){
  return setOutboundCommitSummaryState(summary);
}

function clearOutboundCommitSummaryRef(){
  return clearOutboundCommitSummaryState();
}

function isOutboundOrderModeActiveRef(){
  return getOutboundOrderModeActiveState();
}

function isOutboundCaptureModeActiveRef(){
  return getOutboundCaptureModeActiveState();
}

function getOutboundTabRef(){
  return getOutboundTabState();
}

function getOutboundCommitSummaryRef(){
  return getOutboundCommitSummaryState();
}

function setInboundModeActiveRef(flag){
  return setInboundModeActiveState(flag);
}

function toggleInboundModeActiveRef(){
  return toggleInboundModeActiveState();
}

function isInboundModeActiveRef(){
  return getInboundModeActiveState();
}

function setInboundTabRef(tab){
  return setInboundTabState(tab);
}

function getInboundTabRef(){
  return getInboundTabState();
}

function setInboundPostSummaryRef(summary){
  return setInboundPostSummaryState(summary);
}

function clearInboundPostSummaryRef(){
  return clearInboundPostSummaryState();
}

function getInboundPostSummaryRef(){
  return getInboundPostSummaryState();
}

function getInboundDraftLinesRef(){
  return getInboundDraftLinesState();
}

function getInboundPostedLinesRef(){
  return getInboundPostedLinesState();
}

function getInboundHistoryLinesRef(){
  return getInboundHistoryLinesState();
}

function getInboundPendingTotalRef(){
  return normalizeOrderNumber(getInboundPendingTotalState());
}

function getInboundViewStateRef(){
  const tab=getInboundTabRef();
  const draftLines=getInboundDraftLinesRef();
  const postedLines=getInboundPostedLinesRef();
  const historyLines=getInboundHistoryLinesRef();
  const totalPending=getInboundPendingTotalRef();
  const postSummary=getInboundPostSummaryRef();
  let linesToRender=[];
  if(tab==='drafts') linesToRender=draftLines;
  if(tab==='posted') linesToRender=postedLines;
  if(tab==='history') linesToRender=historyLines;
  return {tab,draftLines,postedLines,historyLines,totalPending,postSummary,linesToRender};
}

function getOutboundDraftLinesRef(){
  return getOutboundDraftLinesState();
}

function getOutboundReadyLinesRef(){
  return getOutboundReadyLinesState(ORDER_NUMBER_EPS);
}

function getOutboundHistoryLinesRef(){
  return getOutboundHistoryLinesState();
}

function getOutboundPendingTotalRef(){
  return normalizeOrderNumber(getOutboundPendingTotalState(ORDER_NUMBER_EPS));
}

function getOutboundViewStateRef(){
  const tab=getOutboundTabRef();
  const draftLines=getOutboundDraftLinesRef();
  const readyLines=getOutboundReadyLinesRef();
  const historyLines=getOutboundHistoryLinesRef();
  const totalPending=getOutboundPendingTotalRef();
  const commitSummary=getOutboundCommitSummaryRef();
  let linesToRender=[];
  if(tab==='drafts') linesToRender=draftLines;
  if(tab==='ready') linesToRender=readyLines;
  if(tab==='history') linesToRender=historyLines;
  return {tab,draftLines,readyLines,historyLines,totalPending,commitSummary,linesToRender};
}

function notifyOutboundServiceUnavailable(){
  if(outboundServiceWarningShown) return;
  outboundServiceWarningShown=true;
  updateOutboundServiceNotice();
  showToast('Outbound module failed to load. Refresh the page to restore outbound actions.','error',{
    duration:6000,
    actionLabel:'Refresh',
    onAction:()=>window.location.reload(),
  });
}

function updateOutboundServiceNotice(){
  const notice=document.getElementById('outboundServiceNotice');
  if(!notice) return;
  notice.classList.toggle('hidden',!outboundServiceInitFailed);
}

function notifyInboundServiceUnavailable(){
  if(inboundServiceWarningShown) return;
  inboundServiceWarningShown=true;
  updateInboundServiceNotice();
  showToast('Inbound module failed to load. Refresh the page to restore inbound actions.','error',{
    duration:6000,
    actionLabel:'Refresh',
    onAction:()=>window.location.reload(),
  });
}

function updateInboundServiceNotice(){
  const notice=document.getElementById('inboundServiceNotice');
  if(!notice) return;
  notice.classList.toggle('hidden',!inboundServiceInitFailed);
}

function initApiClient(){
  if(apiClient) return apiClient;
  try{
    apiClient=createApiClient({
      url:CONFIG.APPS_SCRIPT_URL,
      retryMaxAttempts:CONFIG.RETRY_MAX_ATTEMPTS,
      retryBaseMs:CONFIG.RETRY_BASE_MS,
      getSessionToken,
      clearSession,
      getActorName,
      generateRequestId,
      isRetryableError,
    });
  }catch(e){
    apiClient=null;
  }
  return apiClient;
}

function getApiClientRef(){
  const client=initApiClient();
  if(client) return client;
  throw new Error('API client is not initialized');
}

function isQueueableMutationError(err){
  const code=String(err?.code||'').toUpperCase();
  const msg=String(err?.message||'').toLowerCase();
  if(code==='AUTH_REQUIRED'||code==='CONFLICT') return false;
  if(msg.includes('session expired')||msg.includes('missing session token')) return false;
  if(!navigator.onLine) return true;
  return msg.includes('network')||msg.includes('failed to fetch')||msg.includes('fetch');
}

function initSyncService(){
  if(syncService) return syncService;
  try{
    syncService=createSyncService({
      queueKey:OFFLINE_QUEUE_KEY,
      storage:window.localStorage,
      callApi:(payload)=>callAppsScript(payload),
      isQueueEnabled:()=>isOfflineQueueEnabled(),
      isOnline:()=>navigator.onLine,
      shouldQueueError:isQueueableMutationError,
      createQueueId:()=>`q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      nowIso:()=>new Date().toISOString(),
    });
  }catch(e){
    syncService=null;
  }
  return syncService;
}

function getSyncServiceRef(){
  const service=initSyncService();
  if(service) return service;
  throw new Error('Sync service is not initialized');
}

function initCommentsService(){
  if(commentsService) return commentsService;
  try{
    commentsService=createCommentsService({
      enqueueMutation:(kind,payload)=>mutateWithOfflineQueue(kind,payload),
      generateRequestId,
      getActorName,
    });
  }catch(e){
    commentsService=null;
  }
  return commentsService;
}

function getCommentsServiceRef(){
  const service=initCommentsService();
  if(service) return service;
  throw new Error('Comments service is not initialized');
}

function initUndoService(){
  if(undoService) return undoService;
  try{
    undoService=createUndoService({
      callApi:(payload)=>callAppsScript(payload),
    });
  }catch(e){
    undoService=null;
  }
  return undoService;
}

function getUndoServiceRef(){
  const service=initUndoService();
  if(service) return service;
  throw new Error('Undo service is not initialized');
}

function initEventRouter(){
  if(eventRouter) return eventRouter;
  try{
    eventRouter=createEventRouter({root:document});
  }catch(e){
    eventRouter=null;
  }
  return eventRouter;
}

function getOutboundServiceRef(){
  const service=initOutboundService();
  if(service) return service;
  notifyOutboundServiceUnavailable();
  throw new Error('Outbound service is not initialized');
}

function getInboundServiceRef(){
  const service=initInboundService();
  if(service) return service;
  notifyInboundServiceUnavailable();
  throw new Error('Inbound service is not initialized');
}

function initOutboundService(){
  if(outboundService) return outboundService;
  try{
    outboundService=createOutboundService({
      writeCreateOrderDraft,
      writeListOrders,
      writeUpdateOrderLine,
      writeCancelOrderLine,
      writeCommitOrderFulfillment,
      isWholeOrderNumber,
    });
    outboundServiceInitFailed=false;
  }catch(e){
    outboundServiceInitFailed=true;
    outboundService=null;
  }
  return outboundService;
}

function initInboundService(){
  if(inboundService) return inboundService;
  try{
    inboundService=createInboundService({
      writeCreateReceiptDraft,
      writeListReceipts,
      writeUpdateReceiptLine,
      writeCancelReceiptLine,
      writePostReceipt,
      backdateDays:RECEIPT_BACKDATE_DAYS,
    });
    inboundServiceInitFailed=false;
  }catch(e){
    inboundServiceInitFailed=true;
    inboundService=null;
  }
  return inboundService;
}

function getOrderLinesRef(){
  return getOrderLinesState();
}

function setOrderLinesRef(value){
  const normalized=Array.isArray(value)?value:[];
  setOrderLinesState(normalized);
}

function getReceiptLinesRef(){
  return getReceiptLinesState();
}

function setReceiptLinesRef(value){
  const normalized=Array.isArray(value)?value:[];
  setReceiptLinesState(normalized);
}

function getFeatureFlagsRef(){
  const flags=getFeatureFlagsState();
  return (flags&&typeof flags==='object')?flags:{};
}

function getFiltersRef(){
  const filters=getFiltersState();
  return filters&&typeof filters==='object'?filters:appState.filters;
}

function updateFiltersRef(patch){
  return updateFiltersState(patch||{});
}

function resetFiltersRef(defaults){
  return resetFiltersState(defaults||{});
}

function getModalRef(){
  const modal=getModalState();
  return modal&&typeof modal==='object'?modal:appState.modal;
}

function updateModalRef(patch){
  return updateModalState(patch||{});
}

function openModalRef(group){
  return openModalState(group);
}

function closeModalRef(){
  return closeModalState();
}

function setModalPendingAutoRefreshRef(flag){
  return setModalPendingAutoRefreshState(flag);
}

function setFeatureFlagsRef(value){
  const normalized=(value&&typeof value==='object')?value:{};
  setFeatureFlagsState(normalized);
}

function setCurrentRoleRef(value){
  const normalized=String(value||'operator').toLowerCase();
  setCurrentRoleState(normalized);
}

function setCurrentPermissionsRef(value){
  const normalized=(value&&typeof value==='object')?value:{};
  setCurrentPermissionsState(normalized);
}

function getWarehouseOptions(){
  return runtimeWarehouses.length?runtimeWarehouses:[...CONFIG.DEFAULT_WAREHOUSES];
}

function getFloorOptions(){
  return runtimeFloors.length?runtimeFloors:[...CONFIG.DEFAULT_FLOORS];
}

function isOrderModeEnabled(){
  return !!getFeatureFlagsRef().orderModeEnabled;
}

function hasUndoCandidates(){
  return Array.isArray(undoCandidates)&&undoCandidates.length>0;
}

function updateOrderModeBanner(){
  const banner=document.getElementById('orderModeBanner');
  if(!banner) return;
  const outboundVisible=isOutboundOrderModeActiveRef()&&isOrderModeEnabled()&&canReadData();
  const inboundVisible=isInboundModeActiveRef()&&isOrderModeEnabled()&&canReadData();
  const visible=outboundVisible||inboundVisible;
  banner.classList.toggle('hidden',!visible);
  if(!visible) return;
  if(outboundVisible){
    const lines=getActiveDraftLines(getOrderLinesRef());
    const totalPending=lines.reduce((sum,line)=>sum+Math.max(0,normalizeOrderNumber((line.requestedQty||0)-(line.fulfilledQty||0))),0);
    banner.textContent=`Outbound Open · Capture ${isOutboundCaptureModeActiveRef()?'ON':'OFF'} · ${lines.length} line${lines.length===1?'':'s'} · ${formatOrderNumber(totalPending)} pending`;
    return;
  }
  const draftLines=getInboundDraftLinesRef();
  const totalInbound=getInboundPendingTotalRef();
  banner.textContent=`Inbound Open · ${draftLines.length} draft line${draftLines.length===1?'':'s'} · ${formatOrderNumber(totalInbound)} pending post`;
}

function updateRoleUI(){
  const outboundActive=isOutboundOrderModeActiveRef();
  const inboundActive=isInboundModeActiveRef();
  const captureActive=isOutboundCaptureModeActiveRef();
  const role=getCurrentRoleState();
  const badge=document.getElementById('roleBadge');
  const syncBtn=document.getElementById('syncBtn');
  const pdfBtn=document.querySelector('.pdf-btn');
  const orderBtn=document.getElementById('orderModeBtn');
  const inboundBtn=document.getElementById('inboundModeBtn');
  const captureBtn=document.getElementById('outboundCaptureBtn');
  const inventoryWorkspace=document.getElementById('inventoryWorkspace');
  const outboundWorkspace=document.getElementById('outboundWorkspace');
  const inboundWorkspace=document.getElementById('inboundWorkspace');
  const undoControls=document.getElementById('undoControls');
  const undoSelect=document.getElementById('undoSelect');
  const undoBtn=document.getElementById('undoBtn');
  if(badge){
    badge.textContent=role||'operator';
    badge.className=`role-badge role-${role||'operator'}`;
  }
  if(syncBtn) syncBtn.disabled=!canReadData();
  if(pdfBtn) pdfBtn.disabled=!canReadData();
  if(orderBtn) orderBtn.classList.toggle('hidden',!isOrderModeEnabled()||!canReadData());
  if(orderBtn) orderBtn.classList.toggle('active',outboundActive);
  if(orderBtn) orderBtn.textContent=outboundActive?'🧾 Outbound: OPEN':'🧾 Outbound';
  if(inboundBtn) inboundBtn.classList.toggle('hidden',!isOrderModeEnabled()||!canReadData());
  if(inboundBtn) inboundBtn.classList.toggle('active',inboundActive);
  if(inboundBtn) inboundBtn.textContent=inboundActive?'📥 Inbound: OPEN':'📥 Inbound';
  if(inboundBtn) inboundBtn.disabled=!canOrderCommitData();
  if(captureBtn) captureBtn.classList.toggle('hidden',!isOrderModeEnabled()||!canReadData());
  if(captureBtn) captureBtn.classList.toggle('active',captureActive);
  if(captureBtn) captureBtn.textContent=captureActive?'✚ Outbound Mode: ON':'✚ Outbound Mode: OFF';
  if(captureBtn) captureBtn.disabled=!canOrderCommitData()||inboundActive;
  if(inventoryWorkspace) inventoryWorkspace.classList.toggle('hidden',(outboundActive||inboundActive)&&canReadData());
  if(outboundWorkspace) outboundWorkspace.classList.toggle('hidden',!outboundActive||!canReadData());
  if(inboundWorkspace) inboundWorkspace.classList.toggle('hidden',!inboundActive||!canReadData());
  document.body.classList.toggle('outbound-open',outboundActive&&canReadData());
  document.body.classList.toggle('inbound-open',inboundActive&&canReadData());
  if(undoControls) undoControls.classList.toggle('hidden',!canUndoData());
  if(undoSelect) undoSelect.disabled=!canUndoData()||undoCandidatesLoading||!hasUndoCandidates();
  if(undoBtn) {
    undoBtn.disabled=!canUndoData()||undoCandidatesLoading||!hasUndoCandidates();
  }
  document.body.classList.toggle('read-only',!canWriteData());
  updateOrderModeBanner();
  updateQueueUI();
}

function requireWritePermission(){
  if(canWriteData()) return true;
  showToast('Your role is read-only','error');
  return false;
}

function requireUndoPermission(){
  if(canUndoData()) return true;
  showToast('Your role cannot perform undo','error');
  return false;
}

function requireOrderCommitPermission(){
  if(canOrderCommitData()) return true;
  showToast('Your role cannot modify orders','error');
  return false;
}

function isOfflineQueueEnabled(){
  return !!getFeatureFlagsRef().offlineQueueEnabled;
}

function loadOfflineQueue(){
  const service=initSyncService();
  if(!service) return;
  service.loadQueue();
}

function updateQueueUI(){
  const btn=document.getElementById('queueBtn');
  if(!btn) return;
  const enabled=isOfflineQueueEnabled();
  btn.classList.toggle('hidden',!enabled);
  if(!enabled) return;
  const service=initSyncService();
  const count=service?service.getQueueCount():0;
  const isFlushing=service?service.isFlushing():false;
  btn.textContent=isFlushing?`Queue ${count}…`:`Queue ${count}`;
  btn.disabled=isFlushing||count===0;
  btn.classList.toggle('has-queued',count>0);
}

async function processOfflineQueue(silent=true){
  const service=getSyncServiceRef();
  updateQueueUI();
  const result=await service.processQueue();
  updateQueueUI();

  if(result.status==='offline'){
    if(!silent) showToast('Still offline. Changes remain queued.','info');
    return;
  }

  if(result.blockedError&&!silent){
    showToast(`Queue blocked: ${result.blockedError.message}`,'error');
  }

  if(result.applied>0){
    if(!silent) showToast(`Synced ${result.applied} queued change${result.applied===1?'':'s'}`,'success');
    if(canReadData()) await syncFromSheet(true,true);
  }
}

async function mutateWithOfflineQueue(kind,payload){
  const service=getSyncServiceRef();
  const result=await service.mutateWithQueue(kind,payload);
  if(result&&result.queued) updateQueueUI();
  return result;
}

function updateUndoPicker(actions=[]){
  const select=document.getElementById('undoSelect');
  const undoBtn=document.getElementById('undoBtn');
  if(!select) return;
  const previous=select.value;
  undoCandidates=Array.isArray(actions)?actions:[];
  renderUndoPicker({
    selectEl:select,
    undoBtn,
    canUndo:canUndoData(),
    actions:undoCandidates,
    previousValue:previous,
    fmtTime,
    escapeHtml,
  });
}

async function loadUndoCandidates(silent=true){
  const select=document.getElementById('undoSelect');
  if(!canUndoData()){
    updateUndoPicker([]);
    return;
  }
  undoCandidatesLoading=true;
  if(select){
    select.innerHTML='<option value="">Loading recent actions...</option>';
    select.disabled=true;
  }
  updateRoleUI();
  try{
    const json=await getUndoServiceRef().listCandidates({limit:15});
    updateUndoPicker(json.actions||[]);
  }catch(err){
    updateUndoPicker([]);
    if(!silent) showToast('Could not load undo actions','error');
  }finally{
    undoCandidatesLoading=false;
    updateRoleUI();
  }
}

function toggleOrderMode(){
  if(!canReadData()){
    showToast('Your role cannot access orders','error');
    return;
  }
  if(!isOrderModeEnabled()){
    showToast('Order mode is disabled in config','info');
    return;
  }
  if(isInboundModeActiveRef()){
    setInboundModeActiveRef(false);
  }
  toggleOutboundOrderModeActiveRef();
  if(isOutboundOrderModeActiveRef()){
    setOutboundTabRef('ready');
    clearOutboundCommitSummaryRef();
  }
  updateRoleUI();
  if(isOutboundOrderModeActiveRef()) loadOrders(true);
  applyFilters();
  updateOutboundUI();
  showToast(isOutboundOrderModeActiveRef()?'Outbound workspace opened':'Outbound workspace closed','info');
}

function toggleOutboundCaptureMode(){
  if(!isOrderModeEnabled()||!canReadData()) return;
  if(!canOrderCommitData()){
    showToast('Your role cannot activate outbound capture mode','error');
    return;
  }
  toggleOutboundCaptureModeRef();
  updateRoleUI();
  applyFilters();
  if(isOutboundOrderModeActiveRef()) updateOutboundUI();
  showToast(isOutboundCaptureModeActiveRef()?'Outbound capture mode enabled':'Outbound capture mode disabled','info');
}

function setOutboundTab(tab){
  if(!['drafts','ready','history'].includes(tab)) return;
  setOutboundTabRef(tab);
  updateOutboundUI();
}

function buildOrderId(){
  const d=new Date();
  return `ORD-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
}

async function writeCreateOrderDraft(line,orderId=''){
  return mutateWithOfflineQueue('createOrderDraft',{
    action:'createOrderDraft',
    orderId:orderId||buildOrderId(),
    line,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writeListOrders(){
  return callAppsScript({action:'listOrders',includeClosed:true});
}

async function writeUpdateOrderLine(orderId,lineId,requestedQty,notes,requestedMode='UNIT',requestedUom='unit'){
  return mutateWithOfflineQueue('updateOrderLine',{
    action:'updateOrderLine',
    orderId,
    lineId,
    requestedQty,
    notes,
    requestedMode,
    requestedUom,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writeCancelOrderLine(orderId,lineId){
  return mutateWithOfflineQueue('cancelOrderLine',{
    action:'cancelOrderLine',
    orderId,
    lineId,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writeCommitOrderFulfillment(orderId,lineId,fulfillQty,allocations){
  if(!navigator.onLine) throw new Error('Final commit requires online mode.');
  return callAppsScript({
    action:'commitOrderFulfillment',
    orderId,
    lineId,
    fulfillQty,
    allocations,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

function syncModeInput(modeInputId,qtyInputId){
  const modeInput=document.getElementById(modeInputId);
  const qtyInput=document.getElementById(qtyInputId);
  if(!modeInput||!qtyInput) return;
  const selectedMode=normalizeRequestedMode(modeInput.value);
  const baseUom=normalizeRequestedUom(modeInput.dataset.baseUom,'BASE');
  const decimalMode=selectedMode==='BASE'&&baseUom==='kg';
  qtyInput.min=decimalMode?'0.1':'1';
  qtyInput.step=decimalMode?'0.1':'1';
}

function updateOutboundUI(){
  const view=getOutboundViewStateRef();
  const wrap=document.getElementById('outboundLinesWrap');
  const summary=document.getElementById('outboundSummary');
  const commitAllBtn=document.getElementById('outboundCommitAllBtn');
  const refreshBtn=document.getElementById('outboundRefreshBtn');
  const resultBox=document.getElementById('outboundRunResult');
  const tabDrafts=document.getElementById('outTabDrafts');
  const tabReady=document.getElementById('outTabReady');
  const tabHistory=document.getElementById('outTabHistory');
  updateOutboundServiceNotice();
  if(!wrap||!summary) return;

  const draftLines=view.draftLines;
  const readyLines=view.readyLines;
  const historyLines=view.historyLines;
  const totalPending=view.totalPending;

  summary.textContent=`Drafts ${draftLines.length} · Ready ${readyLines.length} · History ${historyLines.length} · Pending ${formatOrderNumber(totalPending)}`;
  if(tabDrafts) tabDrafts.classList.toggle('active',view.tab==='drafts');
  if(tabReady) tabReady.classList.toggle('active',view.tab==='ready');
  if(tabHistory) tabHistory.classList.toggle('active',view.tab==='history');

  if(resultBox){
    resultBox.classList.toggle('hidden',!view.commitSummary);
    resultBox.textContent=view.commitSummary;
  }

  if(commitAllBtn){
    const canCommit=canOrderCommitData()&&readyLines.length>0;
    commitAllBtn.disabled=!canCommit||outboundServiceInitFailed;
  }

  if(refreshBtn) refreshBtn.disabled=outboundServiceInitFailed;

  const linesToRender=view.linesToRender;

  if(!linesToRender.length){
    const emptyLabel=view.tab==='history'
      ? 'No outbound history lines yet.'
      : view.tab==='drafts'
        ? 'No draft outbound lines. Add SKUs from inventory cards.'
        : 'No ready lines. Complete allocations in Drafts first.';
    wrap.innerHTML=`<div class="order-empty">${emptyLabel}</div>`;
    updateOrderModeBanner();
    return;
  }

  wrap.innerHTML=renderOutboundLinesHtml({
    view,
    linesToRender,
    rawData,
    orderNumberEps:ORDER_NUMBER_EPS,
    normalizeOrderNumber,
    resolveLineModeContext,
    findLiveLocationsForLine,
    computeAutoAllocation,
    getRowAllocationMeta,
    formatOrderNumber,
    escapeHtml,
    canOrderCommitData,
  });
  updateOrderModeBanner();
}

async function addGroupToOutbound(groupKey,qtyInputId,modeInputId=''){
  if(!requireOrderCommitPermission()) return;
  const group=groups.find(g=>g.key===groupKey);
  if(!group){showToast('SKU not found','error');return;}
  const existing=findDraftLineForGroup(getOrderLinesRef(),group);
  const qtyInput=document.getElementById(qtyInputId);
  const modeInput=modeInputId?document.getElementById(modeInputId):null;
  const requestedMode=normalizeRequestedMode(modeInput?.value||existing?.requestedMode||'UNIT');
  const baseUom=getGroupBaseUom(group);
  const requestedUom=requestedMode==='BASE'
    ? (baseUom||normalizeRequestedUom(existing?.requestedUom,'BASE'))
    : 'unit';
  if(requestedMode==='BASE'&&!requestedUom){
    showToast('Base mode needs consistent qty/unit metadata for this SKU','error');
    return;
  }

  const qtyRaw=String(qtyInput?.value||'').trim();
  const parsedQty=parseFloat(qtyRaw);
  const requestedQty=normalizeOrderNumber(parsedQty);
  if(!Number.isFinite(requestedQty)||requestedQty<=0){showToast('Requested qty must be greater than 0','error');return;}
  if((requestedMode==='UNIT'||requestedUom==='pcs')&&!isWholeOrderNumber(requestedQty)){
    showToast('Requested qty must be a whole number for this mode','error');
    return;
  }

  try{
    const result=await getOutboundServiceRef().createOrUpdateDraft({
      existingLine:existing,
      group,
      requestedQty,
      requestedMode,
      requestedUom,
    });
    const res=result&&result.response?result.response:result;
    if(res&&res.queued){
      showToast(result&&result.operation==='update'?'Offline: outbound update queued':'Offline: added to outbound queue','info');
      return;
    }
    showToast(result&&result.operation==='update'?'Outbound quantity updated':'Added to outbound','success');
    await loadOrders(true);
    updateOutboundUI();
    applyFilters();
  }catch(err){
    showToast(err.message||'Failed to add to outbound','error');
  }
}

function clearOrderConflict(lineId){
  const box=document.getElementById(`orderconf-${lineId}`);
  if(!box) return;
  box.innerHTML='';
  box.classList.add('hidden');
}

function renderOrderConflict(lineId,err){
  const box=document.getElementById(`orderconf-${lineId}`);
  if(!box) return;
  const service=getOutboundServiceRef();
  const looksLikeConflict=!!(err&&typeof err==='object'&&('detail' in err||'parts' in err));
  const conflict=looksLikeConflict
    ? err
    : (service&&typeof service.buildCommitConflict==='function')
      ? service.buildCommitConflict(err)
      : {message:String(err&&err.message||'Commit failed'),detail:''};
  const msg=String(conflict&&conflict.message||'Commit failed');
  let html=`<div><b>${escapeHtml(msg)}</b></div>`;
  const detailText=String(conflict&&conflict.detail||'').trim();
  if(detailText) html+=`<div>${escapeHtml(detailText)}</div>`;
  box.innerHTML=html;
  box.classList.remove('hidden');
}

async function loadOrders(silent=true){
  if(!isOrderModeEnabled()||!canReadData()) return;
  try{
    const res=await getOutboundServiceRef().listOrders();
    setOrderLinesRef(Array.isArray(res.orders)?res.orders:[]);
    updateOutboundUI();
    applyFilters();
  }catch(err){
    if(!silent) showToast(err.message||'Failed to load orders','error');
  }
}


async function saveOrderLine(orderId,lineId){
  if(!requireOrderCommitPermission()) return;
  const modeEl=document.getElementById(`ordermode-${lineId}`);
  const selectedMode=normalizeRequestedMode(modeEl?.value||'UNIT');
  const fallbackBaseUom=String(modeEl?.dataset?.baseUom||'').trim().toLowerCase();
  const selectedUom=selectedMode==='BASE'
    ? (normalizeRequestedUom(fallbackBaseUom,'BASE')||'')
    : 'unit';
  if(selectedMode==='BASE'&&!selectedUom){showToast('Base mode unavailable for this line','error');return;}

  const qtyRaw=String(document.getElementById(`orderqty-${lineId}`)?.value||'').trim();
  const qty=normalizeOrderNumber(parseFloat(qtyRaw));
  const notes=String(document.getElementById(`ordernote-${lineId}`)?.value||'').trim();
  if(!Number.isFinite(qty)||qty<=0){showToast('Requested qty must be greater than 0','error');return;}
  if((selectedMode==='UNIT'||selectedUom==='pcs')&&!isWholeOrderNumber(qty)){
    showToast('Requested qty must be a whole number for this mode','error');
    return;
  }
  try{
    const res=await getOutboundServiceRef().saveLine({
      orderId,
      lineId,
      qty,
      notes,
      requestedMode:selectedMode,
      requestedUom:selectedUom,
    });
    if(res&&res.queued){
      showToast('Offline: order line update queued','info');
      return;
    }
    showToast('Order line updated','success');
    await loadOrders(true);
  }catch(err){
    showToast(err.message||'Failed to update order line','error');
  }
}

async function cancelOrderLine(orderId,lineId){
  if(!requireOrderCommitPermission()) return;
  if(!window.confirm('Cancel this order line?')) return;
  try{
    const res=await getOutboundServiceRef().cancelLine({orderId,lineId});
    if(res&&res.queued){
      showToast('Offline: cancel queued','info');
      return;
    }
    showToast('Order line cancelled','success');
    await loadOrders(true);
  }catch(err){
    showToast(err.message||'Failed to cancel order line','error');
  }
}

function collectLineCommitPayload(lineId){
  const line=getOrderLinesRef().find(l=>l.lineId===lineId);
  if(!line) return {allocations:[],total:0,modeCtx:resolveLineModeContext(null,null)};
  const skuRows=rawData.filter(r=>r.type===line.type&&r.size===line.size&&r.packetType===line.packet);
  const modeCtx=resolveLineModeContext(line,{locations:skuRows});
  const inputs=Array.from(document.querySelectorAll(`.order-alloc-input[data-line-id="${lineId}"]`));
  const allocations=[];
  let total=0;
  inputs.forEach(inp=>{
    const raw=String(inp.value||'').trim();
    const parsedQty=parseFloat(raw);
    const qty=normalizeOrderNumber(parsedQty);
    const validQty=modeCtx.numericMode==='decimal'
      ? Number.isFinite(qty)&&qty>0
      : Number.isFinite(qty)&&qty>0&&isWholeOrderNumber(qty);
    if(validQty){
      const row=parseInt(inp.dataset.row,10);
      const dataRow=rawData.find(r=>r.rowNum===row);
      if(!dataRow) return;
      total=normalizeOrderNumber(total+qty);
      allocations.push({
        row,
        qty,
        warehouse:dataRow.warehouse,
        floor:dataRow.floor,
        location:dataRow.location,
        expectedVersion:dataRow.version,
      });
    }
  });
  return {allocations,total,modeCtx};
}

async function commitOrderLine(orderId,lineId,remaining,opts={}){
  const options={skipConfirm:false,skipRefresh:false,silent:false,...opts};
  if(!requireOrderCommitPermission()) return;
  if(!navigator.onLine){if(!options.silent) showToast('Final commit requires online mode','error'); return {success:false,error:new Error('Offline')};}
  const line=getOrderLinesRef().find(l=>l.orderId===orderId&&l.lineId===lineId);
  if(!line){if(!options.silent) showToast('Order line not found','error'); return {success:false,error:new Error('Order line not found')};}

  clearOrderConflict(lineId);
  const {allocations,total,modeCtx}=collectLineCommitPayload(lineId);
  const service=getOutboundServiceRef();
  const commitResult=await service.orchestrateCommitLine({
    orderId,
    lineId,
    line,
    remaining,
    allocations,
    total,
    modeCtx,
    options,
    confirmMessage:`Commit fulfillment of ${formatOrderNumber(total)} for ${line.type} ${line.size}?`,
    confirmFn:(message)=>window.confirm(message),
    eps:ORDER_NUMBER_EPS,
  });

  if(commitResult&&commitResult.cancelled) return {success:false,cancelled:true};

  if(!commitResult||!commitResult.success){
    const conflict=commitResult&&commitResult.conflict?commitResult.conflict:null;
    if(conflict) renderOrderConflict(lineId,conflict);
    const message=String(commitResult&&commitResult.message||commitResult&&commitResult.error&&commitResult.error.message||'Commit failed');
    if(!options.silent&&message) showToast(message,'error');
    return {success:false,error:commitResult&&commitResult.error?commitResult.error:new Error(message)};
  }

  if(!options.silent) showToast('Order fulfillment committed','success');
  if(!options.skipRefresh){
    await syncFromSheet(true,true);
    await loadOrders(true);
  }
  return {success:true,total:commitResult.total};
}

async function commitAllOutbound(){
  if(!requireOrderCommitPermission()) return;
  if(!navigator.onLine){showToast('Final commit requires online mode','error');return;}
  if(getOutboundTabRef()!=='ready'){
    setOutboundTabRef('ready');
    updateOutboundUI();
  }
  const lines=getOutboundReadyLinesRef();
  if(!lines.length){showToast('No ready outbound lines','info');return;}
  if(!window.confirm(`Commit all ready outbound lines (${lines.length})?`)) return;

  let succeeded=0;
  let failed=0;
  for(const line of lines){
    const remaining=Math.max(0,normalizeOrderNumber((line.requestedQty||0)-(line.fulfilledQty||0)));
    const res=await commitOrderLine(line.orderId,line.lineId,remaining,{skipConfirm:true,skipRefresh:true,silent:true});
    if(res&&res.success) succeeded+=1;
    else failed+=1;
  }

  await syncFromSheet(true,true);
  await loadOrders(true);
  setOutboundCommitSummaryRef(`Commit All completed: ${succeeded} succeeded, ${failed} failed. ${failed?'Review conflicts and retry failed lines.':''}`.trim());
  updateOutboundUI();
  showToast(getOutboundCommitSummaryRef(),failed?'info':'success',{duration:3500});
}

function getTodayDateKey(){
  const now=new Date();
  const y=now.getFullYear();
  const m=String(now.getMonth()+1).padStart(2,'0');
  const d=String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function getMinReceiptDateKey(){
  const date=new Date();
  date.setDate(date.getDate()-RECEIPT_BACKDATE_DAYS);
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function setInboundTab(tab){
  if(!['drafts','posted','history'].includes(tab)) return;
  setInboundTabRef(tab);
  updateInboundUI();
}

function toggleInboundMode(){
  if(!canReadData()){
    showToast('Your role cannot access inbound workspace','error');
    return;
  }
  if(!isOrderModeEnabled()){
    showToast('Order mode is disabled in config','info');
    return;
  }
  if(!canOrderCommitData()){
    showToast('Your role cannot modify inbound receipts','error');
    return;
  }

  if(isOutboundOrderModeActiveRef()){
    setOutboundOrderModeActiveRef(false);
    setOutboundCaptureModeRef(false);
  }
  toggleInboundModeActiveRef();
  if(isInboundModeActiveRef()){
    setInboundTabRef('drafts');
    clearInboundPostSummaryRef();
    loadReceipts(true);
  }
  updateRoleUI();
  applyFilters();
  updateInboundUI();
  showToast(isInboundModeActiveRef()?'Inbound workspace opened':'Inbound workspace closed','info');
}

async function writeCreateReceiptDraft(line,receiptId=''){
  return mutateWithOfflineQueue('createReceiptDraft',{
    action:'createReceiptDraft',
    receiptId:receiptId||'',
    line,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writeListReceipts(){
  return callAppsScript({action:'listReceipts',includeClosed:true});
}

async function writeUpdateReceiptLine(receiptId,lineId,line){
  return mutateWithOfflineQueue('updateReceiptLine',{
    action:'updateReceiptLine',
    receiptId,
    lineId,
    line,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writeCancelReceiptLine(receiptId,lineId){
  return mutateWithOfflineQueue('cancelReceiptLine',{
    action:'cancelReceiptLine',
    receiptId,
    lineId,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

async function writePostReceipt(receiptId,lineId){
  if(!navigator.onLine) throw new Error('Final post requires online mode.');
  return callAppsScript({
    action:'postReceipt',
    receiptId,
    lineId,
    requestId:generateRequestId(),
    actor:getActorName(),
  });
}

function readInboundFormLine(){
  return {
    type:String(document.getElementById('inboundTypeInput')?.value||'').trim(),
    size:String(document.getElementById('inboundSizeInput')?.value||'').trim(),
    details:String(document.getElementById('inboundDetailsInput')?.value||'').trim(),
    packet:String(document.getElementById('inboundPacketInput')?.value||'').trim(),
    warehouse:String(document.getElementById('inboundWarehouseInput')?.value||'').trim(),
    floor:String(document.getElementById('inboundFloorInput')?.value||'').trim(),
    location:String(document.getElementById('inboundLocationInput')?.value||'').trim(),
    receivedQty:String(document.getElementById('inboundQtyInput')?.value||'').trim(),
    receiptDate:String(document.getElementById('inboundDateInput')?.value||'').trim(),
    qtyPerUnit:String(document.getElementById('inboundQpuInput')?.value||'').trim(),
    unit:String(document.getElementById('inboundUnitInput')?.value||'').trim().toLowerCase(),
    looseQty:String(document.getElementById('inboundLooseInput')?.value||'').trim(),
    notes:String(document.getElementById('inboundNotesInput')?.value||'').trim(),
  };
}

function resetInboundDraftForm(){
  const fields={
    inboundTypeInput:'',
    inboundSizeInput:'',
    inboundDetailsInput:'',
    inboundPacketInput:'Box',
    inboundWarehouseInput:getWarehouseOptions()[0]||'J1',
    inboundFloorInput:getFloorOptions()[0]||'GF',
    inboundLocationInput:'',
    inboundQtyInput:'1',
    inboundDateInput:getTodayDateKey(),
    inboundQpuInput:'',
    inboundUnitInput:'',
    inboundLooseInput:'0',
    inboundNotesInput:'',
  };
  Object.keys(fields).forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value=fields[id];
  });
}

function collectInboundLineFromInputs(lineId){
  return {
    type:String(document.getElementById(`rec-type-${lineId}`)?.value||'').trim(),
    size:String(document.getElementById(`rec-size-${lineId}`)?.value||'').trim(),
    details:String(document.getElementById(`rec-details-${lineId}`)?.value||'').trim(),
    packet:String(document.getElementById(`rec-packet-${lineId}`)?.value||'').trim(),
    warehouse:String(document.getElementById(`rec-wh-${lineId}`)?.value||'').trim(),
    floor:String(document.getElementById(`rec-floor-${lineId}`)?.value||'').trim(),
    location:String(document.getElementById(`rec-loc-${lineId}`)?.value||'').trim(),
    receivedQty:String(document.getElementById(`rec-qty-${lineId}`)?.value||'').trim(),
    receiptDate:String(document.getElementById(`rec-date-${lineId}`)?.value||'').trim(),
    qtyPerUnit:String(document.getElementById(`rec-qpu-${lineId}`)?.value||'').trim(),
    unit:String(document.getElementById(`rec-unit-${lineId}`)?.value||'').trim().toLowerCase(),
    looseQty:String(document.getElementById(`rec-loose-${lineId}`)?.value||'').trim(),
    notes:String(document.getElementById(`rec-note-${lineId}`)?.value||'').trim(),
  };
}

function updateInboundUI(){
  const view=getInboundViewStateRef();
  const wrap=document.getElementById('inboundLinesWrap');
  const summary=document.getElementById('inboundSummary');
  const postAllBtn=document.getElementById('inboundPostAllBtn');
  const refreshBtn=document.getElementById('inboundRefreshBtn');
  const resultBox=document.getElementById('inboundRunResult');
  const tabDrafts=document.getElementById('inTabDrafts');
  const tabPosted=document.getElementById('inTabPosted');
  const tabHistory=document.getElementById('inTabHistory');
  const inboundDateInput=document.getElementById('inboundDateInput');
  const minDate=getMinReceiptDateKey();
  const maxDate=getTodayDateKey();
  updateInboundServiceNotice();
  if(!wrap||!summary) return;

  if(inboundDateInput){
    inboundDateInput.min=minDate;
    inboundDateInput.max=maxDate;
    if(!String(inboundDateInput.value||'').trim()) inboundDateInput.value=maxDate;
  }

  summary.textContent=`Drafts ${view.draftLines.length} · Posted ${view.postedLines.length} · History ${view.historyLines.length} · Pending ${formatOrderNumber(view.totalPending)}`;
  if(tabDrafts) tabDrafts.classList.toggle('active',view.tab==='drafts');
  if(tabPosted) tabPosted.classList.toggle('active',view.tab==='posted');
  if(tabHistory) tabHistory.classList.toggle('active',view.tab==='history');

  if(resultBox){
    resultBox.classList.toggle('hidden',!view.postSummary);
    resultBox.textContent=view.postSummary;
  }

  if(postAllBtn){
    postAllBtn.disabled=!canOrderCommitData()||!view.draftLines.length||inboundServiceInitFailed;
  }
  if(refreshBtn) refreshBtn.disabled=inboundServiceInitFailed;

  if(!view.linesToRender.length){
    const emptyLabel=view.tab==='history'
      ? 'No inbound history lines yet.'
      : view.tab==='posted'
        ? 'No posted inbound receipts yet.'
        : 'No inbound draft lines. Use the form above to create one.';
    wrap.innerHTML=`<div class="order-empty">${emptyLabel}</div>`;
    updateOrderModeBanner();
    return;
  }

  wrap.innerHTML=renderInboundLinesHtml({
    view,
    linesToRender:view.linesToRender,
    minDate,
    maxDate,
    escapeHtml,
    canOrderCommitData,
  });
  updateOrderModeBanner();
}

async function loadReceipts(silent=true){
  if(!isOrderModeEnabled()||!canReadData()) return;
  try{
    const res=await getInboundServiceRef().listReceipts();
    setReceiptLinesRef(Array.isArray(res.receipts)?res.receipts:[]);
    updateInboundUI();
  }catch(err){
    if(!silent) showToast(err.message||'Failed to load receipts','error');
  }
}

async function createReceiptDraft(){
  if(!requireOrderCommitPermission()) return;
  try{
    const service=getInboundServiceRef();
    const result=await service.createDraft(readInboundFormLine());
    if(!result.success){
      showToast(result.message||'Could not create receipt draft','error');
      return;
    }
    const res=result.response||{};
    if(res.queued){
      showToast('Offline: inbound draft queued','info');
      return;
    }
    showToast('Inbound draft created','success');
    resetInboundDraftForm();
    await loadReceipts(true);
  }catch(err){
    showToast(err.message||'Could not create receipt draft','error');
  }
}

async function saveReceiptLine(receiptId,lineId){
  if(!requireOrderCommitPermission()) return;
  try{
    const payload=collectInboundLineFromInputs(lineId);
    const result=await getInboundServiceRef().saveLine({receiptId,lineId,...payload});
    if(!result.success){
      showToast(result.message||'Could not update receipt line','error');
      return;
    }
    if(result.response&&result.response.queued){
      showToast('Offline: inbound update queued','info');
      return;
    }
    showToast('Inbound line updated','success');
    await loadReceipts(true);
  }catch(err){
    showToast(err.message||'Could not update receipt line','error');
  }
}

async function cancelReceiptLineAction(receiptId,lineId){
  if(!requireOrderCommitPermission()) return;
  if(!window.confirm('Cancel this receipt draft line?')) return;
  try{
    const result=await getInboundServiceRef().cancelLine({receiptId,lineId});
    if(!result.success){
      showToast(result.message||'Could not cancel receipt line','error');
      return;
    }
    if(result.response&&result.response.queued){
      showToast('Offline: inbound cancel queued','info');
      return;
    }
    showToast('Inbound draft cancelled','success');
    await loadReceipts(true);
  }catch(err){
    showToast(err.message||'Could not cancel receipt line','error');
  }
}

async function postReceiptLine(receiptId,lineId,opts={}){
  const options={skipRefresh:false,silent:false,...opts};
  if(!requireOrderCommitPermission()) return {success:false};
  if(!navigator.onLine){
    if(!options.silent) showToast('Final post requires online mode','error');
    return {success:false,error:new Error('Offline')};
  }
  const line=getReceiptLinesRef().find(l=>l.receiptId===receiptId&&l.lineId===lineId);
  if(!line){
    if(!options.silent) showToast('Receipt line not found','error');
    return {success:false,error:new Error('Receipt line not found')};
  }

  const result=await getInboundServiceRef().orchestratePostLine({
    receiptId,
    lineId,
    receiptDate:line.receiptDate,
  });
  if(!result.success){
    if(!options.silent) showToast(result.message||'Receipt post failed','error');
    return {success:false,error:result.error||new Error(result.message||'Receipt post failed')};
  }

  if(!options.silent) showToast('Inbound receipt posted','success');
  if(!options.skipRefresh){
    await syncFromSheet(true,true);
    await loadReceipts(true);
  }
  return {success:true};
}

async function postAllInbound(){
  if(!requireOrderCommitPermission()) return;
  if(!navigator.onLine){showToast('Final post requires online mode','error');return;}
  if(getInboundTabRef()!=='drafts'){
    setInboundTabRef('drafts');
    updateInboundUI();
  }
  const lines=getInboundDraftLinesRef();
  if(!lines.length){showToast('No inbound draft lines','info');return;}
  if(!window.confirm(`Post all inbound draft lines (${lines.length})?`)) return;

  let succeeded=0;
  let failed=0;
  for(const line of lines){
    const res=await postReceiptLine(line.receiptId,line.lineId,{skipRefresh:true,silent:true});
    if(res&&res.success) succeeded+=1;
    else failed+=1;
  }

  await syncFromSheet(true,true);
  await loadReceipts(true);
  setInboundPostSummaryRef(`Post All completed: ${succeeded} succeeded, ${failed} failed. ${failed?'Review failed lines and retry.':''}`.trim());
  updateInboundUI();
  showToast(getInboundPostSummaryRef(),failed?'info':'success',{duration:3500});
}

async function unlockApp(){
  const userInput=document.getElementById('lockUser');
  const input=document.getElementById('lockInput'),errEl=document.getElementById('lockError');
  const username=String(userInput?.value||'').trim().toLowerCase();
  const pwd=input.value;
  if(!username){errEl.textContent='Please enter your username.';return;}
  if(!pwd){errEl.textContent='Please enter a password.';return;}
  input.disabled=true;
  if(userInput) userInput.disabled=true;
  errEl.textContent='Authenticating…';
  try{
    const res=await fetch(CONFIG.APPS_SCRIPT_URL,{
      method:'POST',redirect:'follow',
      headers:{'Content-Type':'text/plain'},
      body:JSON.stringify({action:'authenticate',username,password:pwd}),
    });
    const json=await res.json();
    if(json.success&&json.token){
      saveSession(json.token);
      try{
        if(json.actor) localStorage.setItem('wh_actor_name',json.actor);
      }catch(e){}
      document.getElementById('lockScreen').classList.add('hidden');
      document.getElementById('appShell').style.display='block';
      errEl.textContent='';
      if(isConfigured){
        await loadRuntimeConfig();
        if(canReadData()) syncFromSheet(true);
      }
    } else {
      input.classList.add('error');errEl.textContent=json.error||'Incorrect password.';
      input.value='';setTimeout(()=>input.classList.remove('error'),600);
    }
  }catch(err){
    errEl.textContent='Network error — please try again.';
  }finally{input.disabled=false;if(userInput) userInput.disabled=false;}
}

function generateRequestId(){
  return `req_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

function getActorName(){
  try{
    return localStorage.getItem('wh_actor_name')||'web-user';
  }catch(e){
    return 'web-user';
  }
}

function isHighImpactDelta(currentStock, delta){
  if(!Number.isFinite(currentStock)||currentStock<=0) return false;
  return Math.abs(delta)>currentStock*0.3;
}

function withMutationMeta(row, payload, extraExpected={}){
  return {
    ...payload,
    expectedVersion:row?row.version:null,
    ...extraExpected,
    requestId:generateRequestId(),
    actor:getActorName(),
  };
}

function isRetryableError(err){
  const code=String(err?.code||'').toUpperCase();
  const msg=String(err?.message||'').toLowerCase();
  if(code==='AUTH_REQUIRED'||code==='CONFLICT') return false;
  if(msg.includes('session expired')||msg.includes('missing session token')) return false;
  if(msg.includes('conflict:')||msg.includes('invalid')||msg.includes('required')) return false;
  return true;
}

function checkConfig(){
  return CONFIG.APPS_SCRIPT_URL!=="YOUR_APPS_SCRIPT_URL_HERE";
}

// ── Sync ──
async function syncFromSheet(silent=false,force=false){
  const uiState=getAppStateRef();
  if(!isConfigured) return;
  if(!canReadData()) return;
  if(isOfflineQueueEnabled()&&canWriteData()) await processOfflineQueue(true);
    if(uiState.modal.isOpen&&!force){uiState.modal.pendingAutoRefresh=true;return;}
  const syncServiceRef=getSyncServiceRef();
  const syncBtn=document.getElementById('syncBtn'),syncDot=document.getElementById('syncDot');
  const errEl=document.getElementById('errorState');
  syncBtn.classList.add('syncing');syncDot.className='sync-dot syncing';errEl.classList.remove('visible');
  try{
    const snapshot=await syncServiceRef.fetchInventoryData();
    const nextState=syncServiceRef.buildInventoryState(snapshot,{parseRows,groupRows});
    rawData=nextState.rawData;
    groups=nextState.groups;
    allComments=nextState.allComments;
    rebuildTypeFilters();applyFilters();updateStats();
    document.getElementById('syncTime').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    syncDot.className='sync-dot';
    document.getElementById('loadingState').style.display='none';
    uiState.modal.pendingAutoRefresh=false;
    if(isOutboundOrderModeActiveRef()&&isOrderModeEnabled()&&canReadData()) await loadOrders(true);
    if(isInboundModeActiveRef()&&isOrderModeEnabled()&&canReadData()) await loadReceipts(true);
    if(canUndoData()) await loadUndoCandidates(true);
    if(!silent) showToast('Data refreshed','success');
  }catch(err){
    syncDot.className='sync-dot offline';
    const isAuth=err.message.toLowerCase().includes('session');
    document.getElementById('errorMsg').textContent=err.message+(isAuth?' — please login again.':' — check your connection.');
    if(isAuth){
      clearSession();
      document.getElementById('appShell').style.display='none';
      document.getElementById('lockScreen').classList.remove('hidden');
      document.getElementById('lockError').textContent='Session expired. Please unlock again.';
    }
    errEl.classList.add('visible');
    document.getElementById('loadingState').style.display='none';
    if(!silent) showToast('Sync failed','error');
  }finally{syncBtn.classList.remove('syncing');}
}

async function loadRuntimeConfig(silent=true){
  const uiState=getAppStateRef();
  if(!isConfigured) return;
  try{
    const syncServiceRef=getSyncServiceRef();
    const runtimeConfig=syncServiceRef.buildRuntimeConfigState(
      await syncServiceRef.fetchRuntimeConfig(),
      {
        defaultWarehouses:CONFIG.DEFAULT_WAREHOUSES,
        defaultFloors:CONFIG.DEFAULT_FLOORS,
      }
    );

    runtimeWarehouses=runtimeConfig.warehouses;
    runtimeFloors=runtimeConfig.floors;
    runtimeSearchAliases=runtimeConfig.searchAliases;
    setFeatureFlagsRef(runtimeConfig.featureFlags);
    setCurrentRoleRef(runtimeConfig.role);
    setCurrentPermissionsRef(runtimeConfig.permissions);
    updateRoleUI();
    updateQueueUI();

    if(uiState.filters.warehouse!=='ALL'&&!runtimeWarehouses.includes(uiState.filters.warehouse)) uiState.filters.warehouse='ALL';
    if(uiState.filters.floor!=='ALL'&&!runtimeFloors.includes(uiState.filters.floor)) uiState.filters.floor='ALL';

    renderWarehouseFilterChips();
    renderFloorFilterChips();
    renderInboundFormOptions();
    updateFilterBadge();
    if(isOutboundOrderModeActiveRef()&&isOrderModeEnabled()&&canReadData()) await loadOrders(true);
    if(isInboundModeActiveRef()&&isOrderModeEnabled()&&canReadData()) await loadReceipts(true);
    if(canUndoData()) await loadUndoCandidates(true);
  }catch(err){
    if(!silent) showToast('Config sync failed','error');
    renderWarehouseFilterChips();
    renderFloorFilterChips();
    renderInboundFormOptions();
  }
}

// ── Apps Script writes ──
async function callAppsScript(payload){
  return getApiClientRef().call(payload);
}

async function writeRowFields(rowNum,fields){
  if(!requireWritePermission()) throw new Error('Read-only role');
  const row=rawData.find(r=>r.rowNum===rowNum);
  return mutateWithOfflineQueue('updateRowFields',withMutationMeta(row,{
    action:'updateRowFields',
    row:rowNum,
    fields,
  },{
    expectedOld:{
      stock:row?row.stock:null,
      qty:row?row.qtyPerUnit:null,
      unit:row?row.unit:null,
      warehouse:row?row.warehouse:null,
      floor:row?row.floor:null,
      location:row?row.location:null,
    },
  }));
}

async function writeSplitMove(row,payload){
  if(!requireWritePermission()) throw new Error('Read-only role');
  return mutateWithOfflineQueue('splitMove',withMutationMeta(row,{
    action:'splitMove',
    row:row.rowNum,
    keepStock:payload.keepStock,
    moveStock:payload.moveStock,
    newLocation:payload.newLoc,
    newQty:payload.newQty,
    newUnit:payload.newUnit,
    newPacket:payload.newPacket,
  }));
}

async function writeUpdateLooseQty(row,looseQty){
  if(!requireWritePermission()) throw new Error('Read-only role');
  return mutateWithOfflineQueue('updateLooseQty',withMutationMeta(row,{
    action:'updateLooseQty',
    row:row.rowNum,
    looseQty,
  }));
}

async function writeTransferLooseQty(row,transferQty,destination){
  if(!requireWritePermission()) throw new Error('Read-only role');
  return mutateWithOfflineQueue('transferLooseQty',withMutationMeta(row,{
    action:'transferLooseQty',
    sourceRow:row.rowNum,
    transferQty,
    destination,
  }));
}

async function appendRow(rowData){
  if(!requireWritePermission()) throw new Error('Read-only role');
  await mutateWithOfflineQueue('appendRow',{action:'appendRow',rowData,requestId:generateRequestId(),actor:getActorName()});
}

async function writeComment(type,size,comment,author){
  if(!requireWritePermission()) throw new Error('Read-only role');
  return getCommentsServiceRef().addComment({
    item:type,
    size,
    comment,
    author:author||'Anonymous',
  });
}

async function writeUndoLast(targetRequestId=''){
  if(!requireUndoPermission()) throw new Error('Undo not allowed');
  return getUndoServiceRef().executeUndo({targetRequestId});
}

// ── Filters ──
function rebuildTypeFilters(){
  const filters=getFiltersRef();
  const c=document.getElementById('typeChips');
  const types=['ALL',...Array.from(new Set(groups.map(g=>g.type).filter(Boolean))).sort()];
  renderTypeFilterChips({
    wrapEl:c,
    types,
    activeType:filters.type,
    onSelect:setTypeFilter,
  });
}

function renderWarehouseFilterChips(){
  const filters=getFiltersRef();
  const wrap=document.getElementById('whChips');
  if(!wrap) return;
  const values=['ALL',...getWarehouseOptions()];
  renderFilterChipGroup({
    wrapEl:wrap,
    values,
    activeValue:filters.warehouse,
    allValue:'ALL',
    allLabel:'All',
    onSelect:setWhFilter,
  });
}

function renderFloorFilterChips(){
  const filters=getFiltersRef();
  const wrap=document.getElementById('flChips');
  if(!wrap) return;
  const values=['ALL',...getFloorOptions()];
  renderFilterChipGroup({
    wrapEl:wrap,
    values,
    activeValue:filters.floor,
    allValue:'ALL',
    allLabel:'All',
    onSelect:setFloorFilter,
  });
}

function renderInboundFormOptions(){
  const whSelect=document.getElementById('inboundWarehouseInput');
  const floorSelect=document.getElementById('inboundFloorInput');
  if(whSelect){
    const current=String(whSelect.value||'').trim();
    const values=getWarehouseOptions();
    whSelect.innerHTML=values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    whSelect.value=values.includes(current)?current:(values[0]||'');
  }
  if(floorSelect){
    const current=String(floorSelect.value||'').trim();
    const values=getFloorOptions();
    floorSelect.innerHTML=values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    floorSelect.value=values.includes(current)?current:(values[0]||'');
  }
}

function setTypeFilter(el){
  document.querySelectorAll('#typeChips .fp-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');updateFiltersRef({type:el.dataset.type});applyFilters();updateFilterBadge();
}

function setWhFilter(mode){
  if(mode!=='ALL'&&!getWarehouseOptions().includes(mode)) mode='ALL';
  updateFiltersRef({warehouse:mode});
  renderWarehouseFilterChips();
  applyFilters();updateFilterBadge();
}

function setFloorFilter(mode){
  if(mode!=='ALL'&&!getFloorOptions().includes(mode)) mode='ALL';
  updateFiltersRef({floor:mode});
  renderFloorFilterChips();
  applyFilters();updateFilterBadge();
}

function setStockFilter(mode){
  updateFiltersRef({stock:mode});
  ['sfAll','sfIn','sfLow','sfOut'].forEach(id=>document.getElementById(id).className='fp-chip');
  const map={ALL:'active-blue',IN:'active-green',LOW:'active-yellow',OUT:'active-red'};
  document.getElementById({ALL:'sfAll',IN:'sfIn',LOW:'sfLow',OUT:'sfOut'}[mode]).classList.add(map[mode]);
  applyFilters();updateFilterBadge();
}

function setPacketFilter(mode){
  updateFiltersRef({packet:mode});
  ['ptAll','ptBox','ptJute','ptPacket'].forEach(id=>document.getElementById(id).classList.remove('active-blue'));
  document.getElementById({ALL:'ptAll',Box:'ptBox','Jute Bag':'ptJute',Packet:'ptPacket'}[mode]).classList.add('active-blue');
  applyFilters();updateFilterBadge();
}

function toggleAttention(){
  const filters=getFiltersRef();
  const next=!filters.attentionOnly;
  updateFiltersRef({attentionOnly:next});
  document.getElementById('attnChip').classList.toggle('active',next);
  applyFilters();updateFilterBadge();
}

function clearAllFilters(){
  resetFiltersRef({
    type:'ALL',
    stock:'ALL',
    packet:'ALL',
    warehouse:'ALL',
    floor:'ALL',
    attentionOnly:false,
    search:'',
    location:'',
    sort:'stock-desc',
  });
  document.getElementById('locationInput').value='';
  document.getElementById('searchInput').value='';
  document.getElementById('clearBtn').classList.remove('visible');
  rebuildTypeFilters();setStockFilter('ALL');setPacketFilter('ALL');setWhFilter('ALL');setFloorFilter('ALL');
  document.getElementById('attnChip').classList.remove('active');
  applyFilters();updateFilterBadge();
}

function updateFilterBadge(){
  const filters=getFiltersRef();
  const n=[filters.stock!=='ALL',filters.packet!=='ALL',filters.warehouse!=='ALL',
    filters.floor!=='ALL',filters.attentionOnly,!!filters.location
  ].filter(Boolean).length;
  const btn=document.getElementById('filterToggleBtn'),badge=document.getElementById('filterBadge');
  btn.classList.toggle('has-filters',n>0);badge.textContent=n>0?`(${n})`:'';
}

function toggleFilterPanel(){document.getElementById('filterPanel').classList.toggle('open');}

function syncFilterInputStateFromUI(){
  const searchInput=document.getElementById('searchInput');
  const locationInput=document.getElementById('locationInput');
  const sortSelect=document.getElementById('sortSelect');
  updateFiltersRef({
    search:(searchInput?.value||'').trim(),
    location:(locationInput?.value||'').trim(),
    sort:(sortSelect?.value||'stock-desc'),
  });
}

document.getElementById('searchInput').addEventListener('input',function(){
  updateFiltersRef({search:this.value.trim()});
  document.getElementById('clearBtn').classList.toggle('visible',this.value.length>0);applyFilters();
});

function clearSearch(){
  updateFiltersRef({search:''});
  document.getElementById('searchInput').value='';
  document.getElementById('clearBtn').classList.remove('visible');applyFilters();
}

function toggleDetailVariants(groupKey){
  if(!groupKey) return;
  if(detailExpandedKeys.has(groupKey)) detailExpandedKeys.delete(groupKey);
  else detailExpandedKeys.add(groupKey);
  applyFilters();
}

function applyFilters(){
  const filters=getFiltersRef();
  syncFilterInputStateFromUI();
  const q=filters.search.toLowerCase();
  const loc=filters.location.toLowerCase();
  const sort=filters.sort;
  const cCounts={};
  allComments.forEach(c=>{const k=`${c.item}||${c.size}`;cCounts[k]=(cCounts[k]||0)+1;});

  filtered=groups.filter(g=>{
    if(filters.type!=='ALL'&&g.type!==filters.type) return false;
    if(filters.packet!=='ALL'&&g.packetType!==filters.packet) return false;
    if(filters.warehouse!=='ALL'&&!g.locations.some(r=>r.warehouse===filters.warehouse)) return false;
    if(filters.floor!=='ALL'&&!g.locations.some(r=>r.floor===filters.floor)) return false;
    const relStock=(filters.warehouse==='ALL'&&filters.floor==='ALL')
      ? g.totalStock
      : g.locations.filter(r=>(filters.warehouse==='ALL'||r.warehouse===filters.warehouse)&&(filters.floor==='ALL'||r.floor===filters.floor)).reduce((s,r)=>s+r.stock,0);
    if(filters.stock==='IN'&&relStock===0) return false;
    if(filters.stock==='OUT'&&relStock>0) return false;
    if(filters.stock==='LOW'&&(relStock===0||relStock>CONFIG.LOW_STOCK_THRESHOLD)) return false;
    if(filters.attentionOnly&&!g.hasNotes&&!cCounts[`${g.type}||${g.size}`]) return false;
    if(loc&&!g.locations.some(r=>r.location.toLowerCase().includes(loc))) return false;
    if(q){
      const hay=[g.type,g.size,g.packetType,...g.locations.map(r=>r.details+' '+r.location+' '+r.warehouse+' '+r.floor)].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a,b)=>{
    if(sort==='stock-desc') return b.totalStock-a.totalStock;
    if(sort==='stock-asc')  return a.totalStock-b.totalStock;
    if(sort==='size-asc')   return a.size.localeCompare(b.size);
    if(sort==='type-asc')   return a.type.localeCompare(b.type)||a.size.localeCompare(b.size);
    return 0;
  });
  renderList(cCounts);
}

function updateStats(){
  document.getElementById('statTotal').textContent  =groups.length;
  document.getElementById('statInStock').textContent=groups.filter(g=>g.totalStock>0).length;
  document.getElementById('statLow').textContent    =groups.filter(g=>g.totalStock>0&&g.totalStock<=CONFIG.LOW_STOCK_THRESHOLD).length;
  document.getElementById('statOut').textContent    =groups.filter(g=>g.totalStock===0).length;
}

// ── Render list ──
function renderList(cCounts={}){
  const captureActive=isOutboundCaptureModeActiveRef();
  const list=document.getElementById('inventoryList'),empty=document.getElementById('emptyState');
  if(!isConfigured) return;
  document.getElementById('resultsCount').innerHTML=`Showing <span>${filtered.length}</span> of ${groups.length} SKUs`;
  if(filtered.length===0&&groups.length>0){list.innerHTML='';empty.classList.add('visible');return;}
  empty.classList.remove('visible');

  list.innerHTML=filtered.map((g,idx)=>{
    const sc=stockClass(g.totalStock);
    const multi=g.locations.length>1;
    const cKey=`${g.type}||${g.size}`,cCount=cCounts[cKey]||0;
    const draftLine=findDraftLineForGroup(getOrderLinesRef(),g);
    const pendingQty=draftLine?Math.max(0,normalizeOrderNumber((draftLine.requestedQty||0)-(draftLine.fulfilledQty||0))):0;
    const qtyInputId=`outqty-${idx}`;
    const modeInputId=`outmode-${idx}`;
    const modeCtx=resolveLineModeContext(draftLine||{},g);
    const detailVariants=getGroupDetailVariants(g);
    const detailsExpanded=detailExpandedKeys.has(g.key);
    const visibleDetails=detailsExpanded?detailVariants:detailVariants.slice(0,2);
    const hiddenDetailCount=Math.max(0,detailVariants.length-visibleDetails.length);
    const whBadges=[...g.warehouses].map(w=>`<div class="item-badge-wh ${escapeHtml(w)}">${escapeHtml(w)}</div>`).join('');
    const isPacket=g.packetType==='Packet';
    const qtyTotals=computeQtyTotals(g.locations);
    const qtySummary=fmtQtyTotals(qtyTotals);
    const locPills=g.locations.map(r=>`<div class="loc-pill ${r.stock>0?'has-stock':'no-stock'}">${escapeHtml(r.warehouse)}·${escapeHtml(r.floor)||'?'}·${escapeHtml(r.location)||'?'} <b>${r.stock}</b></div>`).join('');
    const safeKey=g.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const safeKeyAttr=escapeHtml(g.key);
    const detailsHtml=detailVariants.length
      ? `<div class="item-details-wrap" data-action="stop-propagation">
          ${visibleDetails.map(d=>`<span class="item-detail-chip" title="${escapeHtml(d)}">${escapeHtml(d)}</span>`).join('')}
          ${hiddenDetailCount>0?`<button class="item-detail-more" data-action="toggle-detail-variants" data-key="${safeKeyAttr}">+${hiddenDetailCount} more</button>`:''}
          ${detailsExpanded&&detailVariants.length>2?`<button class="item-detail-more" data-action="toggle-detail-variants" data-key="${safeKeyAttr}">Show less</button>`:''}
        </div>`
      : '<div class="item-details">—</div>';
    const orderActions=captureActive&&isOrderModeEnabled()&&canReadData()?`
      <div class="card-order-actions" data-action="stop-propagation">
        <div class="card-order-left">
          <div class="card-order-state">${draftLine?`In Outbound · Pending ${formatOrderNumber(pendingQty)}`:'Not in outbound'}</div>
          ${draftLine?`<div class="card-order-state-sub">Order ${escapeHtml(draftLine.orderId)}</div>`:''}
        </div>
        ${canOrderCommitData()?`<div class="card-order-right">
          <select id="${modeInputId}" class="card-order-mode" data-base-uom="${escapeHtml(modeCtx.baseUom||modeCtx.requestedUom||'')}" data-sync-mode-target="${escapeHtml(qtyInputId)}">
            <option value="UNIT" ${modeCtx.requestedMode==='UNIT'?'selected':''}>UNIT</option>
            <option value="BASE" ${modeCtx.requestedMode==='BASE'?'selected':''} ${(!modeCtx.supportsBase&&modeCtx.requestedMode!=='BASE')?'disabled':''}>BASE${modeCtx.baseUom?` (${escapeHtml(modeCtx.baseUom)})`:''}</option>
          </select>
          <input id="${qtyInputId}" class="card-order-qty" type="number" min="${modeCtx.min}" step="${modeCtx.step}" value="${formatOrderNumber(draftLine?draftLine.requestedQty:1)}">
          <button class="card-order-btn" data-action="add-group-to-outbound" data-key="${safeKeyAttr}" data-qty-id="${escapeHtml(qtyInputId)}" data-mode-id="${escapeHtml(modeInputId)}">${draftLine?'Update':'Add'}</button>
          ${draftLine?`<button class="card-order-remove" data-action="cancel-order-line" data-order-id="${escapeHtml(draftLine.orderId)}" data-line-id="${escapeHtml(draftLine.lineId)}">Remove</button>`:''}
        </div>`:`<div class="card-order-readonly">Read-only</div>`}
      </div>`:'';

    return `
      <div class="item-card stock-${sc==='out'?'out':sc==='low'?'low':'good'} ${captureActive?'order-mode-card':''}" data-action="open-modal" data-key="${safeKeyAttr}">
        <div class="item-header">
          <div class="item-header-left">
            <div class="item-type-badge">${escapeHtml(g.type)||'—'}</div>
            <div class="item-badges">
              ${whBadges}
              ${isPacket?`<div class="item-badge-packet">🛍 Packet</div>`:''}
              ${multi?`<div class="item-badge-multi">📍 ${g.locations.length} rows</div>`:''}
              ${g.hasNotes?`<div class="item-badge-attention">⚠ note</div>`:''}
              ${cCount>0?`<div class="item-badge-comment">💬 ${cCount}</div>`:''}
            </div>
          </div>
          <div class="stock-right">
            <div class="stock-badge ${sc}">${g.totalStock}</div>
            <div class="stock-label">${packetUnitLabel(g.packetType)}</div>
          </div>
        </div>
        <div class="item-size">${escapeHtml(g.size)||'—'}</div>
        ${detailsHtml}
        ${qtySummary?`<div class="item-qty-summary">≈ ${escapeHtml(qtySummary)}</div>`:''}
        ${multi?`<div class="location-pills">${locPills}</div>`:`
        <div class="item-meta">
          <div class="meta-tag">🏢 ${escapeHtml(g.locations[0].warehouse)||'—'}</div>
          <div class="meta-tag">📶 ${escapeHtml(g.locations[0].floor)||'—'}</div>
          ${g.locations[0].location?`<div class="meta-tag">📍 ${escapeHtml(g.locations[0].location)}</div>`:''}
          <div class="meta-tag">${packetIcon(g.packetType)} ${escapeHtml(g.packetType)}</div>
        </div>`}
        ${captureActive&&isOrderModeEnabled()&&canReadData()?`<div class="order-mode-hint">Use Add/Update below to send this SKU to Outbound.</div>`:''}
        ${orderActions}
      </div>`;
  }).join('');
}

// ── Modal ──
function openModal(key){
  const group=groups.find(g=>g.key===key);
  if(!group) return;
  const modal=openModalRef(group);
  const g=modal.currentGroup,sc=stockClass(g.totalStock);
  document.getElementById('modalType').textContent=g.type||'—';
  document.getElementById('modalSize').textContent=g.size||'—';
  document.getElementById('modalPacket').textContent=`${packetIcon(g.packetType)} ${g.packetType}`;
  document.getElementById('modalTotalStock').textContent=g.totalStock;
  document.getElementById('modalTotalStock').className=`modal-total-value ${sc}`;
  document.getElementById('modalLocCount').textContent=`across ${g.locations.length} row${g.locations.length>1?'s':''} in ${[...g.warehouses].join(', ')}`;

  const qtyTotals=computeQtyTotals(g.locations);
  const qtySummary=fmtQtyTotals(qtyTotals);
  const qtyTotalEl=document.getElementById('modalQtyTotal');
  if(qtySummary){qtyTotalEl.style.display='block';document.getElementById('modalQtyTotalValue').textContent=qtySummary;}
  else qtyTotalEl.style.display='none';

  const allNotes=g.locations.map(r=>r.notes).filter(Boolean).join(' | ');
  const notesEl=document.getElementById('modalNotes');
  if(allNotes){notesEl.classList.add('visible');document.getElementById('modalNotesText').textContent=allNotes;}
  else notesEl.classList.remove('visible');

  const locationRowsEl=document.getElementById('locationRows');
  locationRowsEl.innerHTML=renderModalLocationRowsHtml({
    group:g,
    warehouseOptions:getWarehouseOptions(),
    floorOptions:getFloorOptions(),
    orderNumberEps:ORDER_NUMBER_EPS,
    stockClass,
    fmtRowQty,
    normalizeOrderNumber,
    formatOrderNumber,
    escapeHtml,
    computeQtyTotals,
    fmtQtyTotals,
    packetUnitLabel,
  });

  applyModalRoleGates();
  renderComments(g.type,g.size);
  if(!canWriteData()){
    const commentText=document.getElementById('commentText');
    const submitBtn=document.getElementById('commentSubmitBtn');
    if(commentText) commentText.disabled=true;
    if(submitBtn){
      submitBtn.disabled=true;
      submitBtn.textContent='Read-only';
    }
  } else {
    const commentText=document.getElementById('commentText');
    const submitBtn=document.getElementById('commentSubmitBtn');
    if(commentText) commentText.disabled=false;
    if(submitBtn){
      submitBtn.disabled=false;
      submitBtn.innerHTML='💬 Add Comment';
    }
  }
  document.getElementById('commentText').value='';
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function applyModalRoleGates(){
  if(canWriteData()) return;
  document.querySelectorAll('#locationRows button, #locationRows input, #locationRows select').forEach(el=>{
    el.disabled=true;
    el.classList.add('role-disabled');
  });
}

function toggleEditPanel(i){
  const panel=document.getElementById(`editpanel-${i}`);
  if(!panel) return;
  const splitPanel=document.getElementById(`splitpanel-${i}`);
  if(splitPanel) splitPanel.classList.remove('open');
  const loosePanel=document.getElementById(`loosetransfer-${i}`);
  if(loosePanel) loosePanel.classList.remove('open');
  const willOpen=!panel.classList.contains('open');
  document.querySelectorAll('.row-edit-panel.open').forEach(el=>el.classList.remove('open'));
  if(willOpen) panel.classList.add('open');
}

function toggleLooseTransferPanel(i){
  const panel=document.getElementById(`loosetransfer-${i}`);
  if(!panel) return;
  const editPanel=document.getElementById(`editpanel-${i}`);
  if(editPanel) editPanel.classList.remove('open');
  const splitPanel=document.getElementById(`splitpanel-${i}`);
  if(splitPanel) splitPanel.classList.remove('open');
  const willOpen=!panel.classList.contains('open');
  document.querySelectorAll('.loose-transfer-panel.open').forEach(el=>el.classList.remove('open'));
  if(willOpen) panel.classList.add('open');
}

function adjustLocQty(i,d){
  const inp=document.getElementById(`locqty-${i}`);
  if(!inp) return;
  inp.value=Math.max(0,parseInt(inp.value||0,10)+d);
}

async function saveLocStock(i){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const row=g.locations[i],btn=document.getElementById(`locsave-${i}`);
  const newStock=Math.max(0,parseInt(document.getElementById(`locqty-${i}`).value,10)||0);
  const delta=newStock-row.stock;

  if(newStock===row.stock){
    showToast('No stock change to save','info');
    return;
  }
  if(isHighImpactDelta(row.stock,delta)){
    const pct=((Math.abs(delta)/row.stock)*100).toFixed(1);
    const ok=window.confirm(`Large stock change detected (${delta>0?'+':''}${delta}, ${pct}% of current stock). Continue?`);
    if(!ok) return;
  }

  btn.disabled=true;btn.textContent='⏳';
  try{
    const res=await writeRowFields(row.rowNum,{stock:newStock});
    if(res&&res.queued){
      btn.disabled=false;btn.textContent='💾 Save';
      showToast('Offline: change queued for sync','info');
      return;
    }
    row.stock=newStock;
    g.totalStock+=delta;
    if(res.currentVersion) row.version=res.currentVersion;
    document.getElementById(`locstock-${i}`).textContent=newStock;
    document.getElementById(`locstock-${i}`).className=`location-row-stock ${stockClass(newStock)}`;
    document.getElementById('modalTotalStock').textContent=g.totalStock;
    document.getElementById('modalTotalStock').className=`modal-total-value ${stockClass(g.totalStock)}`;
    refreshModalQtyTotal();
    btn.classList.add('saved');btn.textContent='✓ Saved';
    showToast(`Updated → ${newStock}`,'success');
    applyFilters();updateStats();
    setTimeout(()=>{if(!getModalRef().isOpen) syncFromSheet(true); else setModalPendingAutoRefreshRef(true);},5000);
    setTimeout(()=>{btn.disabled=false;btn.classList.remove('saved');btn.textContent='💾 Save';},2500);
  }catch(err){
    btn.disabled=false;btn.textContent='💾 Save';
    showToast('Save failed','error',{actionLabel:'Retry',onAction:()=>saveLocStock(i),duration:5000});
  }
}

async function saveLooseQty(i){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const row=g.locations[i];
  const btn=document.getElementById(`loosesave-${i}`);
  const raw=String(document.getElementById(`looseqty-${i}`)?.value||'').trim();
  const looseQty=normalizeOrderNumber(parseFloat(raw));

  if(!Number.isFinite(looseQty)||looseQty<0){showToast('Loose qty must be a non-negative number','error');return;}
  if((row.unit||'').toLowerCase()==='pcs'&&!isWholeOrderNumber(looseQty)){
    showToast('Loose qty must be a whole number for pcs rows','error');
    return;
  }
  if(Math.abs(looseQty-normalizeOrderNumber(row.looseQty))<=ORDER_NUMBER_EPS){
    showToast('No loose qty change to save','info');
    return;
  }

  btn.disabled=true;btn.textContent='Saving…';
  try{
    const res=await writeUpdateLooseQty(row,looseQty);
    if(res&&res.queued){
      btn.disabled=false;btn.textContent='Save Loose';
      showToast('Offline: loose qty update queued','info');
      return;
    }
    row.looseQty=looseQty;
    if(res.currentVersion) row.version=res.currentVersion;
    const looseLabel=document.getElementById(`locloose-${i}`);
    if(looseLabel) looseLabel.innerHTML=`Loose: <b>${formatOrderNumber(looseQty)}</b>${row.unit?` ${escapeHtml(row.unit)}`:''}`;
    refreshModalQtyTotal();
    applyFilters();
    btn.classList.add('saved');btn.textContent='✓ Saved';
    showToast('Loose qty updated','success');
    setTimeout(()=>{btn.disabled=false;btn.classList.remove('saved');btn.textContent='Save Loose';},2500);
  }catch(err){
    btn.disabled=false;btn.classList.remove('saved');btn.textContent='Save Loose';
    showToast(err.message||'Loose qty update failed','error',{actionLabel:'Retry',onAction:()=>saveLooseQty(i),duration:5000});
  }
}

async function confirmLooseTransfer(i){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const row=g.locations[i];
  const btn=document.getElementById(`loosetransferconfirm-${i}`);

  const destinationWarehouse=String(document.getElementById(`loosewh-${i}`)?.value||'').trim();
  const destinationFloor=String(document.getElementById(`loosefl-${i}`)?.value||'').trim();
  const destinationLocation=String(document.getElementById(`looseloc-${i}`)?.value||'').trim();
  const transferQtyRaw=String(document.getElementById(`loosetransferqty-${i}`)?.value||'').trim();
  const transferQty=normalizeOrderNumber(parseFloat(transferQtyRaw));
  const sourceLooseQty=Math.max(0,normalizeOrderNumber(row.looseQty));
  const unit=String(row.unit||'').trim().toLowerCase();

  if(!destinationLocation){showToast('Destination location is required','error');return;}
  if(!Number.isFinite(transferQty)||transferQty<=0){showToast('Transfer qty must be greater than 0','error');return;}
  if(unit==='pcs'&&!isWholeOrderNumber(transferQty)){showToast('Transfer qty must be whole number for pcs rows','error');return;}
  if(transferQty-sourceLooseQty>ORDER_NUMBER_EPS){showToast('Transfer qty exceeds available loose qty','error');return;}

  if(destinationWarehouse===row.warehouse&&destinationFloor===row.floor&&destinationLocation===row.location){
    showToast('Source and destination location cannot be the same','error');
    return;
  }

  const allowedWh=getWarehouseOptions();
  const allowedFl=getFloorOptions();
  if(!allowedWh.includes(destinationWarehouse)){showToast('Invalid destination warehouse','error');return;}
  if(!allowedFl.includes(destinationFloor)){showToast('Invalid destination floor','error');return;}

  const confirmMsg=[
    'Transfer loose stock?',
    `From: ${row.warehouse}/${row.floor}/${row.location||'—'}`,
    `To: ${destinationWarehouse}/${destinationFloor}/${destinationLocation}`,
    `Qty: ${formatOrderNumber(transferQty)} ${unit||''}`.trim(),
  ];
  if(!window.confirm(confirmMsg.join('\n'))) return;

  btn.disabled=true;btn.textContent='Transferring…';
  try{
    const res=await writeTransferLooseQty(row,transferQty,{
      warehouse:destinationWarehouse,
      floor:destinationFloor,
      location:destinationLocation,
      createIfMissing:true,
    });
    if(res&&res.queued){
      btn.disabled=false;btn.textContent='Transfer Loose';
      showToast('Offline: loose transfer queued','info');
      document.getElementById(`loosetransfer-${i}`)?.classList.remove('open');
      return;
    }
    showToast('Loose stock transferred','success');
    const key=g.key;
    await syncFromSheet(true,true);
    applyFilters();
    updateStats();
    if(getModalRef().isOpen) openModal(key);
  }catch(err){
    btn.disabled=false;btn.textContent='Transfer Loose';
    showToast(err.message||'Loose transfer failed','error',{actionLabel:'Retry',onAction:()=>confirmLooseTransfer(i),duration:5000});
    return;
  }
  btn.disabled=false;btn.textContent='Transfer Loose';
}

async function saveRowChanges(i){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const row=g.locations[i];
  const btn=document.getElementById(`rowsave-${i}`);

  const newWarehouse=document.getElementById(`placewh-${i}`).value;
  const newFloor=document.getElementById(`placefl-${i}`).value;
  const newLocation=document.getElementById(`placeloc-${i}`).value.trim();

  const qtyInput=document.getElementById(`qtyedit-${i}`);
  const qtyRaw=String(qtyInput.value||'').trim();
  const hasQtyInput=qtyRaw!=='';
  const newQty=hasQtyInput?Number(qtyRaw):null;
  const newUnit=document.getElementById(`unitedit-${i}`).value;

  if(!newLocation){showToast('Location is required','error');return;}
  if(hasQtyInput&&(!Number.isFinite(newQty)||newQty<0)){
    showToast('Qty must be a non-negative number','error');
    return;
  }

  const allowedWh=getWarehouseOptions();
  const allowedFl=getFloorOptions();
  if(!allowedWh.includes(newWarehouse)){showToast('Invalid warehouse selected','error');return;}
  if(!allowedFl.includes(newFloor)){showToast('Invalid floor selected','error');return;}

  const placementChanged=newWarehouse!==row.warehouse||newFloor!==row.floor||newLocation!==row.location;
  const currentUnit=(row.unit||'').trim().toLowerCase();
  const nextUnit=(newUnit||'').trim().toLowerCase();
  const qtyChanged=hasQtyInput
    ? (newQty!==row.qtyPerUnit||nextUnit!==currentUnit)
    : (nextUnit!==currentUnit&&row.qtyPerUnit!==null);

  if(!placementChanged&&!qtyChanged){
    showToast('No row changes to save','info');
    return;
  }

  if(placementChanged){
    const ok=window.confirm(`Change placement from ${row.warehouse}/${row.floor}/${row.location||'—'} to ${newWarehouse}/${newFloor}/${newLocation}?`);
    if(!ok) return;
  }

  const fields={
    warehouse:newWarehouse,
    floor:newFloor,
    location:newLocation,
  };
  if(hasQtyInput){
    fields.qty=newQty;
    fields.unit=nextUnit;
  } else if(nextUnit!==currentUnit&&row.qtyPerUnit!==null){
    fields.unit=nextUnit;
  }

  btn.disabled=true;btn.textContent='Saving…';
  try{
    const res=await writeRowFields(row.rowNum,fields);
    if(res&&res.queued){
      showToast('Offline: row change queued','info');
      return;
    }
    showToast('Row updated','success');
    const key=g.key;
    await syncFromSheet(true,true);
    applyFilters();updateStats();
    if(getModalRef().isOpen) openModal(key);
  }catch(err){
    showToast('Row update failed','error',{actionLabel:'Retry',onAction:()=>saveRowChanges(i),duration:5000});
  }finally{
    btn.disabled=false;btn.textContent='Save Changes';
  }
}

function refreshModalQtyTotal(){
  const g=getModalRef().currentGroup;if(!g) return;
  const qtyTotals=computeQtyTotals(g.locations);
  const qtySummary=fmtQtyTotals(qtyTotals);
  const el=document.getElementById('modalQtyTotal');
  if(qtySummary){el.style.display='block';document.getElementById('modalQtyTotalValue').textContent=qtySummary;}
  else el.style.display='none';
}

function toggleSplitPanel(i){
  const editPanel=document.getElementById(`editpanel-${i}`);
  if(editPanel) editPanel.classList.remove('open');
  const loosePanel=document.getElementById(`loosetransfer-${i}`);
  if(loosePanel) loosePanel.classList.remove('open');
  document.getElementById(`splitpanel-${i}`).classList.toggle('open');
}

async function confirmSplitMove(i){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const row=g.locations[i];
  const btn=document.getElementById(`splitconfirm-${i}`);

  const keepStock  = Math.max(0,parseInt(document.getElementById(`split-keep-${i}`).value)||0);
  const moveStock  = Math.max(0,parseInt(document.getElementById(`split-move-${i}`).value)||0);
  const newLoc     = document.getElementById(`split-loc-${i}`).value.trim();
  const newQty     = parseNullableNumber(document.getElementById(`split-qty-${i}`).value);
  const newUnit    = document.getElementById(`split-unit-${i}`).value;
  const newPacket  = document.getElementById(`split-packet-${i}`).value;

  // Validation
  if(keepStock+moveStock!==row.stock){
    showToast(`Keep + Move must equal ${row.stock}`,'error');return;
  }
  if(moveStock===0){showToast('Move quantity cannot be 0','error');return;}
  if(!newLoc){showToast('Please enter a new location','error');return;}

  const confirmMsg=[
    'Confirm split/move?',
    `Keep: ${keepStock}`,
    `Move: ${moveStock}`,
    `From: ${row.location||'—'} -> ${newLoc}`,
    `Packet: ${newPacket}`,
  ];
  if(newQty!==null) confirmMsg.push(`Qty/unit: ${newQty} ${newUnit}`);
  if(!window.confirm(confirmMsg.join('\n'))) return;
  if(isHighImpactDelta(row.stock,moveStock)){
    const movePct=((moveStock/row.stock)*100).toFixed(1);
    const highRisk=window.confirm(`High-impact move (${moveStock} units, ${movePct}% of current stock). Are you sure?`);
    if(!highRisk) return;
  }

  btn.disabled=true;btn.textContent='⏳ Processing…';

  try{
    const res=await writeSplitMove(row,{keepStock,moveStock,newLoc,newQty,newUnit,newPacket});
    if(res&&res.queued){
      showToast('Offline: split/move queued','info');
      document.getElementById(`splitpanel-${i}`).classList.remove('open');
      return;
    }
    if(res.currentVersion) row.version=res.currentVersion;
    showToast(res.mode==='relocation'?'Location updated':'Split / Move complete','success');

    await syncFromSheet(true,true);
    applyFilters();updateStats();
    document.getElementById(`splitpanel-${i}`).classList.remove('open');

  }catch(err){
    showToast('Operation failed','error',{actionLabel:'Retry',onAction:()=>confirmSplitMove(i),duration:5000});
  }finally{
    btn.disabled=false;btn.textContent='✂ Confirm Split / Move';
  }
}

function renderComments(type,size){
  const list=document.getElementById('commentsList');
  const items=allComments.filter(c=>c.item===type&&c.size===size);
  renderCommentsPanel({
    listEl:list,
    comments:items,
    escapeHtml,
    fmtTime,
  });
}

async function submitComment(){
  if(!requireWritePermission()) return;
  const g=getModalRef().currentGroup;if(!g) return;
  const author=document.getElementById('commentAuthor').value.trim()||'Anonymous';
  try{if(author&&author!=='Anonymous') localStorage.setItem('wh_actor_name',author);}catch(e){}
  const text=document.getElementById('commentText').value.trim();
  if(!text){showToast('Please enter a comment','info');return;}
  const btn=document.getElementById('commentSubmitBtn');
  btn.disabled=true;btn.textContent='⏳ Sending…';
  try{
    const res=await writeComment(g.type,g.size,text,author);
    if(res&&res.queued){
      document.getElementById('commentText').value='';
      showToast('Offline: comment queued','info');
      return;
    }
    allComments.push({timestamp:new Date().toISOString(),item:g.type,size:g.size,comment:text,author});
    document.getElementById('commentText').value='';
    renderComments(g.type,g.size);g.hasNotes=true;
    showToast('Comment added','success');
  }catch(err){
    showToast('Comment failed to send','error',{actionLabel:'Retry',onAction:()=>submitComment(),duration:5000});
  }
  finally{btn.disabled=false;btn.innerHTML='💬 Add Comment';}
}

async function undoLastAction(){
  if(!requireUndoPermission()) return;
  const select=document.getElementById('undoSelect');
  const targetRequestId=String(select?.value||'').trim();
  const btn=document.getElementById('undoBtn');
  if(btn){btn.disabled=true;btn.textContent='↶ Undoing…';}
  try{
    const res=await writeUndoLast(targetRequestId);
    const action=res?.undoneAction?` (${res.undoneAction})`:'';
    showToast(`Undo successful${action}`,'success');
    await syncFromSheet(true,true);
    await loadUndoCandidates(true);
    applyFilters();
    updateStats();
  }catch(err){
    showToast(err.message||'Undo failed','error');
  }finally{
    if(btn){
      btn.textContent='↶ Undo';
      btn.disabled=!canUndoData();
    }
  }
}

async function flushQueueNow(){
  await processOfflineQueue(false);
}

function closeModal(){
  const modal=getModalRef();
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow='';
  const shouldRefresh=!!modal.pendingAutoRefresh;
  setModalPendingAutoRefreshRef(false);
  closeModalRef();
  if(shouldRefresh) syncFromSheet(true);
}
function closeModalOnBg(e){if(e.target===document.getElementById('modalOverlay'))closeModal();}

function bindUiActions(){
  if(appState.ui.actionsBound) return;
  appState.ui.actionsBound=true;

  const orderBtn=document.getElementById('orderModeBtn');
  const inboundBtn=document.getElementById('inboundModeBtn');
  const captureBtn=document.getElementById('outboundCaptureBtn');
  const undoBtn=document.getElementById('undoBtn');
  const queueBtn=document.getElementById('queueBtn');
  const pdfBtn=document.getElementById('pdfBtn');
  const syncBtn=document.getElementById('syncBtn');
  const modalCloseBtn=document.getElementById('modalCloseBtn');
  const commentSubmitBtn=document.getElementById('commentSubmitBtn');
  const outboundRefreshBtn=document.getElementById('outboundRefreshBtn');
  const outboundCommitAllBtn=document.getElementById('outboundCommitAllBtn');
  const inboundCreateBtn=document.getElementById('inboundCreateBtn');
  const inboundRefreshBtn=document.getElementById('inboundRefreshBtn');
  const inboundPostAllBtn=document.getElementById('inboundPostAllBtn');
  const outTabDrafts=document.getElementById('outTabDrafts');
  const outTabReady=document.getElementById('outTabReady');
  const outTabHistory=document.getElementById('outTabHistory');
  const inTabDrafts=document.getElementById('inTabDrafts');
  const inTabPosted=document.getElementById('inTabPosted');
  const inTabHistory=document.getElementById('inTabHistory');
  const outboundNoticeRefreshBtn=document.querySelector('#outboundServiceNotice .outbound-service-refresh');
  const inboundNoticeRefreshBtn=document.querySelector('#inboundServiceNotice .inbound-service-refresh');
  const modalOverlay=document.getElementById('modalOverlay');
  const lockBtn=document.getElementById('lockBtn');
  const clearBtn=document.getElementById('clearBtn');
  const filterToggleBtn=document.getElementById('filterToggleBtn');
  const typeAllChip=document.getElementById('typeAllChip');
  const whAllChip=document.getElementById('whAllChip');
  const flAllChip=document.getElementById('flAllChip');
  const sfAll=document.getElementById('sfAll');
  const sfIn=document.getElementById('sfIn');
  const sfLow=document.getElementById('sfLow');
  const sfOut=document.getElementById('sfOut');
  const ptAll=document.getElementById('ptAll');
  const ptBox=document.getElementById('ptBox');
  const ptJute=document.getElementById('ptJute');
  const ptPacket=document.getElementById('ptPacket');
  const attnChip=document.getElementById('attnChip');
  const clearAllFiltersBtn=document.getElementById('clearAllFiltersBtn');
  const lockUserInput=document.getElementById('lockUser');
  const lockPwdInput=document.getElementById('lockInput');
  const locationInput=document.getElementById('locationInput');
  const sortSelect=document.getElementById('sortSelect');
  const router=initEventRouter();

  if(lockUserInput){
    lockUserInput.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'){
        const lockPwd=document.getElementById('lockInput');
        if(lockPwd) lockPwd.focus();
      }
    });
  }

  if(lockPwdInput){
    lockPwdInput.addEventListener('keydown',(e)=>{
      if(e.key==='Enter') unlockApp();
    });
  }

  if(locationInput){
    locationInput.addEventListener('input',()=>applyFilters());
  }

  if(sortSelect){
    sortSelect.addEventListener('change',()=>applyFilters());
  }

  document.addEventListener('change',(e)=>{
    const modeSelect=e.target&&typeof e.target.closest==='function'
      ? e.target.closest('select[data-sync-mode-target]')
      : null;
    if(!modeSelect) return;
    const modeInputId=String(modeSelect.id||'').trim();
    const qtyInputId=String(modeSelect.dataset.syncModeTarget||'').trim();
    if(!modeInputId||!qtyInputId) return;
    syncModeInput(modeInputId,qtyInputId);
  });

  if(router){
    if(orderBtn) orderBtn.dataset.action='toggle-order-mode';
    if(inboundBtn) inboundBtn.dataset.action='toggle-inbound-mode';
    if(captureBtn) captureBtn.dataset.action='toggle-outbound-capture-mode';
    if(undoBtn) undoBtn.dataset.action='undo-last-action';
    if(queueBtn) queueBtn.dataset.action='flush-queue-now';
    if(pdfBtn) pdfBtn.dataset.action='export-pdf';
    if(syncBtn) syncBtn.dataset.action='sync-now';
    if(modalCloseBtn) modalCloseBtn.dataset.action='close-modal';
    if(commentSubmitBtn) commentSubmitBtn.dataset.action='submit-comment';
    if(outboundRefreshBtn) outboundRefreshBtn.dataset.action='refresh-outbound-orders';
    if(outboundCommitAllBtn) outboundCommitAllBtn.dataset.action='commit-all-outbound';
    if(inboundCreateBtn) inboundCreateBtn.dataset.action='create-inbound-draft';
    if(inboundRefreshBtn) inboundRefreshBtn.dataset.action='refresh-inbound-receipts';
    if(inboundPostAllBtn) inboundPostAllBtn.dataset.action='post-all-inbound';
    if(outTabDrafts) outTabDrafts.dataset.action='set-outbound-tab';
    if(outTabReady) outTabReady.dataset.action='set-outbound-tab';
    if(outTabHistory) outTabHistory.dataset.action='set-outbound-tab';
    if(inTabDrafts) inTabDrafts.dataset.action='set-inbound-tab';
    if(inTabPosted) inTabPosted.dataset.action='set-inbound-tab';
    if(inTabHistory) inTabHistory.dataset.action='set-inbound-tab';
    if(outboundNoticeRefreshBtn) outboundNoticeRefreshBtn.dataset.action='reload-page';
    if(inboundNoticeRefreshBtn) inboundNoticeRefreshBtn.dataset.action='reload-page';
    if(modalOverlay) modalOverlay.dataset.action='close-modal-bg';
    if(lockBtn) lockBtn.dataset.action='unlock-app';
    if(clearBtn) clearBtn.dataset.action='clear-search';
    if(filterToggleBtn) filterToggleBtn.dataset.action='toggle-filter-panel';
    if(typeAllChip) typeAllChip.dataset.action='set-type-filter';
    if(whAllChip) whAllChip.dataset.action='set-wh-filter';
    if(flAllChip) flAllChip.dataset.action='set-floor-filter';
    if(sfAll) sfAll.dataset.action='set-stock-filter';
    if(sfIn) sfIn.dataset.action='set-stock-filter';
    if(sfLow) sfLow.dataset.action='set-stock-filter';
    if(sfOut) sfOut.dataset.action='set-stock-filter';
    if(ptAll) ptAll.dataset.action='set-packet-filter';
    if(ptBox) ptBox.dataset.action='set-packet-filter';
    if(ptJute) ptJute.dataset.action='set-packet-filter';
    if(ptPacket) ptPacket.dataset.action='set-packet-filter';
    if(attnChip) attnChip.dataset.action='toggle-attention';
    if(clearAllFiltersBtn) clearAllFiltersBtn.dataset.action='clear-all-filters';

    router.register('toggle-order-mode',()=>toggleOrderMode());
    router.register('toggle-inbound-mode',()=>toggleInboundMode());
    router.register('toggle-outbound-capture-mode',()=>toggleOutboundCaptureMode());
    router.register('stop-propagation',({event})=>event.stopPropagation());
    router.register('open-modal',({target})=>openModal(String(target.dataset.key||'')));
    router.register('toggle-detail-variants',({target})=>toggleDetailVariants(String(target.dataset.key||'')));
    router.register('add-group-to-outbound',({target})=>addGroupToOutbound(
      String(target.dataset.key||''),
      String(target.dataset.qtyId||''),
      String(target.dataset.modeId||'')
    ));
    router.register('cancel-order-line',({target})=>cancelOrderLine(
      String(target.dataset.orderId||''),
      String(target.dataset.lineId||'')
    ));
    router.register('save-order-line',({target})=>saveOrderLine(
      String(target.dataset.orderId||''),
      String(target.dataset.lineId||'')
    ));
    router.register('commit-order-line',({target})=>commitOrderLine(
      String(target.dataset.orderId||''),
      String(target.dataset.lineId||''),
      Math.max(0,normalizeOrderNumber(parseFloat(target.dataset.remaining||'0')))
    ));
    router.register('undo-last-action',()=>undoLastAction());
    router.register('flush-queue-now',()=>flushQueueNow());
    router.register('export-pdf',()=>exportPDF());
    router.register('sync-now',()=>syncFromSheet());
    router.register('close-modal',()=>closeModal());
    router.register('submit-comment',()=>submitComment());
    router.register('refresh-outbound-orders',()=>loadOrders(false));
    router.register('commit-all-outbound',()=>commitAllOutbound());
    router.register('set-outbound-tab',({target})=>setOutboundTab(String(target.dataset.tab||'ready')));
    router.register('create-inbound-draft',()=>createReceiptDraft());
    router.register('refresh-inbound-receipts',()=>loadReceipts(false));
    router.register('post-all-inbound',()=>postAllInbound());
    router.register('set-inbound-tab',({target})=>setInboundTab(String(target.dataset.tab||'drafts')));
    router.register('save-receipt-line',({target})=>saveReceiptLine(
      String(target.dataset.receiptId||''),
      String(target.dataset.lineId||'')
    ));
    router.register('cancel-receipt-line',({target})=>cancelReceiptLineAction(
      String(target.dataset.receiptId||''),
      String(target.dataset.lineId||'')
    ));
    router.register('post-receipt-line',({target})=>postReceiptLine(
      String(target.dataset.receiptId||''),
      String(target.dataset.lineId||'')
    ));
    router.register('reload-page',()=>window.location.reload());
    router.register('close-modal-bg',({event})=>closeModalOnBg(event));
    router.register('unlock-app',()=>unlockApp());
    router.register('clear-search',()=>clearSearch());
    router.register('toggle-filter-panel',()=>toggleFilterPanel());
    router.register('set-type-filter',({target})=>setTypeFilter(target));
    router.register('set-wh-filter',({target})=>setWhFilter(String(target.dataset.value||'ALL')));
    router.register('set-floor-filter',({target})=>setFloorFilter(String(target.dataset.value||'ALL')));
    router.register('set-stock-filter',({target})=>setStockFilter(String(target.dataset.value||'ALL')));
    router.register('set-packet-filter',({target})=>setPacketFilter(String(target.dataset.value||'ALL')));
    router.register('toggle-attention',()=>toggleAttention());
    router.register('clear-all-filters',()=>clearAllFilters());
    router.register('adjust-loc-qty',({target})=>adjustLocQty(
      Number.parseInt(String(target.dataset.index||'-1'),10),
      Number.parseInt(String(target.dataset.delta||'0'),10)
    ));
    router.register('save-loc-stock',({target})=>saveLocStock(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('save-loose-qty',({target})=>saveLooseQty(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('toggle-loose-transfer-panel',({target})=>toggleLooseTransferPanel(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('confirm-loose-transfer',({target})=>confirmLooseTransfer(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('toggle-edit-panel',({target})=>toggleEditPanel(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('save-row-changes',({target})=>saveRowChanges(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('toggle-split-panel',({target})=>toggleSplitPanel(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.register('confirm-split-move',({target})=>confirmSplitMove(
      Number.parseInt(String(target.dataset.index||'-1'),10)
    ));
    router.bind();
    return;
  }

  if(orderBtn){
    orderBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      toggleOrderMode();
    });
  }

  if(inboundBtn){
    inboundBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      toggleInboundMode();
    });
  }

  if(captureBtn){
    captureBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      toggleOutboundCaptureMode();
    });
  }

  if(undoBtn){
    undoBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      undoLastAction();
    });
  }

  if(queueBtn){
    queueBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      flushQueueNow();
    });
  }

  if(pdfBtn){
    pdfBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      exportPDF();
    });
  }

  if(syncBtn){
    syncBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      syncFromSheet();
    });
  }

  if(modalCloseBtn){
    modalCloseBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      closeModal();
    });
  }

  if(commentSubmitBtn){
    commentSubmitBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      submitComment();
    });
  }

  if(outboundRefreshBtn){
    outboundRefreshBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      loadOrders(false);
    });
  }

  if(outboundCommitAllBtn){
    outboundCommitAllBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      commitAllOutbound();
    });
  }

  if(inboundCreateBtn){
    inboundCreateBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      createReceiptDraft();
    });
  }

  if(inboundRefreshBtn){
    inboundRefreshBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      loadReceipts(false);
    });
  }

  if(inboundPostAllBtn){
    inboundPostAllBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      postAllInbound();
    });
  }

  if(outTabDrafts){
    outTabDrafts.addEventListener('click',(e)=>{
      e.preventDefault();
      setOutboundTab('drafts');
    });
  }

  if(outTabReady){
    outTabReady.addEventListener('click',(e)=>{
      e.preventDefault();
      setOutboundTab('ready');
    });
  }

  if(outTabHistory){
    outTabHistory.addEventListener('click',(e)=>{
      e.preventDefault();
      setOutboundTab('history');
    });
  }

  if(inTabDrafts){
    inTabDrafts.addEventListener('click',(e)=>{
      e.preventDefault();
      setInboundTab('drafts');
    });
  }

  if(inTabPosted){
    inTabPosted.addEventListener('click',(e)=>{
      e.preventDefault();
      setInboundTab('posted');
    });
  }

  if(inTabHistory){
    inTabHistory.addEventListener('click',(e)=>{
      e.preventDefault();
      setInboundTab('history');
    });
  }

  if(outboundNoticeRefreshBtn){
    outboundNoticeRefreshBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      window.location.reload();
    });
  }

  if(modalOverlay){
    modalOverlay.addEventListener('click',(e)=>{
      closeModalOnBg(e);
    });
  }

  if(lockBtn){
    lockBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      unlockApp();
    });
  }

  if(clearBtn){
    clearBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      clearSearch();
    });
  }

  if(filterToggleBtn){
    filterToggleBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      toggleFilterPanel();
    });
  }

  if(typeAllChip){
    typeAllChip.addEventListener('click',(e)=>{
      e.preventDefault();
      setTypeFilter(typeAllChip);
    });
  }

  if(whAllChip){
    whAllChip.addEventListener('click',(e)=>{
      e.preventDefault();
      setWhFilter('ALL');
    });
  }

  if(flAllChip){
    flAllChip.addEventListener('click',(e)=>{
      e.preventDefault();
      setFloorFilter('ALL');
    });
  }

  if(sfAll){
    sfAll.addEventListener('click',(e)=>{
      e.preventDefault();
      setStockFilter('ALL');
    });
  }

  if(sfIn){
    sfIn.addEventListener('click',(e)=>{
      e.preventDefault();
      setStockFilter('IN');
    });
  }

  if(sfLow){
    sfLow.addEventListener('click',(e)=>{
      e.preventDefault();
      setStockFilter('LOW');
    });
  }

  if(sfOut){
    sfOut.addEventListener('click',(e)=>{
      e.preventDefault();
      setStockFilter('OUT');
    });
  }

  if(ptAll){
    ptAll.addEventListener('click',(e)=>{
      e.preventDefault();
      setPacketFilter('ALL');
    });
  }

  if(ptBox){
    ptBox.addEventListener('click',(e)=>{
      e.preventDefault();
      setPacketFilter('Box');
    });
  }

  if(ptJute){
    ptJute.addEventListener('click',(e)=>{
      e.preventDefault();
      setPacketFilter('Jute Bag');
    });
  }

  if(ptPacket){
    ptPacket.addEventListener('click',(e)=>{
      e.preventDefault();
      setPacketFilter('Packet');
    });
  }

  if(attnChip){
    attnChip.addEventListener('click',(e)=>{
      e.preventDefault();
      toggleAttention();
    });
  }

  if(clearAllFiltersBtn){
    clearAllFiltersBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      clearAllFilters();
    });
  }
}

// ── PDF Export ──
function exportPDF(){
  const filters=getFiltersRef();
  const now=new Date();
  const dateStr=now.toLocaleDateString([],{day:'numeric',month:'long',year:'numeric'});
  const filterParts=[];
  if(filters.type!=='ALL')      filterParts.push(`Category: ${filters.type}`);
  if(filters.warehouse!=='ALL') filterParts.push(`Warehouse: ${filters.warehouse}`);
  if(filters.floor!=='ALL')     filterParts.push(`Floor: ${filters.floor}`);
  if(filters.stock!=='ALL')     filterParts.push(`Stock: ${filters.stock}`);
  if(filters.packet!=='ALL')    filterParts.push(`Packet: ${filters.packet}`);
  if(filters.attentionOnly)     filterParts.push('Needs Attention only');
  const locVal=filters.location;
  if(locVal) filterParts.push(`Location: ${locVal}`);
  const searchVal=filters.search;
  if(searchVal) filterParts.push(`Search: "${searchVal}"`);
  const filterStr=filterParts.length?filterParts.join(' · '):'No filters applied — showing all items';

  const rows=filtered.map(g=>{
    const sc=stockClass(g.totalStock);
    const whs=[...g.warehouses].join(', ');
    const floors=[...new Set(g.locations.map(r=>r.floor).filter(Boolean))].join(', ');
    const locs=g.locations.map(r=>r.location).filter(Boolean).join(', ');
    const details=getGroupDetailVariants(g);
    const detailsText=details.length?details.join(' | '):'—';
    const qtySummary=fmtQtyTotals(computeQtyTotals(g.locations));
    return `<tr>
      <td>${escapeHtml(g.type)}</td><td>${escapeHtml(g.size)}</td><td>${escapeHtml(detailsText)}</td>
      <td>${escapeHtml(g.packetType)}</td><td>${escapeHtml(whs)}</td><td>${escapeHtml(floors)}</td><td>${escapeHtml(locs)}</td>
      <td class="stock-${sc}">${g.totalStock}</td><td>${escapeHtml(qtySummary)||'—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('printView').innerHTML=`
    <div class="print-header">
      <div class="print-title">Inventory as of ${dateStr}</div>
      <div class="print-meta">${filtered.length} SKUs shown</div>
      <div class="print-filters">Filters: ${filterStr}</div>
    </div>
    <table class="print-table">
      <thead><tr>
        <th>Type</th><th>Size</th><th>Details</th><th>Packet</th>
        <th>Warehouse</th><th>Floor</th><th>Location</th>
        <th>Stock</th><th>Total Qty</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="print-footer">Generated ${now.toLocaleString()} · Warehouse Inventory System</div>`;
  window.print();
}

// ── Toast ──
function showToast(msg,type='info',opts={}){
  const {actionLabel='',onAction=null,duration=2500}=opts;
  const t=document.getElementById('toast');
  if(toastTimer) clearTimeout(toastTimer);
  t.innerHTML='';
  const text=document.createElement('span');
  text.className='toast-msg';
  text.textContent=msg;
  t.appendChild(text);

  const hasAction=actionLabel&&typeof onAction==='function';
  if(hasAction){
    const actionBtn=document.createElement('button');
    actionBtn.className='toast-action';
    actionBtn.textContent=actionLabel;
    actionBtn.onclick=(e)=>{e.stopPropagation();onAction();t.classList.remove('show');};
    t.appendChild(actionBtn);
  }

  t.className=`toast ${type}${hasAction?' actionable':''} show`;
  toastTimer=setTimeout(()=>t.classList.remove('show'),duration);
}

// ── Init ──
function init(){
  isConfigured=checkConfig();
  initOutboundService();
  initInboundService();
  if(outboundServiceInitFailed) notifyOutboundServiceUnavailable();
  if(inboundServiceInitFailed) notifyInboundServiceUnavailable();
  bindUiActions();
  loadOfflineQueue();
  updateRoleUI();
  updateQueueUI();
  updateOutboundUI();
  updateInboundUI();
  resetInboundDraftForm();
  renderWarehouseFilterChips();
  renderFloorFilterChips();
  renderInboundFormOptions();
  window.addEventListener('online',()=>{processOfflineQueue(false);});
  window.addEventListener('offline',()=>{updateQueueUI();showToast('Offline mode enabled','info');});
  if(!isConfigured){
    document.getElementById('lockScreen').classList.add('hidden');
    document.getElementById('appShell').style.display='block';
    document.getElementById('configNotice').classList.add('visible');
    document.getElementById('loadingState').style.display='none';
    document.getElementById('resultsCount').textContent='Not configured';
    document.getElementById('syncDot').className='sync-dot offline';
    document.getElementById('syncTime').textContent='Setup needed';
    return;
  }
  if(checkSession()){
    document.getElementById('lockScreen').classList.add('hidden');
    document.getElementById('appShell').style.display='block';
    loadRuntimeConfig().finally(()=>{if(canReadData()) syncFromSheet(true);});
    if(CONFIG.AUTO_REFRESH_MS>0) setInterval(()=>{if(canReadData()&&!getModalRef().isOpen) syncFromSheet(true); else if(getModalRef().isOpen) setModalPendingAutoRefreshRef(true);},CONFIG.AUTO_REFRESH_MS);
  } else {
    if(CONFIG.AUTO_REFRESH_MS>0) setInterval(()=>{if(checkSession()&&canReadData()&&!getModalRef().isOpen)syncFromSheet(true); else if(getModalRef().isOpen) setModalPendingAutoRefreshRef(true);},CONFIG.AUTO_REFRESH_MS);
  }
}

init();
