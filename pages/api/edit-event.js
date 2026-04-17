import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const EDIT_SYSTEM_PROMPT = `You are an expert web developer. You will receive a complete HTML event page and a change request from the customer.

Apply the requested changes and return the COMPLETE updated HTML.

STRICT RULES:
- Return ONLY raw HTML starting with <!DOCTYPE html>
- No markdown, no code fences, no explanation — just pure HTML
- Preserve all existing sections and functionality unless explicitly asked to remove them
- CRITICAL JS RULE: NEVER use inline event handlers in HTML (no onclick="", no onchange="", no onsubmit=""). ALL event binding must be done in JavaScript using addEventListener or element.onclick = function(){}. When fixing existing pages, replace ALL inline handlers with addEventListener equivalents.
- Preserve localStorage key pattern: eventId = (location.pathname.split('/').pop()||'event').slice(0,30); keys photos_\${eventId}_0, photos_\${eventId}_1, rsvps_\${eventId}, messages_\${eventId}, poll_\${eventId}.
- NEVER name a function "postMessage" — it conflicts with the browser's built-in window.postMessage API. Use "submitMessage" or "sendMessage" instead.
- Any function called from dynamically-generated innerHTML (e.g. edit/delete buttons created inside renderMessages) MUST be assigned to window: window.editMsg = function editMsg(idx){...}; window.deleteMsg = function deleteMsg(idx){...}; window.saveMsg = function saveMsg(idx){...}; window.cancelEdit = function cancelEdit(idx){...};
- If the Photo Wall exists and has no working upload: use a <label for="photo-input-[n]"> styled as a button to trigger the file input natively. File input: id="photo-input-[n]" accept="image/*" multiple style="position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;" — NEVER use display:none on file inputs as it blocks change events. Attach change listener via addEventListener. FileReader base64, localStorage persistence, × remove button per photo, max 20 photos/3MB.
- If the Guest Message Wall exists and has no edit/delete buttons, add them with window.editMsg / window.deleteMsg pattern above.
- Keep all existing styles, fonts, and design intact
- Only change what the customer asked to change
- Always close all tags properly and end with </html>`;

function injectPhotoUpload(html) {
  const injection = [
    '<scr' + 'ipt>',
    '(function(){',
    'document.addEventListener("DOMContentLoaded",function(){',
    'var eid=(window.location.pathname.split("/").pop()||"event").slice(0,30);',
    // Step 1: Fix display:none file inputs so change events fire in all browsers
    'document.querySelectorAll("input[type=\\"file\\"]").forEach(function(inp){',
    'if(inp.style.display==="none"||window.getComputedStyle(inp).display==="none"){',
    'inp.style.cssText="position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";',
    '}',
    '});',
    // Step 2: Fix any buttons that rely on onclick to open the picker
    'document.querySelectorAll("[onclick]").forEach(function(el){',
    'var oc=el.getAttribute("onclick");',
    'if(oc&&oc.indexOf(".click()")!==-1){',
    'el.removeAttribute("onclick");',
    'el.addEventListener("click",function(){',
    'var m=oc.match(/getElementById\\([\'"]([^\'"]+)[\'"]/);',
    'var inp=m?document.getElementById(m[1]):null;',
    'if(inp){inp.click();}',
    '});',
    '}',
    '});',
    // Step 3: Attach our change handlers + render
    'document.querySelectorAll("input[type=\\"file\\"]").forEach(function(inp,idx){',
    'var key="photos_"+eid+"_"+idx;',
    'var cont=inp.closest("section")||inp.closest("[class*=photo]")||inp.closest("[id*=photo]")||inp.parentElement;',
    'var grid=cont.querySelector("[id*=grid],[class*=grid],[class*=photo-list],[class*=photos]");',
    'if(!grid){grid=document.createElement("div");grid.style.display="grid";grid.style.gridTemplateColumns="repeat(auto-fill,minmax(150px,1fr))";grid.style.gap="8px";grid.style.marginTop="12px";inp.parentElement.insertBefore(grid,inp.nextSibling);}',
    'function render(){',
    'var saved=[];try{saved=JSON.parse(localStorage.getItem(key)||"[]");}catch(ex){}',
    'grid.innerHTML="";',
    'saved.forEach(function(src,i){',
    'var w=document.createElement("div");w.style.position="relative";',
    'var im=document.createElement("img");im.src=src;im.style.cssText="width:100%;height:180px;object-fit:cover;border-radius:8px;display:block;";',
    'var b=document.createElement("button");b.textContent="\xD7";b.style.cssText="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:16px;cursor:pointer;";',
    'b.setAttribute("data-idx",i);b.setAttribute("data-key",key);',
    'b.onclick=function(){var k=this.getAttribute("data-key");var n=parseInt(this.getAttribute("data-idx"));var a=[];try{a=JSON.parse(localStorage.getItem(k)||"[]");}catch(ex){}a.splice(n,1);localStorage.setItem(k,JSON.stringify(a));render();};',
    'w.appendChild(im);w.appendChild(b);grid.appendChild(w);',
    '});',
    '}',
    'render();',
    'inp.addEventListener("change",function(){',
    'var files=Array.from(this.files);var arr=[];try{arr=JSON.parse(localStorage.getItem(key)||"[]");}catch(ex){}',
    'if(arr.length+files.length>20){alert("Max 20 photos per section.");this.value="";return;}',
    'var pending=files.length;',
    'files.forEach(function(file){',
    'if(file.size>3145728){alert(file.name+" exceeds 3MB.");pending--;return;}',
    'var r=new FileReader();',
    'r.onload=function(e){arr.push(e.target.result);localStorage.setItem(key,JSON.stringify(arr));pending--;if(pending<=0)render();};',
    'r.readAsDataURL(file);',
    '});',
    'this.value="";',
    '});',
    '});',
    '});',
    '})();',
    '<\/script>',
  ].join('\n');
  const bodyIdx = html.lastIndexOf('</body>');
  if (bodyIdx === -1) return html + '\n' + injection;
  return html.slice(0, bodyIdx) + '\n' + injection + '\n</body>' + html.slice(bodyIdx + 7);
}

