(function(global){
  'use strict';

  function renderCommentsPanel(options){
    var opts=options&&typeof options==='object'?options:{};
    var listEl=opts.listEl||null;
    var comments=Array.isArray(opts.comments)?opts.comments:[];
    var escapeHtml=typeof opts.escapeHtml==='function'
      ? opts.escapeHtml
      : function(v){return String(v==null?'':v);};
    var fmtTime=typeof opts.fmtTime==='function'
      ? opts.fmtTime
      : function(v){return String(v==null?'':v);};

    if(!listEl) return;

    if(!comments.length){
      listEl.innerHTML='<div class="no-comments">No comments yet</div>';
      return;
    }

    listEl.innerHTML=comments.slice().reverse().map(function(c){
      return [
        '<div class="comment-item">',
        '  <div class="comment-meta">',
        '    <span class="comment-author">'+escapeHtml(c.author)+'</span>',
        '    <span class="comment-time">'+escapeHtml(fmtTime(c.timestamp))+'</span>',
        '  </div>',
        '  <div class="comment-text">'+escapeHtml(c.comment)+'</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  global.renderCommentsPanel=renderCommentsPanel;
})(typeof window!=='undefined'?window:this);
