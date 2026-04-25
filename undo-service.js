(function(global){
  'use strict';

  function createUndoService(options){
    var opts=options&&typeof options==='object'?options:{};
    var callApi=typeof opts.callApi==='function'?opts.callApi:null;

    if(!callApi) throw new Error('Undo service requires callApi');

    async function listCandidates(input){
      var data=input&&typeof input==='object'?input:{};
      var limit=Math.max(1,parseInt(data.limit,10)||15);
      var json=await callApi({action:'listUndoCandidates',limit:limit});
      var actions=json&&Array.isArray(json.actions)?json.actions:[];
      return {actions:actions};
    }

    async function executeUndo(input){
      var data=input&&typeof input==='object'?input:{};
      return callApi({
        action:'undo',
        targetRequestId:String(data.targetRequestId||'').trim(),
      });
    }

    return {
      listCandidates:listCandidates,
      executeUndo:executeUndo,
    };
  }

  global.createUndoService=createUndoService;
})(typeof window!=='undefined'?window:this);