function fixInlineHandlerScoping(html) {
  const funcNames = new Set();
  for (const m of html.matchAll(/\bon\w+="([^"]+)"/g)) {
    const fn = m[1].trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (fn && fn[1] !== 'event' && fn[1] !== 'return') funcNames.add(fn[1]);
  }
  if (!funcNames.size) return html;
  let scriptContentStart = -1, scriptContentEnd = -1;
  const scriptTagRe = /<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi;
  let sm;
  while ((sm = scriptTagRe.exec(html)) !== null) {
    const openEnd = html.indexOf('>', sm.index) + 1;
    const closeStart = sm.index + sm[0].lastIndexOf('<');
    if (html.slice(openEnd, closeStart).includes('DOMContentLoaded')) {
      scriptContentStart = openEnd;
      scriptContentEnd = closeStart;
    }
  }
  if (scriptContentStart === -1) return html;
  const sc = html.slice(scriptContentStart, scriptContentEnd);
  const dclRe = /document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,\s*(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{/;
  const dclMatch = dclRe.exec(sc);
  if (!dclMatch) return html;
  let depth = 1;
  let i = dclMatch.index + dclMatch[0].length;
  while (i < sc.length && depth > 0) {
    const ch = sc[i];
    if (ch === '{') { depth++; }
    else if (ch === '}') { depth--; if (depth === 0) break; }
    else if (ch === '/' && sc[i + 1] === '/') { const nl = sc.indexOf('\n', i); i = nl === -1 ? sc.length - 1 : nl; }
    else if (ch === '/' && sc[i + 1] === '*') { const end = sc.indexOf('*/', i + 2); i = end === -1 ? sc.length - 1 : end + 1; }
    else if (ch === '"' || ch === "'") { const q = ch; i++; while (i < sc.length && sc[i] !== q) { if (sc[i] === '\\') i++; i++; } }
    else if (ch === '`') { i++; while (i < sc.length && sc[i] !== '`') { if (sc[i] === '\\') i++; i++; } }
    i++;
  }
  i--;
  const assignments = '\n' + [...funcNames].map(n => `  if(typeof ${n}==='function')window.${n}=${n};`).join('\n') + '\n';
  const newSc = sc.slice(0, i) + assignments + sc.slice(i);
  return html.slice(0, scriptContentStart) + newSc + html.slice(scriptContentEnd);
}

function extractHtml(raw) {
  let html = raw.trim();
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  if (!html.toLowerCase().startsWith('<!doctype')) {
    const idx = html.toLowerCase().indexOf('<!doctype');
    if (idx !== -1) html = html.slice(idx);
  }
  return html;
}

const DEV_MODE_ID = () => true; // always try file first, fall back to Supabase

async function loadHtml(id, supabase) {
  // Try local file first (dev mode)
  const filePath = path.join(process.cwd(), 'public', 'preview', `${id}.html`);
  if (fs.existsSync(filePath)) {
    return { html: fs.readFileSync(filePath, 'utf8'), source: 'file', filePath };
  }
  // Fall back to Supabase (production)
  const { data, error } = await supabase
    .from('event_apps')
    .select('html')
    .eq('id', id)
    .single();
  if (error || !data) return { html: null, source: null };
  return { html: data.html, source: 'supabase' };
}

async function saveHtml(id, html, source, filePath, supabase) {
  if (source === 'file') {
    fs.writeFileSync(filePath, html, 'utf8');
    return null;
  }
  const { error } = await supabase
    .from('event_apps')
    .update({ html, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error;
}

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, changeRequest } = req.body;

  if (!id || !changeRequest?.trim()) {
    return res.status(400).json({ error: 'Missing id or changeRequest.' });
  }

  if (changeRequest.trim().length < 5) {
    return res.status(400).json({ error: 'Change request is too short.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[edit-event] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'AI service not configured. Please contact support.' });
  }

  try {
    const anthropic = getAnthropic();
    const supabase = getSupabase();

    // 1. Load existing HTML
    const { html: existingHtml, source, filePath } = await loadHtml(id, supabase);

    if (!existingHtml) {
      return res.status(404).json({ error: 'Event page not found.' });
    }

    // 2. Call Claude to apply the changes (full HTML in + full HTML out — needs high max_tokens)
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: EDIT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the existing event page HTML:\n\n${existingHtml}\n\n---\n\nChange request: ${changeRequest.trim()}`,
        },
      ],
    });

    if (message.stop_reason === 'max_tokens') {
      console.error('[edit-event] Truncated at max_tokens');
      return res.status(500).json({
        error:
          'The update was cut off (page too large). Try a smaller change, or contact support.',
      });
    }

    const rawHtml = message.content[0]?.text || '';
    let updatedHtml = fixInlineHandlerScoping(extractHtml(rawHtml));
    updatedHtml = injectPhotoUpload(updatedHtml);

    const lower = updatedHtml.toLowerCase();
    if (!lower.includes('<!doctype')) {
      return res.status(500).json({ error: 'AI returned invalid HTML. Please try again.' });
    }
    if (!lower.includes('</body>') || !lower.includes('</html>')) {
      return res.status(500).json({ error: 'Incomplete page from AI. Please try again.' });
    }

    // 3. Save updated HTML
    const saveError = await saveHtml(id, updatedHtml, source, filePath, supabase);
    if (saveError) {
      console.error('[edit-event] Save error:', saveError.message);
      return res.status(500).json({ error: 'Failed to save changes.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    const status = err?.status ?? err?.statusCode;
    const msg = String(err?.message || err?.error?.message || err || '');
    console.error('[edit-event] Error:', msg, 'status=', status, err);

    if (status === 401 || msg.includes('401') || msg.toLowerCase().includes('invalid x-api-key')) {
      return res.status(500).json({ error: 'AI service key is invalid. Please contact support.' });
    }
    if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    }
    if (status === 529 || msg.toLowerCase().includes('overloaded')) {
      return res.status(503).json({ error: 'AI is busy. Please try again in a moment.' });
    }
    if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('timed out')) {
      return res.status(504).json({ error: 'Request timed out. Try a shorter change and retry.' });
    }

    return res.status(500).json({
      error:
        'Could not apply changes. If this keeps happening, try a smaller edit or contact support.',
    });
  }
}
