(function(global){
  'use strict';

  function renderFilterChipGroup(options){
    var opts=options&&typeof options==='object'?options:{};
    var wrapEl=opts.wrapEl||null;
    var values=Array.isArray(opts.values)?opts.values:[];
    var activeValue=String(opts.activeValue||'');
    var allValue=String(opts.allValue||'ALL');
    var allLabel=String(opts.allLabel||'All');
    var onSelect=typeof opts.onSelect==='function'?opts.onSelect:null;

    if(!wrapEl) return;
    wrapEl.innerHTML='';

    values.forEach(function(value){
      var chip=document.createElement('div');
      chip.className=('fp-chip '+(activeValue===value?'active-blue':'')).trim();
      chip.textContent=value===allValue?allLabel:value;
      chip.onclick=function(){
        if(onSelect) onSelect(value);
      };
      wrapEl.appendChild(chip);
    });
  }

  function renderTypeFilterChips(options){
    var opts=options&&typeof options==='object'?options:{};
    var wrapEl=opts.wrapEl||null;
    var types=Array.isArray(opts.types)?opts.types:[];
    var activeType=String(opts.activeType||'ALL');
    var onSelect=typeof opts.onSelect==='function'?opts.onSelect:null;

    if(!wrapEl) return;
    wrapEl.innerHTML='';

    types.forEach(function(type){
      var chip=document.createElement('div');
      chip.className='fp-chip'+(type===activeType?' active':'');
      chip.dataset.type=type;
      chip.textContent=type==='ALL'?'All':type;
      chip.onclick=function(){
        if(onSelect) onSelect(chip);
      };
      wrapEl.appendChild(chip);
    });
  }

  global.renderFilterChipGroup=renderFilterChipGroup;
  global.renderTypeFilterChips=renderTypeFilterChips;
})(typeof window!=='undefined'?window:this);
