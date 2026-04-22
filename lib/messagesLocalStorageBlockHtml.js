/**
 * Injected immediately after <body> when shared cloud interactions are on (service role).
 * Blocks localStorage for keys the generator uses for messages / RSVP / poll so only Supabase applies.
 * Does not block photos (photos_*) or OneDay client keys (onet_*).
 */
export const SHARED_CLOUD_LOCALSTORAGE_BLOCK = `<script>
(function(){
  try{
    if(window.__ONEDAY_BLOCK_SHARED_LS__) return;
    window.__ONEDAY_BLOCK_SHARED_LS__=1;
    // Cloud pages use INTERACTIONS_CLOUD as the single photo engine.
    // Block legacy per-page photo injector (injectPhotoUpload) from re-wiring controls.
    window.__ONEDAY_PHOTO_UPLOAD_INJECTED__ = 1;
    var S=Storage.prototype;
    var os=S.setItem, og=S.getItem, or=S.removeItem;
    function blk(k){
      if(typeof k!=='string') return false;
      return /^(messages_|rsvps_|rsvp_|poll_)/i.test(k);
    }
    S.setItem=function(k,v){ if(blk(k)) return; return os.apply(this,arguments); };
    S.getItem=function(k){ if(blk(k)) return null; return og.apply(this,arguments); };
    S.removeItem=function(k){ if(blk(k)) return; return or.apply(this,arguments); };
  }catch(e){}
})();
<\/script>`;

/** @deprecated Use SHARED_CLOUD_LOCALSTORAGE_BLOCK */
export const MESSAGE_WALL_LOCALSTORAGE_BLOCK = SHARED_CLOUD_LOCALSTORAGE_BLOCK;
