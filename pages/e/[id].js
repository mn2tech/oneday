import { createClient } from '@supabase/supabase-js';
import { INTERACTIONS_CLOUD } from '../../lib/interactionsCloudHtml';
import { SHARED_CLOUD_LOCALSTORAGE_BLOCK } from '../../lib/messagesLocalStorageBlockHtml';
import { MAX_EVENT_PHOTOS, MAX_PHOTO_BYTES } from '../../lib/photoLimits';
import { buildThemePresetStyleTag, normalizeThemePreset } from '../../lib/eventThemePresets';
import { normalizePhase1Content } from '../../lib/eventStructuredPhase1';
import { isEventHost } from '../../lib/eventAdminAuth';

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
//  • photos_<eid>_<sectionIndex> per gallery (eid from __ONEDAY_EID__ or last URL segment, max 80 chars; sectionIndex 0–10)
// ─────────────────────────────────────────────────────────────────────────────
const PHOTO_ENGINE_LEGACY = `<script>
(function(){
  function bootPhotoLegacy(){
    var pathSegs = (window.location.pathname || '').split('/').filter(function(s){ return s && s.length; });
    var idFromPath = pathSegs.length ? pathSegs[pathSegs.length - 1] : '';
    var eid = (window.__ONEDAY_EID__ || idFromPath || 'event').slice(0,80);
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

    function ensurePhotoViewer(){
      if(window.__onedayPhotoViewer) return window.__onedayPhotoViewer;
      var state={items:[],idx:0,zoom:1,playing:false,timer:null,touchX:0,pinchStartDist:0,pinchStartZoom:1};
      var root=document.createElement('div');
      root.id='oneday-photo-viewer';
      root.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(8,10,16,.92);display:none;align-items:center;justify-content:center;padding:56px 16px 140px 16px;box-sizing:border-box;';
      root.innerHTML=
        '<button type="button" data-v-close style="position:absolute;top:14px;right:14px;border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:40px;height:40px;font-size:24px;cursor:pointer;">&times;</button>'+
        '<button type="button" data-v-prev style="position:absolute;left:14px;top:50%;transform:translateY(-50%);border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:44px;height:44px;font-size:24px;cursor:pointer;">&#8249;</button>'+
        '<button type="button" data-v-next style="position:absolute;right:14px;top:50%;transform:translateY(-50%);border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:44px;height:44px;font-size:24px;cursor:pointer;">&#8250;</button>'+
        '<img data-v-img alt="" style="max-width:min(96vw,1400px);max-height:calc(100vh - 230px);width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 16px 44px rgba(0,0,0,.55);transform-origin:center center;transition:transform .16s ease;">'+
        '<div data-v-thumbs style="position:absolute;left:50%;bottom:66px;transform:translateX(-50%);display:flex;gap:6px;max-width:min(96vw,1000px);overflow:auto;padding:6px 8px;background:rgba(8,10,16,.58);border-radius:12px;"></div>'+
        '<div data-v-bar style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(15,18,26,.72);padding:8px 10px;border-radius:999px;color:#fff;font:600 13px/1.2 system-ui,sans-serif;max-width:calc(100vw - 24px);">'+
        '<button type="button" data-v-zoom-out style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:34px;height:32px;cursor:pointer;">-</button>'+
        '<button type="button" data-v-zoom-in style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:34px;height:32px;cursor:pointer;">+</button>'+
        '<button type="button" data-v-zoom-reset style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">100%</button>'+
        '<button type="button" data-v-play style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">Play</button>'+
        '<button type="button" data-v-full style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">Full</button>'+
        '<span data-v-count style="padding:0 4px;white-space:nowrap;"></span>'+
        '<a data-v-download href="#" target="_blank" rel="noopener" style="text-decoration:none;color:#fff;border-radius:999px;background:rgba(255,255,255,.12);padding:8px 12px;line-height:16px;">Download</a>'+
        '</div>';
      document.body.appendChild(root);

      var img=root.querySelector('[data-v-img]');
      var thumbs=root.querySelector('[data-v-thumbs]');
      var btnClose=root.querySelector('[data-v-close]');
      var btnPrev=root.querySelector('[data-v-prev]');
      var btnNext=root.querySelector('[data-v-next]');
      var btnZoomIn=root.querySelector('[data-v-zoom-in]');
      var btnZoomOut=root.querySelector('[data-v-zoom-out]');
      var btnZoomReset=root.querySelector('[data-v-zoom-reset]');
      var btnPlay=root.querySelector('[data-v-play]');
      var btnFull=root.querySelector('[data-v-full]');
      var countEl=root.querySelector('[data-v-count]');
      var dl=root.querySelector('[data-v-download]');

      function applyZoom(){
        img.style.transform='scale('+state.zoom+')';
      }
      function syncPlayLabel(){
        btnPlay.textContent=state.playing?'Pause':'Play';
      }
      function stopSlide(){
        state.playing=false;
        if(state.timer){ clearInterval(state.timer); state.timer=null; }
        syncPlayLabel();
      }
      function startSlide(){
        if(state.playing||state.items.length<2) return;
        state.playing=true;
        state.timer=setInterval(function(){ shift(1); },2800);
        syncPlayLabel();
      }
      function renderThumbs(){
        thumbs.innerHTML='';
        state.items.forEach(function(it,ix){
          var t=document.createElement('button');
          t.type='button';
          t.style.cssText='border:2px solid transparent;padding:0;border-radius:8px;overflow:hidden;background:transparent;cursor:pointer;flex:0 0 auto;width:56px;height:56px;';
          t.innerHTML='<img alt="" src="'+it.url+'" style="width:100%;height:100%;object-fit:cover;display:block;">';
          t.onclick=function(){ state.idx=ix; refresh(); };
          thumbs.appendChild(t);
        });
      }
      function refresh(){
        if(!state.items.length) return;
        if(state.idx<0) state.idx=state.items.length-1;
        if(state.idx>=state.items.length) state.idx=0;
        var cur=state.items[state.idx]||{};
        img.src=cur.url||'';
        countEl.textContent=(state.idx+1)+' / '+state.items.length;
        dl.href=cur.url||'#';
        dl.setAttribute('download', cur.name||('photo-'+(state.idx+1)+'.jpg'));
        Array.prototype.forEach.call(thumbs.children,function(el,ix){
          el.style.borderColor=(ix===state.idx)?'#fff':'transparent';
        });
        applyZoom();
        preloadAround();
      }
      function preloadAround(){
        if(state.items.length<2) return;
        [-1,1].forEach(function(step){
          var i=(state.idx+step+state.items.length)%state.items.length;
          var next=state.items[i];
          if(!next||!next.url) return;
          var imgPre=new Image();
          imgPre.src=next.url;
        });
      }
      function close(){
        stopSlide();
        root.style.display='none';
        document.body.style.overflow='';
      }
      function open(items,start){
        state.items=Array.isArray(items)?items.filter(function(x){ return x&&x.url; }):[];
        if(!state.items.length) return;
        state.idx=Number.isInteger(start)?start:0;
        state.zoom=1;
        stopSlide();
        renderThumbs();
        refresh();
        root.style.display='flex';
        document.body.style.overflow='hidden';
      }
      function shift(n){
        state.idx+=n;
        refresh();
      }
      function changeZoom(delta){
        state.zoom=Math.max(0.5, Math.min(3, Math.round((state.zoom+delta)*100)/100));
        applyZoom();
      }
      function toggleFullscreen(){
        if(!document.fullscreenElement&&root.requestFullscreen){
          root.requestFullscreen().catch(function(){});
        }else if(document.fullscreenElement&&document.exitFullscreen){
          document.exitFullscreen().catch(function(){});
        }
      }

      btnClose.onclick=close;
      btnPrev.onclick=function(){ shift(-1); };
      btnNext.onclick=function(){ shift(1); };
      btnZoomIn.onclick=function(){ changeZoom(0.2); };
      btnZoomOut.onclick=function(){ changeZoom(-0.2); };
      btnZoomReset.onclick=function(){ state.zoom=1; applyZoom(); };
      btnPlay.onclick=function(){ if(state.playing) stopSlide(); else startSlide(); };
      btnFull.onclick=toggleFullscreen;
      root.addEventListener('click', function(ev){ if(ev.target===root) close(); });
      img.addEventListener('touchstart', function(ev){
        if(!ev.touches||!ev.touches.length) return;
        if(ev.touches.length===1){
          state.touchX=ev.touches[0].clientX||0;
          state.pinchStartDist=0;
        } else if(ev.touches.length===2){
          var dx=ev.touches[0].clientX-ev.touches[1].clientX;
          var dy=ev.touches[0].clientY-ev.touches[1].clientY;
          state.pinchStartDist=Math.sqrt(dx*dx+dy*dy)||0;
          state.pinchStartZoom=state.zoom;
        }
      }, {passive:true});
      img.addEventListener('touchmove', function(ev){
        if(!ev.touches||ev.touches.length!==2||state.pinchStartDist<=0) return;
        ev.preventDefault();
        var dx=ev.touches[0].clientX-ev.touches[1].clientX;
        var dy=ev.touches[0].clientY-ev.touches[1].clientY;
        var dist=Math.sqrt(dx*dx+dy*dy)||state.pinchStartDist;
        var ratio=dist/state.pinchStartDist;
        state.zoom=Math.max(0.5, Math.min(3, Math.round((state.pinchStartZoom*ratio)*100)/100));
        applyZoom();
      }, {passive:false});
      img.addEventListener('touchend', function(ev){
        if(state.pinchStartDist>0){
          state.pinchStartDist=0;
          return;
        }
        if(!ev.changedTouches||!ev.changedTouches.length) return;
        var dx=(ev.changedTouches[0].clientX||0)-state.touchX;
        if(Math.abs(dx)>=40) shift(dx>0?-1:1);
      }, {passive:true});
      img.addEventListener('dblclick', function(){
        state.zoom=state.zoom>1.1?1:2;
        applyZoom();
      });
      document.addEventListener('keydown', function(ev){
        if(root.style.display!=='flex') return;
        if(ev.key==='Escape') close();
        else if(ev.key==='ArrowLeft') shift(-1);
        else if(ev.key==='ArrowRight') shift(1);
        else if(ev.key===' ') { ev.preventDefault(); if(state.playing) stopSlide(); else startSlide(); }
        else if(ev.key==='f'||ev.key==='F') toggleFullscreen();
        else if(ev.key==='+'||ev.key==='=') changeZoom(0.2);
        else if(ev.key==='-') changeZoom(-0.2);
      });

      window.__onedayPhotoViewer={open:open,close:close};
      return window.__onedayPhotoViewer;
    }

    function quickDownload(url, name){
      if(!url) return;
      var a=document.createElement('a');
      a.href=url;
      a.setAttribute('download', name||'photo.jpg');
      a.style.display='none';
      document.body.appendChild(a);
      a.click();
      a.remove();
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

    // 4. Wire every photo section (must not hide extras: later boot() passes would wire section 2 with si=0 and duplicate section 0).
    if (!buttons.length) return;

    var MAX_SECTIONS = 11;
    buttons.slice(0, MAX_SECTIONS).forEach(function(btn, idx){
      var si = idx;
      var key='photos_'+eid+'_'+si;

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
        var viewer=ensurePhotoViewer();
        var viewerItems=saved.map(function(src,ix){
          return {url:src,name:'oneday-photo-'+(ix+1)+'.jpg'};
        });
        grid.innerHTML='';
        saved.forEach(function(src,i){
          var w=document.createElement('div');
          w.style.cssText='position:relative;aspect-ratio:1 / 1;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;box-sizing:border-box;cursor:zoom-in;';
          var im=document.createElement('img');
          im.src=src;
          im.style.cssText='width:100%;height:100%;object-fit:cover;object-position:center;border-radius:10px;display:block;';
          var d=document.createElement('button');
          d.textContent='⬇';
          d.title='Download';
          d.style.cssText='position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:12px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
          d.onclick=function(e){
            e.stopPropagation();
            quickDownload(src,'oneday-photo-'+(i+1)+'.jpg');
          };
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
          w.onclick=function(){ viewer.open(viewerItems, i); };
          w.appendChild(im); w.appendChild(d); w.appendChild(b); grid.appendChild(w);
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
    var pathSegs = (window.location.pathname || '').split('/').filter(function(s){ return s && s.length; });
    var idFromPath = pathSegs.length ? pathSegs[pathSegs.length - 1] : '';
    var eid = (window.__ONEDAY_EID__ || idFromPath || 'event').slice(0,80);
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

    function getDeviceId(){
      var k='onet_device_global_v1';
      var v=localStorage.getItem(k);
      if(!v||v.length<16){
        v='';
        if(window.crypto&&crypto.getRandomValues){
          var a=new Uint8Array(16);
          crypto.getRandomValues(a);
          for(var i=0;i<16;i++) v+=('0'+a[i].toString(16)).slice(-2);
        } else {
          v=('00000000000000000000000000000000'+Math.random().toString(16).replace(/[^a-f0-9]/g,'')).slice(-32);
        }
        v=String(v).toLowerCase().replace(/[^a-f0-9]/g,'');
        if(v.length<32){
          var pad=32-v.length;
          for(var j=0;j<pad;j++) v+='0';
        }
        v=v.slice(0,32);
        localStorage.setItem(k,v);
      }
      return v;
    }

    function getHostToken(){
      try{
        return sessionStorage.getItem('oneday_host_'+eid)||'';
      }catch(e){ return ''; }
    }

    function hostQs(){
      var t=getHostToken();
      return t ? '&hostToken='+encodeURIComponent(t) : '';
    }

    function ensurePhotoViewer(){
      if(window.__onedayPhotoViewer) return window.__onedayPhotoViewer;
      var state={items:[],idx:0,zoom:1,playing:false,timer:null,touchX:0,pinchStartDist:0,pinchStartZoom:1};
      var root=document.createElement('div');
      root.id='oneday-photo-viewer';
      root.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(8,10,16,.92);display:none;align-items:center;justify-content:center;padding:56px 16px 140px 16px;box-sizing:border-box;';
      root.innerHTML=
        '<button type="button" data-v-close style="position:absolute;top:14px;right:14px;border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:40px;height:40px;font-size:24px;cursor:pointer;">&times;</button>'+
        '<button type="button" data-v-prev style="position:absolute;left:14px;top:50%;transform:translateY(-50%);border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:44px;height:44px;font-size:24px;cursor:pointer;">&#8249;</button>'+
        '<button type="button" data-v-next style="position:absolute;right:14px;top:50%;transform:translateY(-50%);border:none;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;width:44px;height:44px;font-size:24px;cursor:pointer;">&#8250;</button>'+
        '<img data-v-img alt="" style="max-width:min(96vw,1400px);max-height:calc(100vh - 230px);width:auto;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 16px 44px rgba(0,0,0,.55);transform-origin:center center;transition:transform .16s ease;">'+
        '<div data-v-thumbs style="position:absolute;left:50%;bottom:66px;transform:translateX(-50%);display:flex;gap:6px;max-width:min(96vw,1000px);overflow:auto;padding:6px 8px;background:rgba(8,10,16,.58);border-radius:12px;"></div>'+
        '<div data-v-bar style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(15,18,26,.72);padding:8px 10px;border-radius:999px;color:#fff;font:600 13px/1.2 system-ui,sans-serif;max-width:calc(100vw - 24px);">'+
        '<button type="button" data-v-zoom-out style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:34px;height:32px;cursor:pointer;">-</button>'+
        '<button type="button" data-v-zoom-in style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:34px;height:32px;cursor:pointer;">+</button>'+
        '<button type="button" data-v-zoom-reset style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">100%</button>'+
        '<button type="button" data-v-play style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">Play</button>'+
        '<button type="button" data-v-full style="border:none;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-width:52px;height:32px;cursor:pointer;">Full</button>'+
        '<span data-v-count style="padding:0 4px;white-space:nowrap;"></span>'+
        '<a data-v-download href="#" target="_blank" rel="noopener" style="text-decoration:none;color:#fff;border-radius:999px;background:rgba(255,255,255,.12);padding:8px 12px;line-height:16px;">Download</a>'+
        '</div>';
      document.body.appendChild(root);

      var img=root.querySelector('[data-v-img]');
      var thumbs=root.querySelector('[data-v-thumbs]');
      var btnClose=root.querySelector('[data-v-close]');
      var btnPrev=root.querySelector('[data-v-prev]');
      var btnNext=root.querySelector('[data-v-next]');
      var btnZoomIn=root.querySelector('[data-v-zoom-in]');
      var btnZoomOut=root.querySelector('[data-v-zoom-out]');
      var btnZoomReset=root.querySelector('[data-v-zoom-reset]');
      var btnPlay=root.querySelector('[data-v-play]');
      var btnFull=root.querySelector('[data-v-full]');
      var countEl=root.querySelector('[data-v-count]');
      var dl=root.querySelector('[data-v-download]');

      function applyZoom(){
        img.style.transform='scale('+state.zoom+')';
      }
      function syncPlayLabel(){
        btnPlay.textContent=state.playing?'Pause':'Play';
      }
      function stopSlide(){
        state.playing=false;
        if(state.timer){ clearInterval(state.timer); state.timer=null; }
        syncPlayLabel();
      }
      function startSlide(){
        if(state.playing||state.items.length<2) return;
        state.playing=true;
        state.timer=setInterval(function(){ shift(1); },2800);
        syncPlayLabel();
      }
      function renderThumbs(){
        thumbs.innerHTML='';
        state.items.forEach(function(it,ix){
          var t=document.createElement('button');
          t.type='button';
          t.style.cssText='border:2px solid transparent;padding:0;border-radius:8px;overflow:hidden;background:transparent;cursor:pointer;flex:0 0 auto;width:56px;height:56px;';
          t.innerHTML='<img alt="" src="'+it.url+'" style="width:100%;height:100%;object-fit:cover;display:block;">';
          t.onclick=function(){ state.idx=ix; refresh(); };
          thumbs.appendChild(t);
        });
      }
      function refresh(){
        if(!state.items.length) return;
        if(state.idx<0) state.idx=state.items.length-1;
        if(state.idx>=state.items.length) state.idx=0;
        var cur=state.items[state.idx]||{};
        img.src=cur.url||'';
        countEl.textContent=(state.idx+1)+' / '+state.items.length;
        dl.href=cur.url||'#';
        dl.setAttribute('download', cur.name||('photo-'+(state.idx+1)+'.jpg'));
        Array.prototype.forEach.call(thumbs.children,function(el,ix){
          el.style.borderColor=(ix===state.idx)?'#fff':'transparent';
        });
        applyZoom();
        preloadAround();
      }
      function preloadAround(){
        if(state.items.length<2) return;
        [-1,1].forEach(function(step){
          var i=(state.idx+step+state.items.length)%state.items.length;
          var next=state.items[i];
          if(!next||!next.url) return;
          var imgPre=new Image();
          imgPre.src=next.url;
        });
      }
      function close(){
        stopSlide();
        root.style.display='none';
        document.body.style.overflow='';
      }
      function open(items,start){
        state.items=Array.isArray(items)?items.filter(function(x){ return x&&x.url; }):[];
        if(!state.items.length) return;
        state.idx=Number.isInteger(start)?start:0;
        state.zoom=1;
        stopSlide();
        renderThumbs();
        refresh();
        root.style.display='flex';
        document.body.style.overflow='hidden';
      }
      function shift(n){
        state.idx+=n;
        refresh();
      }
      function changeZoom(delta){
        state.zoom=Math.max(0.5, Math.min(3, Math.round((state.zoom+delta)*100)/100));
        applyZoom();
      }
      function toggleFullscreen(){
        if(!document.fullscreenElement&&root.requestFullscreen){
          root.requestFullscreen().catch(function(){});
        }else if(document.fullscreenElement&&document.exitFullscreen){
          document.exitFullscreen().catch(function(){});
        }
      }

      btnClose.onclick=close;
      btnPrev.onclick=function(){ shift(-1); };
      btnNext.onclick=function(){ shift(1); };
      btnZoomIn.onclick=function(){ changeZoom(0.2); };
      btnZoomOut.onclick=function(){ changeZoom(-0.2); };
      btnZoomReset.onclick=function(){ state.zoom=1; applyZoom(); };
      btnPlay.onclick=function(){ if(state.playing) stopSlide(); else startSlide(); };
      btnFull.onclick=toggleFullscreen;
      root.addEventListener('click', function(ev){ if(ev.target===root) close(); });
      img.addEventListener('touchstart', function(ev){
        if(!ev.touches||!ev.touches.length) return;
        if(ev.touches.length===1){
          state.touchX=ev.touches[0].clientX||0;
          state.pinchStartDist=0;
        } else if(ev.touches.length===2){
          var dx=ev.touches[0].clientX-ev.touches[1].clientX;
          var dy=ev.touches[0].clientY-ev.touches[1].clientY;
          state.pinchStartDist=Math.sqrt(dx*dx+dy*dy)||0;
          state.pinchStartZoom=state.zoom;
        }
      }, {passive:true});
      img.addEventListener('touchmove', function(ev){
        if(!ev.touches||ev.touches.length!==2||state.pinchStartDist<=0) return;
        ev.preventDefault();
        var dx=ev.touches[0].clientX-ev.touches[1].clientX;
        var dy=ev.touches[0].clientY-ev.touches[1].clientY;
        var dist=Math.sqrt(dx*dx+dy*dy)||state.pinchStartDist;
        var ratio=dist/state.pinchStartDist;
        state.zoom=Math.max(0.5, Math.min(3, Math.round((state.pinchStartZoom*ratio)*100)/100));
        applyZoom();
      }, {passive:false});
      img.addEventListener('touchend', function(ev){
        if(state.pinchStartDist>0){
          state.pinchStartDist=0;
          return;
        }
        if(!ev.changedTouches||!ev.changedTouches.length) return;
        var dx=(ev.changedTouches[0].clientX||0)-state.touchX;
        if(Math.abs(dx)>=40) shift(dx>0?-1:1);
      }, {passive:true});
      img.addEventListener('dblclick', function(){
        state.zoom=state.zoom>1.1?1:2;
        applyZoom();
      });
      document.addEventListener('keydown', function(ev){
        if(root.style.display!=='flex') return;
        if(ev.key==='Escape') close();
        else if(ev.key==='ArrowLeft') shift(-1);
        else if(ev.key==='ArrowRight') shift(1);
        else if(ev.key===' ') { ev.preventDefault(); if(state.playing) stopSlide(); else startSlide(); }
        else if(ev.key==='f'||ev.key==='F') toggleFullscreen();
        else if(ev.key==='+'||ev.key==='=') changeZoom(0.2);
        else if(ev.key==='-') changeZoom(-0.2);
      });

      window.__onedayPhotoViewer={open:open,close:close};
      return window.__onedayPhotoViewer;
    }

    function quickDownload(url, name){
      if(!url) return;
      var a=document.createElement('a');
      a.href=url;
      a.setAttribute('download', name||'photo.jpg');
      a.style.display='none';
      document.body.appendChild(a);
      a.click();
      a.remove();
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
      fetch('/api/event-photos/list?eventId='+encodeURIComponent(eid)+'&sectionIndex='+si+'&deviceId='+encodeURIComponent(getDeviceId())+hostQs())
        .then(function(r){
          return r.json().then(function(d){
            if(!r.ok) throw new Error((d && d.error) || 'Could not load photos');
            return d;
          });
        })
        .then(function(d){
          var photos = (d && d.photos) ? d.photos : [];
          var viewer=ensurePhotoViewer();
          var viewerItems=photos.map(function(p,ix){
            return {url:p.url,name:'oneday-photo-'+(ix+1)+'.jpg'};
          });
          grid.innerHTML='';
          photos.forEach(function(p,i){
            var w=document.createElement('div');
            w.style.cssText='position:relative;aspect-ratio:1 / 1;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;box-sizing:border-box;cursor:zoom-in;';
            var im=document.createElement('img');
            im.src=p.url;
            im.alt='';
            im.style.cssText='width:100%;height:100%;object-fit:cover;object-position:center;border-radius:10px;display:block;';
            var d=document.createElement('button');
            d.textContent='⬇';
            d.title='Download';
            d.style.cssText='position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:12px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
            d.onclick=function(ev){
              ev.stopPropagation();
              quickDownload(p.url,'oneday-photo-'+(i+1)+'.jpg');
            };
            var b=document.createElement('button');
            b.innerHTML='&times;';
            b.title='Remove photo';
            b.style.cssText='position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:18px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;';
            if(!p.owned_by_me){
              b.style.display='none';
            }
            b.onclick=function(ev){
              ev.stopPropagation();
              var delBody={photoId:p.id,eventId:eid,deviceId:getDeviceId()};
              var ht=getHostToken();
              if(ht) delBody.adminToken=ht;
              fetch('/api/event-photos/delete',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(delBody)
              }).then(function(r){
                if(!r.ok) return r.json().then(function(j){ throw new Error(j.error||'Delete failed'); });
                return loadGrid(grid, si);
              }).catch(function(err){ alert(err.message||'Could not remove photo'); });
            };
            w.onclick=function(){ viewer.open(viewerItems, i); };
            w.appendChild(im); w.appendChild(d); w.appendChild(b); grid.appendChild(w);
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

    var MAX_SECTIONS = 11;
    buttons.slice(0, MAX_SECTIONS).forEach(function(btn, idx){
      var si = idx;
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
              body:JSON.stringify({eventId:eid,sectionIndex:si,key:d.key,byteSize:file.size,contentType:ct,deviceId:getDeviceId()})
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

export async function getServerSideProps({ params, res, query }) {
  const { id } = params;
  const supabase = getSupabase();
  let queryThemePreset = 'default';

  let { data } = await supabase
    .from('event_apps')
    .select('html, title, is_live, theme_preset, content_phase1, content_phase1_draft')
    .eq('id', id)
    .single();
  if (!data) {
    // Backward compatibility for databases that do not have theme_preset yet.
    const fallback = await supabase
      .from('event_apps')
      .select('html, title, is_live, content_phase1')
      .eq('id', id)
      .single();
    data = fallback.data || null;
  }

  if (!data || !data.html) {
    return { notFound: true };
  }
  queryThemePreset = normalizeThemePreset(query?.themePreview || 'default');
  const savedThemePreset = normalizeThemePreset(data.theme_preset || 'default');
  const activeThemePreset = queryThemePreset !== 'default' ? queryThemePreset : savedThemePreset;
  const themeStyleTag = buildThemePresetStyleTag(activeThemePreset);
  const wantsDraftPreview = String(query?.phase1Preview || '').toLowerCase() === 'draft';
  const rawAdminToken = typeof query?.admin === 'string' ? query.admin.trim() : '';
  let allowDraftPreview = false;
  if (wantsDraftPreview && rawAdminToken) {
    allowDraftPreview = await isEventHost(supabase, id, { deviceId: '', adminToken: rawAdminToken });
  }
  const phase1Source = allowDraftPreview && data.content_phase1_draft ? data.content_phase1_draft : data.content_phase1;
  const phase1Content = normalizePhase1Content(phase1Source || {}, data.title || '');
  const phase1Payload = JSON.stringify(phase1Content).replace(/</g, '\\u003c');

  const watermark = `<div style="position:fixed;bottom:12px;right:12px;z-index:99999;background:rgba(10,10,20,0.88);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-family:sans-serif;backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.3);">Made with <a href="https://getoneday.com" target="_blank" rel="noopener noreferrer" style="color:#a855f7;text-decoration:none;font-weight:600;">OneDay</a></div>`;

  const useS3 = eventPhotosUseS3();
  const useCloudIx = eventInteractionsUseCloud();
  const eidScript = `<script>
