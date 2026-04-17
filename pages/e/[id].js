import { createClient } from '@supabase/supabase-js';

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
//  • photos_<eid>_<idx> key is stable (button order = section order)
// ─────────────────────────────────────────────────────────────────────────────
const PHOTO_ENGINE = `<script>
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var eid = (window.location.pathname.split('/').pop() || 'event').slice(0,30);
    var GCSS = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-top:14px;';
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

    // 3. Find all "Add Photos" upload buttons
    var buttons=Array.from(
      document.querySelectorAll('button,label,a,[role="button"]')
    ).filter(function(el){
      var t=(el.textContent||'').replace(/\\s+/g,' ').trim();
      var c=(el.getAttribute('class')||'').toLowerCase();
      return t.indexOf('Add Photo')!==-1 ||
             t.indexOf('Upload Photo')!==-1 ||
             c.indexOf('btn-upload')!==-1 ||
             c.indexOf('upload-btn')!==-1;
    });

    // 4. Wire each button
    buttons.forEach(function(btn, si){
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
          w.style.cssText='position:relative;';
          var im=document.createElement('img');
          im.src=src;
          im.style.cssText='width:100%;height:180px;object-fit:cover;border-radius:8px;display:block;';
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
        if(arr.length+files.length>20){
          alert('Max 20 photos per section.'); this.value=''; return;
        }
        var pending=files.length;
        files.forEach(function(file){
          if(file.size>3145728){
            alert(file.name+' exceeds 3 MB — please resize it first.');
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

  });

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

  const injection = watermark + '\n' + PHOTO_ENGINE;
  const bodyIdx = data.html.lastIndexOf('</body>');
  const html = bodyIdx !== -1
    ? data.html.slice(0, bodyIdx) + injection + '\n</body>' + data.html.slice(bodyIdx + 7)
    : data.html + injection;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);

  return { props: {} };
}

export default function EventPage() { return null; }
