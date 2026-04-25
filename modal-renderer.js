(function(global){
  'use strict';

  function renderModalLocationRowsHtml(options){
    var opts=options&&typeof options==='object'?options:{};
    var group=opts.group&&typeof opts.group==='object'?opts.group:{locations:[],packetType:''};
    var locations=Array.isArray(group.locations)?group.locations:[];
    var warehouseOptions=Array.isArray(opts.warehouseOptions)?opts.warehouseOptions:[];
    var floorOptions=Array.isArray(opts.floorOptions)?opts.floorOptions:[];
    var orderNumberEps=Number.isFinite(opts.orderNumberEps)?opts.orderNumberEps:1e-6;

    var stockClass=typeof opts.stockClass==='function'?opts.stockClass:function(){return '';};
    var fmtRowQty=typeof opts.fmtRowQty==='function'?opts.fmtRowQty:function(){return '';};
    var normalizeOrderNumber=typeof opts.normalizeOrderNumber==='function'?opts.normalizeOrderNumber:function(v){return Number(v)||0;};
    var formatOrderNumber=typeof opts.formatOrderNumber==='function'?opts.formatOrderNumber:function(v){return String(v==null?'':v);};
    var escapeHtml=typeof opts.escapeHtml==='function'?opts.escapeHtml:function(v){return String(v==null?'':v);};
    var computeQtyTotals=typeof opts.computeQtyTotals==='function'?opts.computeQtyTotals:function(){return {};};
    var fmtQtyTotals=typeof opts.fmtQtyTotals==='function'?opts.fmtQtyTotals:function(){return '';};
    var packetUnitLabel=typeof opts.packetUnitLabel==='function'?opts.packetUnitLabel:function(){return 'units';};

    var byWh={};
    locations.forEach(function(row,index){
      var key=row&&row.warehouse?row.warehouse:'';
      if(!byWh[key]) byWh[key]=[];
      byWh[key].push({r:row,i:index});
    });

    return Object.entries(byWh).map(function(entry){
      var wh=entry[0];
      var items=entry[1];
      var whStock=items.reduce(function(sum,item){
        return sum+((item&&item.r&&item.r.stock)||0);
      },0);
      var whQty=fmtQtyTotals(computeQtyTotals(items.map(function(item){return item.r;})));

      var rows=items.map(function(item){
        var r=item.r;
        var i=item.i;
        var lsc=stockClass(r.stock);
        var rowQty=fmtRowQty(r);
        var qtyVal=r.qtyPerUnit!==null?r.qtyPerUnit:'';
        var unitVal=r.unit||'';
        var splitUnitVal=r.unit||'kg';
        var looseQty=Math.max(0,normalizeOrderNumber(r.looseQty));
        var looseSupported=!!unitVal&&r.qtyPerUnit!==null&&normalizeOrderNumber(r.qtyPerUnit)>orderNumberEps;
        var looseStep=unitVal==='kg'?'0.1':'1';

        return `
        <div class="location-row">
          <div class="location-row-header">
            <div class="location-row-info">
              <div class="location-row-loc">📍 ${escapeHtml(r.location)||'No location'}</div>
              <div class="location-row-floor">Floor: ${escapeHtml(r.floor)||'—'}</div>
              <div class="location-row-detail">${escapeHtml(r.details)||'—'}</div>
              ${rowQty?`<div class="location-row-qty">${escapeHtml(rowQty)}</div>`:''}
              <div class="location-row-loose" id="locloose-${i}">Loose: <b>${formatOrderNumber(looseQty)}</b>${unitVal?` ${escapeHtml(unitVal)}`:''}</div>
            </div>
            <div class="location-row-stock ${lsc}" id="locstock-${i}">${r.stock}</div>
          </div>
          <div class="location-controls">
            <button class="loc-qty-btn" data-action="adjust-loc-qty" data-index="${i}" data-delta="-1">−</button>
            <input class="loc-qty-input" id="locqty-${i}" type="number" min="0" value="${r.stock}">
            <button class="loc-qty-btn" data-action="adjust-loc-qty" data-index="${i}" data-delta="1">+</button>
            <button class="loc-save-btn" id="locsave-${i}" data-action="save-loc-stock" data-index="${i}">💾 Save</button>
          </div>
          <div class="loose-controls">
            <input class="loose-qty-input" id="looseqty-${i}" type="number" min="0" step="${looseStep}" value="${formatOrderNumber(looseQty)}" ${looseSupported?'':'disabled'}>
            <button class="loose-save-btn" id="loosesave-${i}" data-action="save-loose-qty" data-index="${i}" ${looseSupported?'':'disabled'}>Save Loose</button>
          </div>
          ${looseSupported?`<button class="loose-transfer-btn" data-action="toggle-loose-transfer-panel" data-index="${i}">↔ Transfer Loose</button>`:'<div class="loose-transfer-hint">Loose assignment requires qty/unit metadata</div>'}
          <div class="loose-transfer-panel" id="loosetransfer-${i}">
            <div class="loose-transfer-title">Transfer loose stock</div>
            <div class="row-edit-grid">
              <label>To Warehouse</label>
              <select class="placement-select" id="loosewh-${i}">
                ${warehouseOptions.map(function(w){return `<option value="${w}" ${r.warehouse===w?'selected':''}>${w}</option>`;}).join('')}
              </select>
              <label>To Floor</label>
              <select class="placement-select" id="loosefl-${i}">
                ${floorOptions.map(function(f){return `<option value="${f}" ${r.floor===f?'selected':''}>${f}</option>`;}).join('')}
              </select>
              <label>To Location</label>
              <input class="placement-input" id="looseloc-${i}" type="text" value="${escapeHtml(r.location)||''}" placeholder="Location">
              <label>Transfer Qty</label>
              <input class="qty-edit-input" id="loosetransferqty-${i}" type="number" min="${unitVal==='kg'?'0.1':'1'}" step="${looseStep}" value="${unitVal==='kg'?'0.1':'1'}">
            </div>
            <button class="row-save-btn" id="loosetransferconfirm-${i}" data-action="confirm-loose-transfer" data-index="${i}">Transfer Loose</button>
          </div>
          <button class="editor-toggle-btn" data-action="toggle-edit-panel" data-index="${i}">✏ Edit Row</button>
          <div class="row-edit-panel" id="editpanel-${i}">
            <div class="row-edit-grid">
              <label>Warehouse</label>
              <select class="placement-select" id="placewh-${i}">
                ${warehouseOptions.map(function(w){return `<option value="${w}" ${r.warehouse===w?'selected':''}>${w}</option>`;}).join('')}
              </select>
              <label>Floor</label>
              <select class="placement-select" id="placefl-${i}">
                ${floorOptions.map(function(f){return `<option value="${f}" ${r.floor===f?'selected':''}>${f}</option>`;}).join('')}
              </select>
              <label>Location</label>
              <input class="placement-input" id="placeloc-${i}" type="text" value="${escapeHtml(r.location)||''}" placeholder="Location">
              <label>Qty / Unit</label>
              <div class="row-edit-inline">
                <input class="qty-edit-input" id="qtyedit-${i}" type="number" min="0" step="0.1" value="${qtyVal}" placeholder="0">
                <select class="qty-unit-select" id="unitedit-${i}">
                  <option value="" ${unitVal===''?'selected':''}>—</option>
                  <option value="pcs" ${unitVal==='pcs'?'selected':''}>pcs</option>
                  <option value="kg"  ${unitVal==='kg'?'selected':''}>kg</option>
                </select>
              </div>
            </div>
            <button class="row-save-btn" id="rowsave-${i}" data-action="save-row-changes" data-index="${i}">Save Changes</button>
          </div>
          <button class="split-btn" data-action="toggle-split-panel" data-index="${i}">✂ Split / Move</button>
          <div class="split-panel" id="splitpanel-${i}">
            <div class="split-panel-title">✂ Split / Move — Row ${i+1}</div>
            <div class="split-row">
              <div class="split-field">
                <div class="split-field-label">Keep at ${escapeHtml(r.location)||'current'} (stock)</div>
                <input class="split-input" id="split-keep-${i}" type="number" min="0" value="${Math.max(0,r.stock-1)}">
              </div>
              <div class="split-field">
                <div class="split-field-label">Move (stock)</div>
                <input class="split-input" id="split-move-${i}" type="number" min="0" value="1">
              </div>
            </div>
            <div class="split-field">
              <div class="split-field-label">New Location</div>
              <input class="split-input" id="split-loc-${i}" type="text" placeholder="${escapeHtml(r.location)||'e.g. 6,2'}" value="${escapeHtml(r.location)||''}">
            </div>
            <div class="split-row">
              <div class="split-field">
                <div class="split-field-label">Qty/unit for new row</div>
                <input class="split-input" id="split-qty-${i}" type="number" min="0" step="0.1" value="${qtyVal||''}">
              </div>
              <div class="split-field">
                <div class="split-field-label">Unit</div>
                <select class="split-select" id="split-unit-${i}">
                  <option value="pcs" ${splitUnitVal==='pcs'?'selected':''}>pcs</option>
                  <option value="kg"  ${splitUnitVal==='kg'?'selected':''}>kg</option>
                </select>
              </div>
            </div>
            <div class="split-field">
              <div class="split-field-label">Packet Type for new row</div>
              <select class="split-select" id="split-packet-${i}">
                <option value="Box"      ${r.packetType==='Box'?'selected':''}>📦 Box</option>
                <option value="Jute Bag" ${r.packetType==='Jute Bag'?'selected':''}>🧺 Jute Bag</option>
                <option value="Packet"   ${r.packetType==='Packet'?'selected':''}>🛍 Packet</option>
              </select>
            </div>
            <button class="split-confirm-btn" id="splitconfirm-${i}" data-action="confirm-split-move" data-index="${i}">✂ Confirm Split / Move</button>
            <button class="split-cancel-btn" data-action="toggle-split-panel" data-index="${i}">Cancel</button>
          </div>
        </div>`;
      }).join('');

      return `
      <div class="wh-group">
        <div class="wh-group-header">
          <div class="wh-group-label ${escapeHtml(wh)}">${escapeHtml(wh)}</div>
          <div class="wh-group-stock">${whStock} ${packetUnitLabel(group.packetType)}${whQty?' · '+escapeHtml(whQty):''}</div>
        </div>
        ${rows}
      </div>`;
    }).join('');
  }

  global.renderModalLocationRowsHtml=renderModalLocationRowsHtml;
})(typeof window!=='undefined'?window:this);
