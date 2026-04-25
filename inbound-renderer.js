(function(global){
  'use strict';

  function renderInboundLinesHtml(options){
    var opts=options&&typeof options==='object'?options:{};
    var view=opts.view&&typeof opts.view==='object'?opts.view:{};
    var tab=String(view.tab||'drafts');
    var linesToRender=Array.isArray(opts.linesToRender)?opts.linesToRender:[];
    var escapeHtml=typeof opts.escapeHtml==='function'?opts.escapeHtml:function(v){return String(v==null?'':v);};
    var canOrderCommitData=typeof opts.canOrderCommitData==='function'?opts.canOrderCommitData:function(){return false;};
    var minDate=String(opts.minDate||'').trim();
    var maxDate=String(opts.maxDate||'').trim();

    return linesToRender.map(function(line){
      var status=String(line.status||'DRAFT').toLowerCase();
      var editable=tab==='drafts'&&status==='draft'&&canOrderCommitData();
      var receiptDate=String(line.receiptDate||'').trim();
      var qtyPerUnit=line.qtyPerUnit==null?'':String(line.qtyPerUnit);
      var looseQty=line.looseQty==null?'0':String(line.looseQty);

      return [
        '<div class="receipt-line-card '+(tab==='history'?'history':'')+'">',
        '  <div class="receipt-line-head">',
        '    <div><b>'+escapeHtml(line.type)+'</b> · '+escapeHtml(line.size)+' · '+escapeHtml(line.packet)+'</div>',
        '    <div class="receipt-status '+escapeHtml(status)+'">'+escapeHtml(line.status||'DRAFT')+'</div>',
        '  </div>',
        '  <div class="receipt-line-meta">Details '+escapeHtml(line.details||'—')+'</div>',
        '  <div class="receipt-line-meta">Receipt '+escapeHtml(line.receiptId)+' · Line '+escapeHtml(line.lineId)+'</div>',
        '  <div class="receipt-line-meta">Placement '+escapeHtml(line.warehouse||'—')+'/'+escapeHtml(line.floor||'—')+'/'+escapeHtml(line.location||'—')+'</div>',
        editable?[
          '  <div class="receipt-edit-grid">',
          '    <input id="rec-type-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.type||'')+'" placeholder="Type">',
          '    <input id="rec-size-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.size||'')+'" placeholder="Size">',
          '    <input id="rec-details-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.details||'')+'" placeholder="Description / Details">',
          '    <select id="rec-packet-'+escapeHtml(line.lineId)+'">',
          '      <option value="Box" '+(String(line.packet)==='Box'?'selected':'')+'>Box</option>',
          '      <option value="Jute Bag" '+(String(line.packet)==='Jute Bag'?'selected':'')+'>Jute Bag</option>',
          '      <option value="Packet" '+(String(line.packet)==='Packet'?'selected':'')+'>Packet</option>',
          '    </select>',
          '    <input id="rec-wh-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.warehouse||'')+'" placeholder="Warehouse">',
          '    <input id="rec-floor-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.floor||'')+'" placeholder="Floor">',
          '    <input id="rec-loc-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.location||'')+'" placeholder="Location">',
          '    <input id="rec-qty-'+escapeHtml(line.lineId)+'" type="number" min="1" step="1" value="'+escapeHtml(line.receivedQty||1)+'" placeholder="Received qty">',
          '    <input id="rec-date-'+escapeHtml(line.lineId)+'" type="date" min="'+escapeHtml(minDate)+'" max="'+escapeHtml(maxDate)+'" value="'+escapeHtml(receiptDate)+'">',
          '    <input id="rec-qpu-'+escapeHtml(line.lineId)+'" type="number" min="0" step="0.1" value="'+escapeHtml(qtyPerUnit)+'" placeholder="Qty per unit">',
          '    <select id="rec-unit-'+escapeHtml(line.lineId)+'">',
          '      <option value="" '+(!line.unit?'selected':'')+'>Unit</option>',
          '      <option value="kg" '+(String(line.unit)==='kg'?'selected':'')+'>kg</option>',
          '      <option value="pcs" '+(String(line.unit)==='pcs'?'selected':'')+'>pcs</option>',
          '    </select>',
          '    <input id="rec-loose-'+escapeHtml(line.lineId)+'" type="number" min="0" step="0.1" value="'+escapeHtml(looseQty)+'" placeholder="Loose qty">',
          '    <input id="rec-note-'+escapeHtml(line.lineId)+'" type="text" value="'+escapeHtml(line.notes||'')+'" placeholder="Notes">',
          '  </div>',
          '  <div class="receipt-line-actions">',
          '    <button data-action="save-receipt-line" data-receipt-id="'+escapeHtml(line.receiptId)+'" data-line-id="'+escapeHtml(line.lineId)+'">Save</button>',
          '    <button class="danger" data-action="cancel-receipt-line" data-receipt-id="'+escapeHtml(line.receiptId)+'" data-line-id="'+escapeHtml(line.lineId)+'">Cancel</button>',
          '    <button class="post" data-action="post-receipt-line" data-receipt-id="'+escapeHtml(line.receiptId)+'" data-line-id="'+escapeHtml(line.lineId)+'">Post</button>',
          '  </div>',
        ].join(''):[
          '  <div class="receipt-line-meta">Qty '+escapeHtml(line.receivedQty||0)+' · Receipt Date '+escapeHtml(receiptDate||'—')+'</div>',
          '  <div class="receipt-line-meta">Note: '+escapeHtml(line.notes||'—')+'</div>',
          line.postedAt?('  <div class="receipt-line-meta">Posted '+escapeHtml(String(line.postedAt))+'</div>'):'',
        ].join(''),
        '</div>',
      ].join('\n');
    }).join('');
  }

  global.renderInboundLinesHtml=renderInboundLinesHtml;
})(typeof window!=='undefined'?window:this);
