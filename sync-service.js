(function(global){
  'use strict';

  function createSyncService(options){
    var opts=options&&typeof options==='object'?options:{};
    var queueKey=String(opts.queueKey||'wh_offline_queue_v1');
    var storage=opts.storage&&typeof opts.storage.getItem==='function'&&typeof opts.storage.setItem==='function'
      ? opts.storage
      : null;
    var callApi=typeof opts.callApi==='function'?opts.callApi:null;
    var isQueueEnabled=typeof opts.isQueueEnabled==='function'?opts.isQueueEnabled:function(){return false;};
    var isOnline=typeof opts.isOnline==='function'?opts.isOnline:function(){return true;};
    var shouldQueueError=typeof opts.shouldQueueError==='function'?opts.shouldQueueError:function(){return false;};
    var createQueueId=typeof opts.createQueueId==='function'
      ? opts.createQueueId
      : function(){return 'q_'+Date.now();};
    var nowIso=typeof opts.nowIso==='function'
      ? opts.nowIso
      : function(){return new Date().toISOString();};

    if(!callApi) throw new Error('Sync service requires callApi');

    var queue=[];
    var flushing=false;

    function normalizeStringList(values){
      if(!Array.isArray(values)) return [];
      var out=[];
      for(var i=0;i<values.length;i+=1){
        var v=String(values[i]||'').trim();
        if(v) out.push(v);
      }
      return out;
    }

    function uniqueList(values){
      var out=[];
      var seen={};
      for(var i=0;i<values.length;i+=1){
        var key=String(values[i]);
        if(seen[key]) continue;
        seen[key]=true;
        out.push(values[i]);
      }
      return out;
    }

    function mapComments(commentValues){
      var rows=Array.isArray(commentValues)?commentValues:[];
      return rows.slice(1).map(function(r){
        return {
          timestamp:r&&r[0]?r[0]:'',
          item:r&&r[1]?r[1]:'',
          size:r&&r[2]?r[2]:'',
          comment:r&&r[3]?r[3]:'',
          author:r&&r[4]?r[4]:'Anonymous',
        };
      });
    }

    function loadQueue(){
      if(!storage){
        queue=[];
        return queue;
      }
      try{
        var raw=storage.getItem(queueKey);
        var parsed=raw?JSON.parse(raw):[];
        queue=Array.isArray(parsed)?parsed:[];
      }catch(e){
        queue=[];
      }
      return queue;
    }

    function saveQueue(){
      if(!storage) return;
      try{
        storage.setItem(queueKey,JSON.stringify(queue));
      }catch(e){}
    }

    function queueMutation(kind,payload){
      queue.push({
        id:createQueueId(),
        kind:kind,
        payload:payload,
        createdAt:nowIso(),
      });
      saveQueue();
    }

    async function processQueue(){
      if(!isQueueEnabled()||!queue.length||flushing){
        return {status:'idle',applied:0,blockedError:null,remaining:queue.length};
      }
      if(!isOnline()){
        return {status:'offline',applied:0,blockedError:null,remaining:queue.length};
      }

      flushing=true;
      var applied=0;
      var blockedError=null;
      try{
        while(queue.length>0){
          var item=queue[0];
          try{
            await callApi(item.payload);
            queue.shift();
            applied+=1;
            saveQueue();
          }catch(err){
            if(!shouldQueueError(err)) blockedError=err;
            break;
          }
        }
      }finally{
        flushing=false;
      }
      return {status:'done',applied:applied,blockedError:blockedError,remaining:queue.length};
    }

    async function mutateWithQueue(kind,payload){
      try{
        return await callApi(payload);
      }catch(err){
        if(isQueueEnabled()&&shouldQueueError(err)){
          queueMutation(kind,payload);
          return {success:true,queued:true};
        }
        throw err;
      }
    }

    async function fetchInventoryData(){
      var json=await callApi({action:'getData'});
      var safeJson=json&&typeof json==='object'?json:{};
      return {
        inventoryValues:Array.isArray(safeJson.inventoryValues)?safeJson.inventoryValues:[],
        rowVersions:(safeJson.rowVersions&&typeof safeJson.rowVersions==='object')?safeJson.rowVersions:{},
        commentValues:Array.isArray(safeJson.commentValues)?safeJson.commentValues:[],
      };
    }

    function buildInventoryState(snapshot,adapters){
      var data=snapshot&&typeof snapshot==='object'?snapshot:{};
      var deps=adapters&&typeof adapters==='object'?adapters:{};
      var parseRows=typeof deps.parseRows==='function'?deps.parseRows:null;
      var groupRows=typeof deps.groupRows==='function'?deps.groupRows:null;
      if(!parseRows||!groupRows) throw new Error('Sync service inventory adapters missing');

      var parsedRows=parseRows(data.inventoryValues||[],data.rowVersions||{});
      var groupedRows=groupRows(parsedRows);
      return {
        rawData:Array.isArray(parsedRows)?parsedRows:[],
        groups:Array.isArray(groupedRows)?groupedRows:[],
        allComments:mapComments(data.commentValues||[]),
      };
    }

    async function fetchRuntimeConfig(){
      var json=await callApi({action:'getConfig'});
      return json&&typeof json==='object'?json:{};
    }

    function buildRuntimeConfigState(config,defaults){
      var data=config&&typeof config==='object'?config:{};
      var baseline=defaults&&typeof defaults==='object'?defaults:{};
      var defaultWarehouses=Array.isArray(baseline.defaultWarehouses)?baseline.defaultWarehouses:[];
      var defaultFloors=Array.isArray(baseline.defaultFloors)?baseline.defaultFloors:[];
      var warehouses=normalizeStringList(data.warehouses);
      var floors=normalizeStringList(data.floors);

      return {
        warehouses:warehouses.length?uniqueList(warehouses):defaultWarehouses.slice(),
        floors:floors.length?uniqueList(floors):defaultFloors.slice(),
        searchAliases:(data.searchAliases&&typeof data.searchAliases==='object')?data.searchAliases:{},
        featureFlags:(data.featureFlags&&typeof data.featureFlags==='object')?data.featureFlags:{},
        role:String(data.role||'operator').toLowerCase(),
        permissions:(data.permissions&&typeof data.permissions==='object')?data.permissions:{
          canRead:true,
          canWrite:true,
          canUndo:false,
          canOrderCommit:false,
          canAdmin:false,
        },
      };
    }

    return {
      loadQueue:loadQueue,
      saveQueue:saveQueue,
      processQueue:processQueue,
      mutateWithQueue:mutateWithQueue,
      fetchInventoryData:fetchInventoryData,
      buildInventoryState:buildInventoryState,
      fetchRuntimeConfig:fetchRuntimeConfig,
      buildRuntimeConfigState:buildRuntimeConfigState,
      getQueueCount:function(){return queue.length;},
      isFlushing:function(){return flushing;},
    };
  }

  global.createSyncService=createSyncService;
})(typeof window!=='undefined'?window:this);
