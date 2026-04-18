import { createClient } from '@supabase/supabase-js';
import { INTERACTIONS_CLOUD } from '../../lib/interactionsCloudHtml';
import { SHARED_CLOUD_LOCALSTORAGE_BLOCK } from '../../lib/messagesLocalStorageBlockHtml';
import { MAX_EVENT_PHOTOS, MAX_PHOTO_BYTES } from '../../lib/photoLimits';

function injectAfterBodyOpen(html, snippet) {
  const lower = html.toLowerCase();
  const idx = lower.indexOf('<body');
  if (idx === -1) return html;
  const gt = html.indexOf('>', idx);
  if (gt === -1) return html;
  const insertAt = gt + 1;
  return html.slice(0, insertAt) + snippet + html.slice(insertAt);
}

/** When env is set, injected script uploads to S3 + Supabase so all guests see the same photos. */
function eventPhotosUseS3() {
  return Boolean(
    process.env.AWS_S3_BUCKET &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

/** Shared messages + poll + RSVPs via Supabase when service role is set (same as shared photos). */
function eventInteractionsUseCloud() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// ─── PHOTO ENGINE ────────────────────────────────────────────────────────────
// Injected at serve time on every event page — the single source of truth for
// photo upload. Finds "Add Photos" buttons by text/class, wires them to fresh
// file inputs, and renders saved photos into the nearest grid (forward scan).
//
// Key design decisions:
//  • cloneNode() strips old addEventListener listeners → no double-picker problem
//  • Forward DOM scan (next siblings) finds each section's OWN grid correctly
//  • data-oneday-managed prevents two buttons from sharing one grid
//  • photos_<eid>_global key for single-gallery mode
// ─────────────────────────────────────────────────────────────────────────────
const PHOTO_ENGINE_LEGACY = `<script>
(function(){
  function bootPhotoLegacy(){
    var eid = (window.location.pathname.split('/').pop() || 'event').slice(0,30);
    var GCSS = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:14px;';
    var GSEL = '[class*="photo-grid"],[id*="photo-grid"],[class*="photoGrid"],[id*="photoGrid"],[class*="photo-list"],[id*="photo-list"]';

    // 1. Kill Claude's native renderers so they never overwrite our grid
    ['buildPhotoGrid','renderPhotoGrid','refreshPhotos','displayPhotos',
     'handlePhotoUpload','onPhotoUpload','photoUploadHandler'].forEach(function(fn){
      if(typeof window[fn]==='function') window[fn]=function(){};
    });

    // 2. Forward-scan: find the next grid element AFTER el in the DOM.
    //    Scanning forward (not upward) means section-2's button
    //    finds section-2's grid, not section-1's.
    function findNextGrid(el){
      // Check siblings of el first
      var s=el.nextElementSibling;
      while(s){
        if(s.matches&&s.matches(GSEL)) return s;
        var c=s.querySelector&&s.querySelector(GSEL);
        if(c) return c;
        s=s.nextElementSibling;
      }
      // Check siblings of parent
      var p=el.parentElement;
      if(p){
        s=p.nextElementSibling;
        while(s){
          if(s.matches&&s.matches(GSEL)) return s;
          var c2=s.querySelector&&s.querySelector(GSEL);
          if(c2) return c2;
          s=s.nextElementSibling;
        }
      }
      return null;
    }

    // Match original OneDay behavior (+ case-insensitive text + file-picker labels).
    // Do not exclude by #poll — some layouts nest sections oddly and uploads would disappear.
    function isPhotoUploadControl(el){
      var fo=(el.getAttribute('for')||'');
      if(el.tagName==='LABEL'&&/^photo-input/i.test(fo)) return true;
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      var c=(el.getAttribute('class')||'').toLowerCase();
      return (
        ((/add|upload|share/.test(t)) && (/(photo|pic|memory|moment)/.test(t))) ||
        t.indexOf('add photo')!==-1 ||
        t.indexOf('upload photo')!==-1 ||
        c.indexOf('btn-upload')!==-1 ||
        c.indexOf('upload-btn')!==-1
      );
    }
    function alreadyWired(el){
      var n=el.nextElementSibling;
      return n&&n.getAttribute&&n.getAttribute('data-oneday-engine')==='1';
    }
    var buttons=Array.from(
      document.querySelectorAll('button,label,a,[role="button"]')
    ).filter(function(el){
      if(alreadyWired(el)) return false;
      return isPhotoUploadControl(el);
    });

    // Fallback for templates that have a photo grid but no detectable upload control text/class.
    if(!buttons.length){
      Array.from(document.querySelectorAll(GSEL)).forEach(function(grid){
        var host = grid.closest('section') || grid.parentElement;
        if(!host) return;
        var existing = host.querySelector('button[class*="upload"],label[class*="upload"],button[class*="photo"],label[class*="photo"]');
        var ctl = existing;
        if(!ctl){
          ctl = document.createElement('button');
          ctl.type = 'button';
          ctl.className = 'upload-btn oneday-upload-fallback';
          ctl.textContent = 'Add Photos';
          grid.parentNode.insertBefore(ctl, grid.nextSibling);
        }
        if(!alreadyWired(ctl)) buttons.push(ctl);
      });
    }

    // 4. Wire each button
    if (!buttons.length) return;

    var primaryBtn = buttons[0];
    buttons.slice(1).forEach(function(extraBtn){
      extraBtn.style.setProperty('display', 'none', 'important');
      extraBtn.setAttribute('aria-hidden', 'true');
    });

    [primaryBtn].forEach(function(btn){
      var key='photos_'+eid+'_global';

      // Clone to wipe ALL existing event listeners (prevents double file-picker)
      var fb=btn.cloneNode(true);
      btn.parentNode.replaceChild(fb,btn);
      fb.removeAttribute('onclick');
      if(fb.tagName==='LABEL') fb.removeAttribute('for');

      // Create a hidden file input right after the button
      var inp=document.createElement('input');
      inp.type='file'; inp.accept='image/*'; inp.multiple=true;
      inp.setAttribute('data-oneday-engine','1');
      inp.style.cssText='position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';
      fb.parentNode.insertBefore(inp,fb.nextSibling);

      // Hide Claude's original file inputs in this section so only our picker + keys are used
      var secHide=fb.closest('section')||fb.parentElement;
      if(secHide){
        secHide.querySelectorAll('input[type=file]').forEach(function(oldInp){
          if(!oldInp.getAttribute('data-oneday-engine')){
            oldInp.style.setProperty('display','none','important');
            oldInp.setAttribute('aria-hidden','true');
            oldInp.setAttribute('tabindex','-1');
          }
        });
      }

      // Button click → open our picker
      fb.style.cursor='pointer';
      fb.textContent = 'Add Photos';
      fb.onclick=function(e){ e.preventDefault(); inp.click(); };

      // Find or create this section's grid
      var grid=findNextGrid(fb);
      if(!grid||grid.dataset.onedayManaged){
        grid=document.createElement('div');
        inp.parentNode.insertBefore(grid,inp.nextSibling);
      }
      grid.dataset.onedayManaged='1';
      grid.style.cssText=GCSS;
      grid.innerHTML=''; // clear Claude's placeholder tiles

      // Render saved photos from localStorage
      function render(){
        var saved=[];
        try{ saved=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){}
        grid.innerHTML='';
        saved.forEach(function(src,i){
          var w=document.createElement('div');
          w.style.cssText='position:relative;aspect-ratio:1 / 1;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;box-sizing:border-box;';
          var im=document.createElement('img');
          im.src=src;
          im.style.cssText='width:100%;height:100%;object-fit:cover;object-position:center;border-radius:10px;display:block;';
          var b=document.createElement('button');
          b.innerHTML='&times;';
          b.title='Remove photo';
          b.style.cssText='position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:18px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
          b.setAttribute('data-i',i);
          b.onclick=function(e){
            e.stopPropagation();
            var n=+this.getAttribute('data-i');
            var a=[];
            try{ a=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e2){}
            a.splice(n,1);
            localStorage.setItem(key,JSON.stringify(a));
            render();
          };
          w.appendChild(im); w.appendChild(b); grid.appendChild(w);
        });
      }

      render(); // show any previously saved photos on page load

      // Handle file selection
      inp.addEventListener('change',function(){
        var files=Array.from(this.files);
        if(!files.length) return;
        var arr=[];
        try{ arr=JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){}
        if(arr.length+files.length>${MAX_EVENT_PHOTOS}){
          alert('Max ${MAX_EVENT_PHOTOS} photos per event.'); this.value=''; return;
        }
        var pending=files.length;
        files.forEach(function(file){
          if(file.size>${MAX_PHOTO_BYTES}){
            alert(file.name+' exceeds 5 MB — please resize it first.');
            pending--; if(pending<=0) render(); return;
          }
          var r=new FileReader();
          r.onload=function(ev){
            arr.push(ev.target.result);
            localStorage.setItem(key,JSON.stringify(arr));
            pending--;
            if(pending<=0) render();
          };
          r.readAsDataURL(file);
        });
        this.value='';
      });
    });

  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(bootPhotoLegacy, 0);
    setTimeout(bootPhotoLegacy, 200);
    setTimeout(bootPhotoLegacy, 500);
    setTimeout(bootPhotoLegacy, 1200);
    var n=0;
    var iv=setInterval(function(){
      bootPhotoLegacy();
      n++;
      if(n>=30) clearInterval(iv);
    }, 200);
  });
  window.addEventListener('load', function(){ setTimeout(bootPhotoLegacy, 0); });

  // ── RSVP + Message Wall rescue ───────────────────────────────────────────
  // Must run AFTER other DOMContentLoaded handlers (Claude's) so window.submitMessage / editMsg exist.
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      function wireOnclickBtn(btn) {
        if (btn.dataset.onedayWired) return;
        btn.dataset.onedayWired = '1';
        var oc = btn.getAttribute('onclick') || '';
        if (!oc) return;
        var m = oc.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(([^)]*)\\)/);
        if (!m) return;
        var fnName = m[1], rawArgs = m[2] || '';
        btn.removeAttribute('onclick');
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var fn = window[fnName];
          if (typeof fn !== 'function') return;
          var args = rawArgs.split(',').map(function(a) {
            a = a.trim();
            if (a === '') return undefined;
            if (!isNaN(a)) return Number(a);
            return a.replace(/^['"]|['"]$/g, '');
          }).filter(function(a) { return a !== undefined; });
          fn.apply(null, args);
        });
      }

      document.querySelectorAll('[onclick]').forEach(wireOnclickBtn);

      var msgContainers = document.querySelectorAll(
        '#msgList,#messageList,#msg-list,[class*="msg-list"],[class*="message-list"],[id*="messages"],[class*="message-wall"],[id*="message-wall"],[class*="guest-msg"],[id*="guest-msg"],section[class*="message"]'
      );
      msgContainers.forEach(function(container) {
        container.querySelectorAll('[onclick]').forEach(wireOnclickBtn);
        new MutationObserver(function(mutations) {
          mutations.forEach(function(mut) {
            mut.addedNodes.forEach(function(node) {
              if (node.nodeType !== 1) return;
              if (node.matches && node.matches('[onclick]')) wireOnclickBtn(node);
              node.querySelectorAll && node.querySelectorAll('[onclick]').forEach(wireOnclickBtn);
            });
          });
        }).observe(container, { childList: true, subtree: true });
      });

      var msgSubmitBtns = document.querySelectorAll(
        '.btn-post,.btn-send,.btn-submit-msg,[class*="btn-post"],[id*="postBtn"],[id*="sendBtn"],[id*="msgBtn"],[id*="submitMsg"],[id*="postMessage"],button[class*="post-message"]'
      );
      msgSubmitBtns.forEach(function(btn) {
        if (btn.dataset.onedayWired) return;
        var fn = window.submitMessage || window.sendMessage || window.addMessage ||
                  window.submitGuestMessage || window.postGuestMessage;
        if (typeof fn === 'function') {
          btn.dataset.onedayWired = '1';
          btn.addEventListener('click', function(e) { e.preventDefault(); fn(); });
        }
      });
    }, 0);
  });

})();
<\/script>`;

/** S3-backed gallery: same UI hooks as legacy; photos load from /api/event-photos/list for all visitors. */
const PHOTO_ENGINE_S3 = `<script>
(function(){
  function bootPhotoS3(){
    var eid = (window.__ONEDAY_EID__ || window.location.pathname.split('/').pop() || 'event').slice(0,80);
    var GCSS = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:14px;';
    var GSEL = '[class*="photo-grid"],[id*="photo-grid"],[class*="photoGrid"],[id*="photoGrid"],[class*="photo-list"],[id*="photo-list"]';

    ['buildPhotoGrid','renderPhotoGrid','refreshPhotos','displayPhotos',
     'handlePhotoUpload','onPhotoUpload','photoUploadHandler'].forEach(function(fn){
      if(typeof window[fn]==='function') window[fn]=function(){};
    });

    function findNextGrid(el){
      var s=el.nextElementSibling;
      while(s){
        if(s.matches&&s.matches(GSEL)) return s;
        var c=s.querySelector&&s.querySelector(GSEL);
        if(c) return c;
        s=s.nextElementSibling;
      }
      var p=el.parentElement;
      if(p){
        s=p.nextElementSibling;
        while(s){
          if(s.matches&&s.matches(GSEL)) return s;
          var c2=s.querySelector&&s.querySelector(GSEL);
          if(c2) return c2;
          s=s.nextElementSibling;
        }
      }
      return null;
    }

    function hideEmptyPhotoCopy(grid, hasPhotos){
      if(!hasPhotos) return;
      var root = grid.closest('section') || grid.parentElement;
      if(!root) return;
      Array.prototype.slice.call(root.querySelectorAll('p,div,span,em,strong,small,i')).forEach(function(el){
        if(grid.contains(el)) return;
        var tx = (el.textContent || '').toLowerCase();
        if(tx.indexOf('no photo') !== -1 || tx.indexOf('be the first') !== -1 || (tx.indexOf('share') !== -1 && tx.indexOf('first') !== -1)) el.style.display = 'none';
      });
    }

    function loadGrid(grid, si){
      fetch('/api/event-photos/list?eventId='+encodeURIComponent(eid)+'&sectionIndex='+si)
        .then(function(r){ return r.json(); })
        .then(function(d){
          var photos = (d && d.photos) ? d.photos : [];
          grid.innerHTML='';
          photos.forEach(function(p){
            var w=document.createElement('div');
            w.style.cssText='position:relative;aspect-ratio:1 / 1;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;box-sizing:border-box;';
            var im=document.createElement('img');
            im.src=p.url;
            im.alt='';
            im.style.cssText='width:100%;height:100%;object-fit:cover;object-position:center;border-radius:10px;display:block;';
            var b=document.createElement('button');
            b.innerHTML='&times;';
            b.title='Remove photo';
            b.style.cssText='position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:18px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
            b.onclick=function(ev){
              ev.stopPropagation();
              fetch('/api/event-photos/delete',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({photoId:p.id,eventId:eid})
              }).then(function(r){
                if(!r.ok) return r.json().then(function(j){ throw new Error(j.error||'Delete failed'); });
                return loadGrid(grid, si);
              }).catch(function(err){ alert(err.message||'Could not remove photo'); });
            };
            w.appendChild(im); w.appendChild(b); grid.appendChild(w);
          });
          hideEmptyPhotoCopy(grid, photos.length > 0);
        })
        .catch(function(err){
          console.error('[OneDay] event-photos/list', err);
          grid.innerHTML='';
        });
    }

    function isPhotoUploadControl(el){
      var fo=(el.getAttribute('for')||'');
      if(el.tagName==='LABEL'&&/^photo-input/i.test(fo)) return true;
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase();
      var c=(el.getAttribute('class')||'').toLowerCase();
      return (
        ((/add|upload|share/.test(t)) && (/(photo|pic|memory|moment)/.test(t))) ||
        t.indexOf('add photo')!==-1 ||
        t.indexOf('upload photo')!==-1 ||
        c.indexOf('btn-upload')!==-1 ||
        c.indexOf('upload-btn')!==-1
      );
    }
    function alreadyWired(el){
      var n=el.nextElementSibling;
      return n&&n.getAttribute&&n.getAttribute('data-oneday-engine')==='1';
    }
    var buttons=Array.from(document.querySelectorAll('button,label,a,[role="button"]')).filter(function(el){
      if(alreadyWired(el)) return false;
      return isPhotoUploadControl(el);
    });

    if(!buttons.length){
      Array.from(document.querySelectorAll(GSEL)).forEach(function(grid){
        var host = grid.closest('section') || grid.parentElement;
        if(!host) return;
        var existing = host.querySelector('button[class*="upload"],label[class*="upload"],button[class*="photo"],label[class*="photo"]');
        var ctl = existing;
        if(!ctl){
          ctl = document.createElement('button');
          ctl.type = 'button';
          ctl.className = 'upload-btn oneday-upload-fallback';
          ctl.textContent = 'Add Photos';
          grid.parentNode.insertBefore(ctl, grid.nextSibling);
        }
        if(!alreadyWired(ctl)) buttons.push(ctl);
      });
    }

    if (!buttons.length) return;

    var primaryBtn = buttons[0];
    buttons.slice(1).forEach(function(extraBtn){
      extraBtn.style.setProperty('display', 'none', 'important');
      extraBtn.setAttribute('aria-hidden', 'true');
    });

    [primaryBtn].forEach(function(btn){
      var si = 0;
      var fb=btn.cloneNode(true);
      btn.parentNode.replaceChild(fb,btn);
      fb.removeAttribute('onclick');
      if(fb.tagName==='LABEL') fb.removeAttribute('for');

      var inp=document.createElement('input');
      inp.type='file'; inp.accept='image/*'; inp.multiple=true;
      inp.setAttribute('data-oneday-engine','1');
      inp.style.cssText='position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';
      fb.parentNode.insertBefore(inp,fb.nextSibling);

      var secHide=fb.closest('section')||fb.parentElement;
      if(secHide){
        secHide.querySelectorAll('input[type=file]').forEach(function(oldInp){
          if(!oldInp.getAttribute('data-oneday-engine')){
            oldInp.style.setProperty('display','none','important');
            oldInp.setAttribute('aria-hidden','true');
          }
        });
      }

      fb.style.cursor='pointer';
      fb.textContent = 'Add Photos';
      fb.onclick=function(e){ e.preventDefault(); inp.click(); };

      var grid=findNextGrid(fb);
      if(!grid||grid.dataset.onedayManaged){
        grid=document.createElement('div');
        inp.parentNode.insertBefore(grid,inp.nextSibling);
      }
      grid.dataset.onedayManaged='1';
      grid.style.cssText=GCSS;

      loadGrid(grid, si);

      inp.addEventListener('change', function(){
        var files=Array.from(this.files||[]);
        if(!files.length) return;
        this.value='';
        files.forEach(function(file){
          var ct=file.type||'image/jpeg';
          if(ct.indexOf('image/')!==0) return;
          if(file.size>${MAX_PHOTO_BYTES}){ alert(file.name+' exceeds 5 MB — please resize it first.'); return; }
          fetch('/api/event-photos/presign',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({eventId:eid,sectionIndex:si,contentType:ct})
          })
          .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'presign failed'); return j; }); })
          .then(function(d){
            return fetch(d.uploadUrl,{method:'PUT',headers:{'Content-Type':ct},body:file}).then(function(putRes){
              if(!putRes.ok) throw new Error('Upload to storage failed');
              return d;
            });
          })
          .then(function(d){
            return fetch('/api/event-photos/register',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({eventId:eid,sectionIndex:si,key:d.key,byteSize:file.size,contentType:ct})
            }).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'register failed'); return j; }); });
          })
          .then(function(){ loadGrid(grid, si); })
          .catch(function(err){ alert(err.message||'Upload failed'); });
        });
      });
    });

  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(bootPhotoS3, 0);
    setTimeout(bootPhotoS3, 200);
    setTimeout(bootPhotoS3, 500);
    setTimeout(bootPhotoS3, 1200);
    var n=0;
    var iv=setInterval(function(){
      bootPhotoS3();
      n++;
      if(n>=30) clearInterval(iv);
    }, 200);
  });
  window.addEventListener('load', function(){ setTimeout(bootPhotoS3, 0); });

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      function wireOnclickBtn(btn) {
        if (btn.dataset.onedayWired) return;
        btn.dataset.onedayWired = '1';
        var oc = btn.getAttribute('onclick') || '';
        if (!oc) return;
        var m = oc.trim().match(/^([A-Za-z_$][A-Za-z0-9_$]*)\\s*\\(([^)]*)\\)/);
        if (!m) return;
        var fnName = m[1], rawArgs = m[2] || '';
        btn.removeAttribute('onclick');
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var fn = window[fnName];
          if (typeof fn !== 'function') return;
          var args = rawArgs.split(',').map(function(a) {
            a = a.trim();
            if (a === '') return undefined;
            if (!isNaN(a)) return Number(a);
            return a.replace(/^['"]|['"]$/g, '');
          }).filter(function(a) { return a !== undefined; });
          fn.apply(null, args);
        });
      }
      document.querySelectorAll('[onclick]').forEach(wireOnclickBtn);
      var msgContainers = document.querySelectorAll(
        '#msgList,#messageList,#msg-list,[class*="msg-list"],[class*="message-list"],[id*="messages"],[class*="message-wall"],[id*="message-wall"],[class*="guest-msg"],[id*="guest-msg"],section[class*="message"]'
      );
      msgContainers.forEach(function(container) {
        container.querySelectorAll('[onclick]').forEach(wireOnclickBtn);
        new MutationObserver(function(mutations) {
          mutations.forEach(function(mut) {
            mut.addedNodes.forEach(function(node) {
              if (node.nodeType !== 1) return;
              if (node.matches && node.matches('[onclick]')) wireOnclickBtn(node);
              node.querySelectorAll && node.querySelectorAll('[onclick]').forEach(wireOnclickBtn);
            });
          });
        }).observe(container, { childList: true, subtree: true });
      });
      var msgSubmitBtns = document.querySelectorAll(
        '.btn-post,.btn-send,.btn-submit-msg,[class*="btn-post"],[id*="postBtn"],[id*="sendBtn"],[id*="msgBtn"],[id*="submitMsg"],[id*="postMessage"],button[class*="post-message"]'
      );
      msgSubmitBtns.forEach(function(btn) {
        if (btn.dataset.onedayWired) return;
        var fn = window.submitMessage || window.sendMessage || window.addMessage ||
                  window.submitGuestMessage || window.postGuestMessage;
        if (typeof fn === 'function') {
          btn.dataset.onedayWired = '1';
          btn.addEventListener('click', function(e) { e.preventDefault(); fn(); });
        }
      });
    }, 0);
  });

})();
<\/script>`;

// ─────────────────────────────────────────────────────────────────────────────

export async function getServerSideProps({ params, res }) {
  const { id } = params;
  const supabase = getSupabase();

  const { data } = await supabase
    .from('event_apps')
    .select('html, title, is_live')
    .eq('id', id)
    .single();

  if (!data || !data.html) {
    return { notFound: true };
  }

  const watermark = `<div style="position:fixed;bottom:12px;right:12px;z-index:99999;background:rgba(10,10,20,0.88);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-family:sans-serif;backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.3);">Made with <a href="https://getoneday.com" target="_blank" rel="noopener noreferrer" style="color:#a855f7;text-decoration:none;font-weight:600;">OneDay</a></div>`;

  const useS3 = eventPhotosUseS3();
  const useCloudIx = eventInteractionsUseCloud();
  const eidScript = `<script>window.__ONEDAY_EID__=${JSON.stringify(id)};<\/script>`;
  // Cloud interactions run before photo engine so submitMessage / vote / handleRSVP are shared before onclick wiring.
  const injection =
    watermark +
    '\n' +
    eidScript +
    '\n' +
    (useCloudIx ? INTERACTIONS_CLOUD : '') +
    (useS3 ? PHOTO_ENGINE_S3 : PHOTO_ENGINE_LEGACY);

  let html = data.html;
  if (useCloudIx) {
    html = injectAfterBodyOpen(html, SHARED_CLOUD_LOCALSTORAGE_BLOCK);
  }
  const bodyIdx = html.lastIndexOf('</body>');
  html =
    bodyIdx !== -1
      ? html.slice(0, bodyIdx) + injection + '\n</body>' + html.slice(bodyIdx + 7)
      : html + injection;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);

  return { props: {} };
}

export default function EventPage() { return null; }
