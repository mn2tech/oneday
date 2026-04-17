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
- CRITICAL JS RULE: NEVER use inline event handlers in HTML (no onclick="", no onchange="", no onsubmit=""). ALL event binding must be done in JavaScript using addEventListener or element.onclick = function(){}. This allows all code to safely live inside DOMContentLoaded. When fixing existing pages, replace ALL inline handlers with addEventListener equivalents.
- If the Photo Wall exists and has no "Add Photos" button, add full photo upload:
  File input (accept image/*, multiple), FileReader base64 conversion, localStorage persistence,
  × remove button per photo, max 20 photos / 3MB per photo limit with friendly alerts
- If the Guest Message Wall exists and has no edit/delete buttons, add them:
  Edit: inline input pre-filled with current text + Save / Cancel buttons
  Delete: removes message from DOM and localStorage
  All changes must persist via localStorage
- Keep all existing styles, fonts, and design intact
- Only change what the customer asked to change
- Always close all tags properly and end with </html>`;

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

  try {
    const anthropic = getAnthropic();
    const supabase = getSupabase();

    // 1. Load existing HTML
    const { html: existingHtml, source, filePath } = await loadHtml(id, supabase);

    if (!existingHtml) {
      return res.status(404).json({ error: 'Event page not found.' });
    }

    // 2. Call Claude to apply the changes
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: EDIT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the existing event page HTML:\n\n${existingHtml}\n\n---\n\nChange request: ${changeRequest.trim()}`,
        },
      ],
    });

    const rawHtml = message.content[0]?.text || '';
    const updatedHtml = fixInlineHandlerScoping(extractHtml(rawHtml));

    if (!updatedHtml.toLowerCase().includes('<!doctype')) {
      return res.status(500).json({ error: 'AI returned invalid HTML. Please try again.' });
    }

    // 3. Save updated HTML
    const saveError = await saveHtml(id, updatedHtml, source, filePath, supabase);
    if (saveError) {
      console.error('[edit-event] Save error:', saveError.message);
      return res.status(500).json({ error: 'Failed to save changes.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[edit-event] Unhandled error:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