(function(){
  window.__ONEDAY_EID__=${JSON.stringify(id)};
  try{
    var u=new URL(window.location.href);
    var tok=u.searchParams.get('admin');
    if(tok&&tok.length>=32){
      var eid=(window.__ONEDAY_EID__||'').slice(0,80);
      sessionStorage.setItem('oneday_host_'+eid, tok);
      u.searchParams.delete('admin');
      window.history.replaceState({},'', u.pathname+u.search+u.hash);
    }
  }catch(e){}
})();
<\/script>`;
  const phase1ApplyScript = `<script>
(function(){
  var phase1=${phase1Payload};
  function qsa(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function singleTextNodes(){
    return qsa('h1,h2,h3,h4,p,div,span,li,strong,small').filter(function(el){
      if(!el || el.children.length) return false;
      var tx=(el.textContent||'').trim();
      return tx && tx.length<=220;
    });
  }
  function setByMatchers(matchers, text){
    if(!text) return false;
    var nodes=singleTextNodes();
    for(var i=0;i<nodes.length;i++){
      var tx=(nodes[i].textContent||'').trim();
      for(var j=0;j<matchers.length;j++){
        if(matchers[j].test(tx)){
          nodes[i].textContent=text;
          return true;
        }
      }
    }
    return false;
  }
  function findByMatchers(matchers){
    var nodes=singleTextNodes();
    for(var i=0;i<nodes.length;i++){
      var tx=(nodes[i].textContent||'').trim();
      for(var j=0;j<matchers.length;j++){
        if(matchers[j].test(tx)) return nodes[i];
      }
    }
    return null;
  }
  function upsertSchedule(items){
    if(!Array.isArray(items)||!items.length) return;
    var heading=qsa('h2,h3,h4,strong,p,div').find(function(el){
      var t=(el.textContent||'').trim().toLowerCase();
      return t==='schedule'||t==='itinerary'||t==='program'||t==='event schedule';
    });
    var list=null;
    if(heading){
      var parent=heading.parentElement||document.body;
      list=parent.querySelector('ul,ol,[data-oneday-schedule],.oneday-schedule-list,[class*="schedule-list"],[id*="schedule-list"]');
      if(!list && heading.nextElementSibling && /^(UL|OL|DIV)$/i.test(heading.nextElementSibling.tagName||'')){
        list=heading.nextElementSibling;
      }
      if(!list){
        list=document.createElement('ul');
        list.setAttribute('data-oneday-schedule','1');
        list.style.cssText='margin-top:10px;padding-left:20px;';
        heading.insertAdjacentElement('afterend', list);
      }
    } else {
      var mount=document.querySelector('main')||document.body;
      var section=document.createElement('section');
      section.style.cssText='margin-top:24px;';
      var h=document.createElement('h3');
      h.textContent='Schedule';
      list=document.createElement('ul');
      list.setAttribute('data-oneday-schedule','1');
      list.style.cssText='margin-top:10px;padding-left:20px;';
      section.appendChild(h);
      section.appendChild(list);
      mount.appendChild(section);
    }
    if(!list) return;
    list.innerHTML='';
    items.forEach(function(it){
      var li=document.createElement('li');
      li.style.margin='6px 0';
      var line=(it.time?it.time+' - ':'')+(it.title||'');
      if(it.description) line+=': '+it.description;
      li.textContent=line;
      list.appendChild(li);
    });
  }
  function isPhotoControl(el){
    if(!el) return false;
    var t=(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    return ((/add|upload|share/.test(t)) && (/(photo|pic|memory|moment)/.test(t))) ||
      t.indexOf('add photos')!==-1 || t.indexOf('upload photos')!==-1;
  }
  function stripIds(root){
    if(!root) return;
    if(root.id) root.removeAttribute('id');
    Array.prototype.slice.call(root.querySelectorAll('[id]')).forEach(function(el){
      el.removeAttribute('id');
    });
  }
  function clearSectionMedia(root){
    if(!root) return;
    Array.prototype.slice.call(root.querySelectorAll('img,video,figure picture source')).forEach(function(el){
      if(el && el.parentNode) el.parentNode.removeChild(el);
    });
    var gridSel='[class*="photo-grid"],[id*="photo-grid"],[class*="photoGrid"],[id*="photoGrid"],[class*="photo-list"],[id*="photo-list"]';
    Array.prototype.slice.call(root.querySelectorAll(gridSel)).forEach(function(grid){
      grid.innerHTML='';
      grid.removeAttribute('data-oneday-managed');
    });
    Array.prototype.slice.call(root.querySelectorAll('input[type="file"]')).forEach(function(inp){
      inp.value='';
      inp.removeAttribute('data-oneday-engine');
      inp.style.cssText='position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';
    });
  }
  function findScopedHeading(root){
    if(!root) return null;
    var local=root.querySelector('h2,h3,h4,strong,[class*="section-title"],[class*="title"]');
    if(local && (local.textContent||'').trim().length<=140) return local;
    return null;
  }
  function isMainPhotoHeadingText(text){
    var t=(text||'').trim().toLowerCase();
    return /photo wall|photo gallery|gallery|memories|moments/.test(t);
  }
  function findPhotoWallContainer(){
    var heading=qsa('h1,h2,h3,h4,strong,p,div').find(function(el){
      var t=(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      return t==='photo wall' || t==='photo gallery' || t==='gallery';
    });
    if(heading){
      return {
        container: heading.closest('section')||heading.closest('main')||heading.parentElement||document.body,
        headingTop: (heading.getBoundingClientRect&&heading.getBoundingClientRect().top)||null,
      };
    }
    var firstControl=qsa('button,label,a,[role="button"]').find(isPhotoControl);
    if(firstControl){
      var sec=firstControl.closest('section')||firstControl.parentElement||document.body;
      return { container: sec, headingTop: null };
    }
    return { container: document.body, headingTop: null };
  }
  function countPhotoControls(root){
    if(!root||!root.querySelectorAll) return 0;
    return Array.prototype.slice.call(root.querySelectorAll('button,label,a,[role="button"]'))
      .filter(isPhotoControl).length;
  }
  function findSubsectionTemplateBlock(control){
    if(!control) return null;
    var node=control.parentElement;
    var best=node;
    while(node && node!==document.body){
      if(node.tagName==='SECTION') break;
      var ownControls=countPhotoControls(node);
      var hasHeading=!!findPhotoSubHeading(node, control);
      if(hasHeading && ownControls===1){
        best=node;
      }
      var parent=node.parentElement;
      if(!parent) break;
      if(parent.tagName==='SECTION'){
        if(hasHeading && ownControls===1) best=node;
        break;
      }
      var parentControls=countPhotoControls(parent);
      if(parentControls>1){
        if(hasHeading && ownControls===1) best=node;
        break;
      }
      node=parent;
    }
    return best||control.parentElement;
  }
  function findPhotoSubHeading(section, control, minTop){
    if(!section) return null;
    var headingSelectors='h2,h3,h4,strong,[class*="section-title"],[class*="title"]';
    var all=Array.prototype.slice.call(section.querySelectorAll(headingSelectors))
      .filter(function(el){
        var tx=(el.textContent||'').trim();
        if(!(tx && tx.length<=140 && !isMainPhotoHeadingText(tx))) return false;
        if(minTop==null) return true;
        var top=(el.getBoundingClientRect&&el.getBoundingClientRect().top)||0;
        return top >= (minTop - 2);
      });
    if(!all.length) return null;
    if(!control) return all[0];
    // Prefer the nearest heading above the specific photo control.
    var controlTop=(control.getBoundingClientRect&&control.getBoundingClientRect().top)||0;
    var best=null;
    var bestDist=Infinity;
    all.forEach(function(h){
      var top=(h.getBoundingClientRect&&h.getBoundingClientRect().top)||0;
      var dist=controlTop-top;
      if(dist>=-6 && dist<bestDist){ best=h; bestDist=dist; }
    });
    return best||all[0];
  }
  function removeLegacySubsectionLabels(root, keepTitle){
    if(!root) return;
    var keep=(keepTitle||'').trim().toLowerCase();
    function normalizeLabel(text){
      return String(text||'')
        .toLowerCase()
        .replace(/[^a-z0-9&\s]/g,' ')
        .replace(/\s+/g,' ')
        .trim();
    }
    var badRe=/(^|\s)(celebration moments|moments|fun & festivity|fun and festivity)(\s|$)/i;
    // Pass 1: scrub matching legacy phrases at text-node level (handles icon + nested wrappers).
    var walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var textNodes=[];
    while(walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function(node){
      var raw=node&&node.nodeValue?node.nodeValue:'';
      var tx=raw.replace(/\s+/g,' ').trim();
      if(!tx) return;
      var low=normalizeLabel(tx);
      if(low===keep) return;
      if(isMainPhotoHeadingText(tx)) return;
      if(!badRe.test(low)) return;
      node.nodeValue='';
    });

    // Pass 2: remove now-empty wrappers that are not interactive/media containers.
    var targets=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,strong,p,div,span,small,em,i,b'));
    targets.forEach(function(el){
      if(!el) return;
      if(el.querySelector && el.querySelector('button,label,a,[role="button"],input,textarea,select,img,video,svg,canvas')) return;
      var tx=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(tx) return;
      if(el.childElementCount>0) return;
      if(el.parentNode) el.parentNode.removeChild(el);
    });
  }
  function removeLegacyLabelsFromWallRoot(root, allowedTitles){
    if(!root) return;
    function normalizeLabel(text){
      return String(text||'')
        .toLowerCase()
        .replace(/[^a-z0-9&\s]/g,' ')
        .replace(/\s+/g,' ')
        .trim();
    }
    var badRe=/(^|\s)(celebration moments|moments|fun & festivity|fun and festivity)(\s|$)/i;
    var allowed=new Set((allowedTitles||[]).map(normalizeLabel).filter(Boolean));
    var nodes=Array.prototype.slice.call(root.querySelectorAll('h1,h2,h3,h4,strong,p,div,span,small,em,i,b'));
    nodes.forEach(function(el){
      if(!el) return;
      if(el.querySelector && el.querySelector('button,label,a,[role="button"],input,textarea,select,img,video,svg,canvas')) return;
      var tx=(el.textContent||'').replace(/\s+/g,' ').trim();
      if(!tx) return;
      if(isMainPhotoHeadingText(tx)) return;
      var norm=normalizeLabel(tx);
      if(allowed.has(norm)) return;
      if(!badRe.test(norm)) return;
      if(el.parentNode) el.parentNode.removeChild(el);
    });
  }
  function upsertPhotoWall(photoWall){
    if(!photoWall||typeof photoWall!=='object') return;
    var wallMeta=findPhotoWallContainer();
    var wallRoot=wallMeta.container||document.body;
    var wallTop=wallMeta.headingTop;
    var controls=Array.prototype.slice.call(wallRoot.querySelectorAll('button,label,a,[role="button"]')).filter(isPhotoControl);
    var subs=Array.isArray(photoWall.subsections)?photoWall.subsections:[];
    controls.forEach(function(ctrl, idx){
      if(!subs[idx]||!subs[idx].title) return;
      var section=ctrl.closest('section')||ctrl.parentElement;
      if(!section) return;
      var h=findPhotoSubHeading(section, ctrl, wallTop);
      if(h) h.textContent=subs[idx].title;
      else {
        var nh=document.createElement('h3');
        nh.textContent=subs[idx].title;
        nh.style.margin='0 0 10px 0';
        section.insertBefore(nh, section.firstChild);
      }
      removeLegacySubsectionLabels(section, subs[idx].title);
    });

    if(subs.length>controls.length && controls.length){
      var templateControl=controls[controls.length-1];
      var templateBlock=findSubsectionTemplateBlock(templateControl);
      if(!templateBlock || !templateBlock.parentNode) return;
      var hostSection=wallRoot;
      if(!hostSection) return;
      Array.prototype.slice.call(hostSection.querySelectorAll('[data-oneday-generated-subsection="1"]')).forEach(function(el){
        if(el&&el.parentNode) el.parentNode.removeChild(el);
      });
      var anchorBlock=templateBlock;
      for(var i=controls.length;i<subs.length;i++){
        var item=subs[i];
        if(!item||!item.title) continue;
        var clone=templateBlock.cloneNode(true);
        clone.setAttribute('data-oneday-generated-subsection','1');
        stripIds(clone);
        clearSectionMedia(clone);
        var cloneControl=clone.querySelector('button,label,a,[role="button"]');
        var heading=findPhotoSubHeading(clone, cloneControl);
        if(heading) heading.textContent=item.title;
        else {
          var nh=document.createElement('h3');
          nh.textContent=item.title;
          nh.style.margin='0 0 10px 0';
          clone.insertBefore(nh, clone.firstChild);
        }
        removeLegacySubsectionLabels(clone, item.title);
        var cloneControls=Array.prototype.slice.call(clone.querySelectorAll('button,label,a,[role="button"]')).filter(isPhotoControl);
        cloneControls.forEach(function(btn){
          if(btn.tagName==='LABEL') btn.removeAttribute('for');
          btn.textContent='Add Photos';
          btn.removeAttribute('onclick');
        });
        anchorBlock.parentNode.insertBefore(clone, anchorBlock.nextSibling);
        anchorBlock=clone;
      }
    }
    removeLegacyLabelsFromWallRoot(
      wallRoot,
      subs.map(function(s){ return s && s.title ? s.title : ''; })
    );
  }
  function applyPhase1(){
    if(!phase1||typeof phase1!=='object') return;
    var d=phase1.eventDetails||{};
    if(d.title){
      var h1=document.querySelector('#hero h1,.hero h1,[class*="hero"] h1,h1');
      if(h1) h1.textContent=d.title;
      var titleLike=document.querySelector('[id*="title"],[class*="title"]');
      if(titleLike && (!h1 || titleLike!==h1) && (titleLike.textContent||'').trim().length<140) titleLike.textContent=d.title;
      if(document.title) document.title=d.title + ' — OneDay';
    }
    if(d.dateTime){
      setByMatchers([/📅/,/calendar/i,/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i], '📅 '+d.dateTime);
    }
    if(d.location){
      setByMatchers([/📍/,/\blocation\b/i,/\bvenue\b/i], '📍 '+d.location);
    }
    if(d.host){
      setByMatchers([/hosted by/i,/^host[:\\s]/i], 'Hosted by '+d.host);
    }
    if(d.dressCode){
      setByMatchers([/dress\\s*code/i], 'Dress Code: '+d.dressCode);
    }
    upsertSchedule(phase1.schedule||[]);
    upsertPhotoWall(phase1.photoWall||{});
    enableGuiEdit();
  }
  function enableGuiEdit(){
    var isGui=false;
    try{
      var u=new URL(window.location.href);
      isGui=u.searchParams.get('guiEdit')==='1';
    }catch(e){}
    if(!isGui) return;
    var titleEl=document.querySelector('#hero h1,.hero h1,[class*="hero"] h1,h1');
    var dateEl=findByMatchers([/📅/,/calendar/i,/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i]);
    var locationEl=findByMatchers([/📍/,/\blocation\b/i,/\bvenue\b/i]);
    var hostEl=findByMatchers([/hosted by/i,/^host[:\s]/i]);
    var dressEl=findByMatchers([/dress\s*code/i]);
    var targets=[
      {key:'title', el:titleEl, toValue:function(v){ return String(v||'').trim(); }},
      {key:'dateTime', el:dateEl, toValue:function(v){ return String(v||'').replace(/^.*?(?=\d|\bjan|\bfeb|\bmar|\bapr|\bmay|\bjun|\bjul|\baug|\bsep|\boct|\bnov|\bdec)/i,'').trim()||String(v||'').replace(/^📅\s*/,'').trim(); }},
      {key:'location', el:locationEl, toValue:function(v){ return String(v||'').replace(/^📍\s*/,'').replace(/^(location|venue)\s*[:\-]?\s*/i,'').trim(); }},
      {key:'host', el:hostEl, toValue:function(v){ return String(v||'').replace(/^hosted by\s*/i,'').replace(/^host\s*[:\-]?\s*/i,'').trim(); }},
      {key:'dressCode', el:dressEl, toValue:function(v){ return String(v||'').replace(/^dress\s*code\s*[:\-]?\s*/i,'').trim(); }},
    ];
    function postUpdate(){
      var payload={};
      targets.forEach(function(t){
        if(!t.el) return;
        payload[t.key]=t.toValue(t.el.textContent||'');
      });
      try{
        window.parent.postMessage({ type:'oneday_gui_update', payload:payload }, '*');
      }catch(e){}
    }
    targets.forEach(function(t){
      if(!t.el || t.el.dataset.onedayGui) return;
      t.el.dataset.onedayGui='1';
      t.el.setAttribute('contenteditable','true');
      t.el.setAttribute('tabindex','0');
      t.el.setAttribute('spellcheck','false');
      t.el.style.outline='1px dashed rgba(124,92,252,0.65)';
      t.el.style.outlineOffset='2px';
      t.el.style.cursor='text';
      t.el.style.userSelect='text';
      t.el.style.webkitUserSelect='text';
      t.el.style.pointerEvents='auto';
      t.el.style.webkitUserModify='read-write-plaintext-only';
      t.el.title='Editable in preview';
      t.el.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
      t.el.addEventListener('click', function(ev){
        ev.stopPropagation();
        ev.preventDefault();
        t.el.focus();
      });
      t.el.addEventListener('blur', postUpdate);
      t.el.addEventListener('keydown', function(ev){
        ev.stopPropagation();
        if(ev.key==='Enter'){ ev.preventDefault(); t.el.blur(); }
      });
      t.el.addEventListener('input', function(ev){ ev.stopPropagation(); });
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', applyPhase1);
  } else {
    applyPhase1();
  }
})();
<\/script>`;
  const hostEditLauncher = `<script>
(function(){
  function hasHostToken(){
    try{
      var eid=(window.__ONEDAY_EID__||'').slice(0,80);
      return !!sessionStorage.getItem('oneday_host_'+eid);
    }catch(e){ return false; }
  }
  function mount(){
    if(!hasHostToken()) return;
    if(document.getElementById('oneday-host-edit-link')) return;
    var tok='';
    try{
      var eid=(window.__ONEDAY_EID__||'').slice(0,80);
      tok=sessionStorage.getItem('oneday_host_'+eid)||'';
    }catch(e){}
    var a=document.createElement('a');
    a.id='oneday-host-edit-link';
    a.href='/edit/'+encodeURIComponent((window.__ONEDAY_EID__||'').slice(0,80))+(tok?'?admin='+encodeURIComponent(tok):'');
    a.textContent='Edit Theme & Content';
    a.style.cssText='position:fixed;right:12px;bottom:52px;z-index:99999;padding:8px 12px;border-radius:999px;background:rgba(124,92,252,0.95);color:#fff;font:600 12px/1.2 Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.25);';
    document.body.appendChild(a);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',mount);
  } else {
    mount();
  }
})();
<\/script>`;
  // Cloud interactions run before photo engine so submitMessage / vote / handleRSVP are shared before onclick wiring.
  const injection =
    watermark +
    '\n' +
    themeStyleTag +
    '\n' +
    eidScript +
    '\n' +
    phase1ApplyScript +
    '\n' +
    hostEditLauncher +
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
