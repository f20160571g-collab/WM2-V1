(function(global){
  'use strict';

  function wait(ms){
    return new Promise(function(resolve){
      setTimeout(resolve,ms);
    });
  }

  function createApiClient(options){
    var opts=options&&typeof options==='object'?options:{};
    var fetchImpl=typeof opts.fetchImpl==='function'
      ? opts.fetchImpl
      : (typeof global.fetch==='function'?global.fetch.bind(global):null);
    var getSessionToken=typeof opts.getSessionToken==='function'?opts.getSessionToken:function(){return '';};
    var clearSession=typeof opts.clearSession==='function'?opts.clearSession:function(){};
    var getActorName=typeof opts.getActorName==='function'?opts.getActorName:function(){return 'web-user';};
    var generateRequestId=typeof opts.generateRequestId==='function'
      ? opts.generateRequestId
      : function(){return 'req_'+Date.now();};
    var isRetryableError=typeof opts.isRetryableError==='function'?opts.isRetryableError:function(){return true;};

    if(!fetchImpl) throw new Error('Fetch API is not available.');

    return {
      call:async function(payload){
        var request=payload&&typeof payload==='object'?payload:{};
        var action=String(request.action||'').trim();
        var token=getSessionToken();
        if(action!=='authenticate'&&!token) throw new Error('Session expired. Please login again.');

        var requestPayload=action==='authenticate'
          ? request
          : Object.assign({},request,{
            token:token,
            actor:request.actor||getActorName(),
            requestId:request.requestId||generateRequestId(),
          });

        var maxAttempts=action==='authenticate'
          ? 1
          : Math.max(1,parseInt(opts.retryMaxAttempts,10)||1);
        var retryBaseMs=Math.max(0,parseInt(opts.retryBaseMs,10)||0);

        for(var attempt=1;attempt<=maxAttempts;attempt+=1){
          try{
            var res=await fetchImpl(opts.url,{
              method:'POST',
              redirect:'follow',
              headers:{'Content-Type':'text/plain'},
              body:JSON.stringify(requestPayload),
            });
            var json=await res.json().catch(function(){
              return {success:false,error:'Invalid server response.',code:'BAD_RESPONSE'};
            });
            if(json.code==='AUTH_REQUIRED') clearSession();
            if(!json.success){
              var err=new Error(json.error||'Server returned an error.');
              err.code=json.code||'';
              err.status=res.status;
              err.details=json.details||null;
              throw err;
            }
            return json;
          }catch(err){
            var shouldRetry=attempt<maxAttempts&&isRetryableError(err);
            if(!shouldRetry) throw err;
            await wait(retryBaseMs*Math.pow(2,attempt-1));
          }
        }

        throw new Error('Request failed after retries.');
      },
    };
  }

  global.createApiClient=createApiClient;
})(typeof window!=='undefined'?window:this);
