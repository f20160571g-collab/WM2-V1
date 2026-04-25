(function(global){
  'use strict';

  function renderUndoPicker(options){
    var opts=options&&typeof options==='object'?options:{};
    var selectEl=opts.selectEl||null;
    var undoBtn=opts.undoBtn||null;
    var canUndo=!!opts.canUndo;
    var actions=Array.isArray(opts.actions)?opts.actions:[];
    var previousValue=String(opts.previousValue||'');
    var fmtTime=typeof opts.fmtTime==='function'
      ? opts.fmtTime
      : function(v){return String(v==null?'':v);};
    var escapeHtml=typeof opts.escapeHtml==='function'
      ? opts.escapeHtml
      : function(v){return String(v==null?'':v);};

    if(!selectEl) return;

    if(!canUndo){
      selectEl.innerHTML='<option value="">Undo unavailable for this role</option>';
      selectEl.disabled=true;
      if(undoBtn) undoBtn.disabled=true;
      return;
    }

    if(!actions.length){
      selectEl.innerHTML='<option value="">No recent undo actions</option>';
      selectEl.disabled=true;
      if(undoBtn) undoBtn.disabled=true;
      return;
    }

    var optionHtml=['<option value="">Undo latest action</option>'];
    actions.forEach(function(action){
      var ts=fmtTime(action.timestamp);
      var loc=[action.warehouse,action.floor,action.location].filter(Boolean).join('/');
      var label=(ts+' · '+(action.action||'')+' · '+(action.type||'—')+' '+(action.size||'')+' '+(loc?('@ '+loc):'')).trim();
      optionHtml.push('<option value="'+escapeHtml(action.requestId)+'">'+escapeHtml(label)+'</option>');
    });

    selectEl.innerHTML=optionHtml.join('');
    selectEl.value=actions.some(function(action){return action.requestId===previousValue;})?previousValue:'';
    selectEl.disabled=false;
    if(undoBtn) undoBtn.disabled=false;
  }

  global.renderUndoPicker=renderUndoPicker;
})(typeof window!=='undefined'?window:this);
