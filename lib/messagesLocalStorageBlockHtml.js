/**
 * Injected immediately after <body> when shared cloud messages are on.
 * Blocks Storage keys matching /^messages_/ so the page cannot persist the wall locally — only Supabase.
 */
export const MESSAGE_WALL_LOCALSTORAGE_BLOCK = `<script>
(function(){
  try{
    if(window.__ONEDAY_BLOCK_MSG_LS__) return;
    window.__ONEDAY_BLOCK_MSG_LS__=1;
    var S=Storage.prototype;
    var os=S.setItem, og=S.getItem, or=S.removeItem;
    function blk(k){ return typeof k==='string' && /^messages_/i.test(k); }
    S.setItem=function(k,v){ if(blk(k)) return; return os.apply(this,arguments); };
    S.getItem=function(k){ if(blk(k)) return null; return og.apply(this,arguments); };
    S.removeItem=function(k){ if(blk(k)) return; return or.apply(this,arguments); };
  }catch(e){}
})();
<\/script>`;
