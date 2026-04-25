(function(global){
  'use strict';

  function createEventRouter(options){
    var opts=options&&typeof options==='object'?options:{};
    var root=opts.root||null;
    if(!root||typeof root.addEventListener!=='function'){
      throw new Error('Event router requires a valid root element');
    }

    var handlers={};
    var isBound=false;

    function handleClick(event){
      var target=event&&event.target&&typeof event.target.closest==='function'
        ? event.target.closest('[data-action]')
        : null;
      if(!target) return;

      var action=String(target.dataset.action||'').trim();
      if(!action||typeof handlers[action]!=='function') return;

      event.preventDefault();
      handlers[action]({
        event:event,
        target:target,
        action:action,
      });
    }

    return {
      register:function(action,handler){
        var key=String(action||'').trim();
        if(!key||typeof handler!=='function') return;
        handlers[key]=handler;
      },
      bind:function(){
        if(isBound) return;
        root.addEventListener('click',handleClick);
        isBound=true;
      },
    };
  }

  global.createEventRouter=createEventRouter;
})(typeof window!=='undefined'?window:this);
