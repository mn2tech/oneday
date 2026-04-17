import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Injected on every event page at serve time — fixes display:none file inputs
// so change events fire in all browsers, and ensures photos can be uploaded
// regardless of what Claude originally generated.
const PHOTO_FIX_SCRIPT = [
  '<scr' + 'ipt>',
  '(function(){',
  'document.addEventListener("DOMContentLoaded",function(){',
  'var eid=(window.location.pathname.split("/").pop()||"event").slice(0,30);',

  // 1. Unhide display:none file inputs (blocks change events in Firefox/Safari)
  'document.querySelectorAll("input[type=\'file\']").forEach(function(inp){',
  '  if(inp.style.display==="none"||window.getComputedStyle(inp).display==="none"){',
  '    inp.style.cssText="position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;";',
  '  }',
  '});',

  // 2. Replace onclick=".click()" buttons with proper addEventListener
  'document.querySelectorAll("[onclick]").forEach(function(el){',
  '  var oc=el.getAttribute("onclick")||"";',
  '  if(oc.indexOf(".click()")!==-1){',
  '    el.removeAttribute("onclick");',
  '    (function(handler){',
  '      el.addEventListener("click",function(){',
  '        var m=handler.match(/getElementById\\([\'"]([^\'"]+)[\'"]/);',
  '        if(m){var t=document.getElementById(m[1]);if(t)t.click();}',
  '      });',
  '    })(oc);',
  '  }',
  '});',

  // 3. Attach guaranteed change listener + FileReader + localStorage + render
  'document.querySelectorAll("input[type=\'file\']").forEach(function(inp,idx){',
  '  var key="photos_"+eid+"_"+idx;',
  '  var cont=inp.closest("section")||inp.closest("[class*=\'photo\']")||inp.closest("[id*=\'photo\']")||inp.parentElement;',
  '  var grid=cont?cont.querySelector("[id*=\'grid\'],[class*=\'grid\'],[class*=\'photo-list\'],[class*=\'photos\']"):null;',
  '  if(!grid){',
  '    grid=document.createElement("div");',
  '    grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:12px;";',
  '    inp.parentElement.insertBefore(grid,inp.nextSibling);',
  '  }',
  '  function render(){',
  '    var saved=[];try{saved=JSON.parse(localStorage.getItem(key)||"[]");}catch(e){}',
  '    grid.innerHTML="";',
  '    saved.forEach(function(src,i){',
  '      var w=document.createElement("div");w.style.position="relative";',
  '      var im=document.createElement("img");im.src=src;',
  '      im.style.cssText="width:100%;height:180px;object-fit:cover;border-radius:8px;display:block;";',
  '      var b=document.createElement("button");b.textContent="\xD7";',
  '      b.style.cssText="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:16px;cursor:pointer;line-height:1;";',
  '      b.setAttribute("data-idx",i);b.setAttribute("data-key",key);',
  '      b.onclick=function(){',
  '        var k=this.getAttribute("data-key");',
  '        var n=parseInt(this.getAttribute("data-idx"));',
  '        var a=[];try{a=JSON.parse(localStorage.getItem(k)||"[]");}catch(e){}',
  '        a.splice(n,1);localStorage.setItem(k,JSON.stringify(a));render();',
  '      };',
  '      w.appendChild(im);w.appendChild(b);grid.appendChild(w);',
  '    });',
  '  }',
  '  render();',
  '  inp.addEventListener("change",function(){',
  '    var files=Array.from(this.files);',
  '    var arr=[];try{arr=JSON.parse(localStorage.getItem(key)||"[]");}catch(e){}',
  '    if(arr.length+files.length>20){alert("Max 20 photos.");this.value="";return;}',
  '    var pending=files.length;',
  '    files.forEach(function(file){',
  '      if(file.size>3145728){alert(file.name+" is over 3MB.");pending--;if(pending<=0)render();return;}',
  '      var r=new FileReader();',
  '      r.onload=function(e){arr.push(e.target.result);localStorage.setItem(key,JSON.stringify(arr));pending--;if(pending<=0)render();};',
  '      r.readAsDataURL(file);',
  '    });',
  '    this.value="";',
  '  });',
  '});',

  '});',
  '})();',
  '<\/scr' + 'ipt>',
].join('\n');

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

  // Inject OneDay watermark + photo fix script before </body>
  const watermark = `<div style="position:fixed;bottom:12px;right:12px;z-index:99999;background:rgba(10,10,20,0.88);color:#fff;padding:5px 14px;border-radius:20px;font-size:11px;font-family:sans-serif;backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,0.3);">Made with <a href="https://getoneday.com" target="_blank" rel="noopener noreferrer" style="color:#a855f7;text-decoration:none;font-weight:600;">OneDay</a></div>`;

  const injection = watermark + '\n' + PHOTO_FIX_SCRIPT;

  const bodyIdx = data.html.lastIndexOf('</body>');
  const html = bodyIdx !== -1
    ? data.html.slice(0, bodyIdx) + injection + '\n</body>' + data.html.slice(bodyIdx + 7)
    : data.html + injection;

  // Send raw HTML directly — no iframe, no sandbox, no scoping issues
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);

  return { props: {} };
}

// This component never renders — res.end() is called in getServerSideProps
export default function EventPage() {
  return null;
}
