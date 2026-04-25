(function(global){
  'use strict';

  function renderOutboundLinesHtml(options){
    var opts=options&&typeof options==='object'?options:{};
    var view=opts.view&&typeof opts.view==='object'?opts.view:{};
    var tab=String(view.tab||'ready');
    var linesToRender=Array.isArray(opts.linesToRender)?opts.linesToRender:[];
    var rawData=Array.isArray(opts.rawData)?opts.rawData:[];
    var orderNumberEps=Number.isFinite(opts.orderNumberEps)?opts.orderNumberEps:1e-6;

    var normalizeOrderNumber=typeof opts.normalizeOrderNumber==='function'
      ? opts.normalizeOrderNumber
      : function(v){return Number(v)||0;};
    var resolveLineModeContext=typeof opts.resolveLineModeContext==='function'
      ? opts.resolveLineModeContext
      : function(){return {requestedMode:'UNIT',requestedUom:'unit',modeLabel:'UNIT',baseUom:'',supportsBase:false,min:'1',step:'1'};};
    var findLiveLocationsForLine=typeof opts.findLiveLocationsForLine==='function'
      ? opts.findLiveLocationsForLine
      : function(){return [];};
    var computeAutoAllocation=typeof opts.computeAutoAllocation==='function'
      ? opts.computeAutoAllocation
      : function(){return {values:{}};};
    var getRowAllocationMeta=typeof opts.getRowAllocationMeta==='function'
      ? opts.getRowAllocationMeta
      : function(){return {label:'0',available:0,step:'1'};};
    var formatOrderNumber=typeof opts.formatOrderNumber==='function'
      ? opts.formatOrderNumber
      : function(v){return String(v==null?'':v);};
    var escapeHtml=typeof opts.escapeHtml==='function'
      ? opts.escapeHtml
      : function(v){return String(v==null?'':v);};
    var canOrderCommitData=typeof opts.canOrderCommitData==='function'
      ? opts.canOrderCommitData
      : function(){return false;};

    return linesToRender.map(function(line){
      var remaining=Math.max(0,normalizeOrderNumber((line.requestedQty||0)-(line.fulfilledQty||0)));
      var skuRows=rawData.filter(function(r){
        return r.type===line.type&&r.size===line.size&&r.packetType===line.packet;
      });
      var lineModeCtx=resolveLineModeContext(line,{locations:skuRows});
      var locations=findLiveLocationsForLine(rawData,line,orderNumberEps);
      var autoAlloc=computeAutoAllocation(locations,remaining,lineModeCtx);
      var allocatedNow=Object.values(autoAlloc.values||{}).reduce(function(sum,value){
        return sum+(parseFloat(value)||0);
      },0);
      var allocClass=(allocatedNow+orderNumberEps)>=remaining&&remaining>orderNumberEps
        ? 'full'
        : allocatedNow>orderNumberEps
          ? 'partial'
          : 'empty';
      var allocText=remaining<=orderNumberEps
        ? 'No pending allocation'
        : (allocatedNow+orderNumberEps)>=remaining
          ? 'Fully allocated ('+formatOrderNumber(allocatedNow)+'/'+formatOrderNumber(remaining)+')'
          : allocatedNow>orderNumberEps
            ? 'Partially allocated ('+formatOrderNumber(allocatedNow)+'/'+formatOrderNumber(remaining)+')'
            : 'Unallocated';

      var allocRows=locations.length
        ? locations.map(function(r){
            var meta=getRowAllocationMeta(r,lineModeCtx);
            var inputValue=formatOrderNumber((autoAlloc.values||{})[r.rowNum]||0);
            return [
              '<div class="order-alloc-row">',
              '  <div>'+escapeHtml(r.warehouse)+'/'+escapeHtml(r.floor)+'/'+escapeHtml(r.location||'—')+'</div>',
              '  <div>Avail: <b>'+escapeHtml(meta.label)+'</b></div>',
              '  <input class="order-alloc-input" data-line-id="'+escapeHtml(line.lineId)+'" data-row="'+r.rowNum+'" type="number" min="0" max="'+formatOrderNumber(meta.available)+'" step="'+meta.step+'" value="'+inputValue+'" '+(meta.available<=orderNumberEps?'disabled':'')+'>',
              '</div>',
            ].join('');
          }).join('')
        : '<div class="order-empty">No available placement for this SKU.</div>';

      var canRenderCommit=tab!=='history'&&canOrderCommitData();
      var showEditable=tab!=='history'&&canOrderCommitData();
      var modeBaseUom=escapeHtml(lineModeCtx.baseUom||lineModeCtx.requestedUom||'');
      var modeBaseLabel=escapeHtml(lineModeCtx.baseUom||lineModeCtx.requestedUom||'n/a');

      return [
        '<div class="order-line-card '+(tab==='history'?'history':'')+'">',
        '  <div class="order-line-head">',
        '    <div><b>'+escapeHtml(line.type)+'</b> · '+escapeHtml(line.size)+' · '+escapeHtml(line.packet)+'</div>',
        '    <div class="order-status '+escapeHtml(String(line.status||'').toLowerCase())+'">'+escapeHtml(line.status)+'</div>',
        '  </div>',
        '  <div class="order-line-meta">Order '+escapeHtml(line.orderId)+' · Mode '+escapeHtml(lineModeCtx.modeLabel)+' · Requested '+formatOrderNumber(line.requestedQty)+' · Fulfilled '+formatOrderNumber(line.fulfilledQty||0)+' · Remaining '+formatOrderNumber(remaining)+'</div>',
        '  <div class="order-line-meta">Note: '+escapeHtml(line.notes||'—')+'</div>',
        tab!=='history'?('  <div class="order-alloc-status '+allocClass+'">'+allocText+'</div>'):'',
        showEditable?[
          '  <div class="order-edit-row">',
          '    <select id="ordermode-'+escapeHtml(line.lineId)+'" data-base-uom="'+modeBaseUom+'" data-sync-mode-target="orderqty-'+escapeHtml(line.lineId)+'">',
          '      <option value="UNIT" '+(lineModeCtx.requestedMode==='UNIT'?'selected':'')+'>UNIT</option>',
          '      <option value="BASE" '+(lineModeCtx.requestedMode==='BASE'?'selected':'')+' '+((!lineModeCtx.supportsBase&&lineModeCtx.requestedMode!=='BASE')?'disabled':'')+'>BASE ('+modeBaseLabel+')</option>',
          '    </select>',
          '    <input id="orderqty-'+escapeHtml(line.lineId)+'" type="number" min="'+lineModeCtx.min+'" step="'+lineModeCtx.step+'" value="'+formatOrderNumber(line.requestedQty)+'">',
          '    <input id="ordernote-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.notes||'')+'" placeholder="Note">',
          '    <button data-action="save-order-line" data-order-id="'+escapeHtml(line.orderId)+'" data-line-id="'+escapeHtml(line.lineId)+'">Save</button>',
          '    <button class="danger" data-action="cancel-order-line" data-order-id="'+escapeHtml(line.orderId)+'" data-line-id="'+escapeHtml(line.lineId)+'">Remove</button>',
          '  </div>',
        ].join(''):'',
        '  <div class="order-conflict hidden" id="orderconf-'+escapeHtml(line.lineId)+'"></div>',
        tab!=='history'?('  <div class="order-alloc-wrap">'+allocRows+'</div>'):'',
        canRenderCommit?[
          '  <div class="order-commit-row">',
          '    <button class="commit-btn" data-action="commit-order-line" data-order-id="'+escapeHtml(line.orderId)+'" data-line-id="'+escapeHtml(line.lineId)+'" data-remaining="'+formatOrderNumber(remaining)+'" '+(remaining<=orderNumberEps?'disabled':'')+'>Commit Line</button>',
          '  </div>',
        ].join(''):'',
        '</div>',
      ].join('\n');
    }).join('');
  }

  global.renderOutboundLinesHtml=renderOutboundLinesHtml;
})(typeof window!=='undefined'?window:this);
