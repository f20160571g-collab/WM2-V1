(function(global){
  'use strict';

  function createCommentsService(options){
    var opts=options&&typeof options==='object'?options:{};
    var enqueueMutation=typeof opts.enqueueMutation==='function'?opts.enqueueMutation:null;
    var generateRequestId=typeof opts.generateRequestId==='function'
      ? opts.generateRequestId
      : function(){return 'req_'+Date.now();};
    var getActorName=typeof opts.getActorName==='function'
      ? opts.getActorName
      : function(){return 'web-user';};

    if(!enqueueMutation) throw new Error('Comments service requires enqueueMutation');

    async function addComment(input){
      var data=input&&typeof input==='object'?input:{};
      var item=String(data.item||'').trim();
      var size=String(data.size||'').trim();
      var comment=String(data.comment||'').trim();
      var author=String(data.author||'Anonymous').trim()||'Anonymous';

      if(!item||!size) throw new Error('Comment target is missing.');
      if(!comment) throw new Error('Please enter a comment');

      return enqueueMutation('addComment',{
        action:'addComment',
        item:item,
        size:size,
        comment:comment,
        author:author,
        requestId:generateRequestId(),
        actor:getActorName(),
      });
    }

    return {
      addComment:addComment,
    };
  }

  global.createCommentsService=createCommentsService;
})(typeof window!=='undefined'?window:this);
