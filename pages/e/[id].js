import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Injected on every event page at serve time.
// Guarantees uniform photo upload/display regardless of what Claude generated.
const PHOTO_FIX_SCRIPT = `<script>
(function(){
document.addEventListener('DOMContentLoaded', function(){
  var eid = (window.location.pathname.split('/').pop() || 'event').slice(0, 30);
  var inputCounter = 0;

  // ── 1. Kill Claude's native photo renderers so only ours runs ─────────────
  ['buildPhotoGrid','renderPhotoGrid','refreshPhotos','displayPhotos',
   'handlePhotoUpload','onPhotoUpload','photoUploadHandler'].forEach(function(fn){
    if (typeof window[fn] === 'function') window[fn] = function(){};
  });

  // ── 2. Force uniform CSS on any existing photo grid containers ────────────
  var GRID_SEL = '[id*="grid"],[class*="grid"],[class*="photo-list"],[class*="photos"]';
  var GRID_CSS = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:12px;';
  document.querySelectorAll('[class*="photo-grid"],[id*="photo-grid"],[class*="photoGrid"],[id*="photoGrid"]').forEach(function(g){
    g.style.cssText = GRID_CSS;
  });

  // ── helpers ───────────────────────────────────────────────────────────────
  function makeGrid(anchor) {
    var g = document.createElement('div');
    g.style.cssText = GRID_CSS;
    anchor.parentNode.insertBefore(g, anchor.nextSibling);
    return g;
  }

  // Find the grid closest to this input — scoped to its nearest container,
  // not the whole outer section (which would always return section 1's grid).
  function findGrid(inp) {
    var node = inp.parentElement;
    while (node && node.tagName !== 'SECTION' && node.tagName !== 'BODY') {
      var g = node.querySelector(GRID_SEL);
      if (g) { g.style.cssText = GRID_CSS; return g; }
      node = node.parentElement;
    }
    // last resort: query inside nearest section
    var sec = inp.closest('section');
    if (sec) {
      var g2 = sec.querySelector(GRID_SEL);
      if (g2) { g2.style.cssText = GRID_CSS; return g2; }
    }
    return null;
  }

  function attachInput(inp, gridOverride) {
    // Fix display:none — blocks change events in Firefox/Safari
    if (inp.style.display === 'none' || window.getComputedStyle(inp).display === 'none') {
      inp.style.cssText = 'position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';
    }

    var idx  = inputCounter++;
    var key  = 'photos_' + eid + '_' + idx;
    var grid = gridOverride || findGrid(inp) || makeGrid(inp);

    function render() {
      var saved = []; try { saved = JSON.parse(localStorage.getItem(key)||'[]'); } catch(e){}
      grid.innerHTML = '';
      grid.style.cssText = GRID_CSS; // re-apply in case anything overwrote it
      saved.forEach(function(src, i){
        var w  = document.createElement('div');  w.style.position = 'relative';
        var im = document.createElement('img');  im.src = src;
        im.style.cssText = 'width:100%;height:180px;object-fit:cover;border-radius:8px;display:block;';
        var b  = document.createElement('button'); b.textContent = '\\xD7';
        b.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:16px;cursor:pointer;line-height:1;';
        b.setAttribute('data-idx', i); b.setAttribute('data-key', key);
        b.onclick = function(){
          var k=this.getAttribute('data-key'), n=+this.getAttribute('data-idx');
          var a=[]; try{a=JSON.parse(localStorage.getItem(k)||'[]');}catch(e){}
          a.splice(n,1); localStorage.setItem(k,JSON.stringify(a)); render();
        };
        w.appendChild(im); w.appendChild(b); grid.appendChild(w);
      });
    }

    render();

    inp.addEventListener('change', function(){
      var files = Array.from(this.files);
      var arr=[]; try{arr=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}
      if (arr.length + files.length > 20){ alert('Max 20 photos per section.'); this.value=''; return; }
      var pending = files.length;
      files.forEach(function(file){
        if (file.size > 3145728){ alert(file.name+' is over 3MB.'); pending--; if(pending<=0)render(); return; }
        var r = new FileReader();
        r.onload = function(e){ arr.push(e.target.result); localStorage.setItem(key,JSON.stringify(arr)); pending--; if(pending<=0)render(); };
        r.readAsDataURL(file);
      });
      this.value = '';
    });
  }

  // ── 3. Attach to all existing file inputs ─────────────────────────────────
  document.querySelectorAll('input[type="file"]').forEach(function(inp){
    attachInput(inp);
  });

  // ── 4. Fix upload buttons — create missing inputs, replace onclick ─────────
  document.querySelectorAll('[onclick]').forEach(function(el){
    var oc = el.getAttribute('onclick') || '';
    if (oc.indexOf('.click()') === -1) return;

    el.removeAttribute('onclick');
    var m   = oc.match(/getElementById\\(['"]([^'"]+)['"]/);
    var tid = m ? m[1] : null;
    var inp = tid ? document.getElementById(tid) : null;

    if (!inp) {
      // Find the grid scoped to THIS button's local container (not the whole section)
      var localContainer = el.closest('[class*="photo-sub"],[class*="subsection"],[class*="photo-section"]')
                        || el.parentElement;
      var localGrid = localContainer ? localContainer.querySelector(GRID_SEL) : null;

      inp = document.createElement('input');
      inp.type = 'file';
      if (tid) inp.id = tid;
      inp.accept   = 'image/*';
      inp.multiple = true;
      inp.style.cssText = 'position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';
      el.parentNode.insertBefore(inp, el.nextSibling);
      attachInput(inp, localGrid);
    }

    (function(t){ el.addEventListener('click', function(){ t.click(); }); })(inp);
  });

});
})();
<\/script>`;

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

  const injection = watermark + '\n' + PHOTO_FIX_SCRIPT;
  const bodyIdx   = data.html.lastIndexOf('</body>');
  const html      = bodyIdx !== -1
    ? data.html.slice(0, bodyIdx) + injection + '\n</body>' + data.html.slice(bodyIdx + 7)
    : data.html + injection;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);

  return { props: {} };
}

export default function EventPage() {
  return null;
}
