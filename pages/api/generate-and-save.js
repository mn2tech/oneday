import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { Resend } from 'resend';
import { generateAdminToken, hashAdminToken } from '../../lib/eventAdminAuth';
import { normalizeDeviceId } from '../../lib/deviceOwnership';
import { normalizeStripeEnvKey, looksLikeStripeSecretKey } from '../../lib/stripePublishableKey';

// Lazily initialised inside the handler so env vars are always resolved at request time
function getStripe() {
  const key = normalizeStripeEnvKey(process.env.STRIPE_SECRET_KEY);
  if (!key || !looksLikeStripeSecretKey(key)) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(key, { apiVersion: '2023-10-16' });
}
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function confirmationFromAddress() {
  return process.env.RESEND_FROM || 'OneDay <noreply@getoneday.com>';
}

function getMissingEnvVars() {
  const required = [
    'STRIPE_SECRET_KEY',
    'ANTHROPIC_API_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];
  return required.filter((key) => !process.env[key]);
}

const SYSTEM_PROMPT = `You are an expert web developer and event designer. Generate a COMPLETE single-page HTML event app.

RULES: Return ONLY raw HTML starting with <!DOCTYPE html>. No markdown or explanation. Google Fonts via @import. Mobile-first. All CSS in <style>, all JS in <script> before </body>. Close all tags, end with </html>. Keep CSS minimal.

STORAGE KEYS (must match the live URL path — use this exact pattern everywhere in your script):
const eventId = (location.pathname.split('/').pop() || 'event').slice(0, 30);
localStorage: photos_\${eventId}_0 and photos_\${eventId}_1 for the two photo sections (0-based index) only. Do NOT use localStorage for messages, RSVP, or poll on OneDay — the host syncs via Supabase (event_messages, event_rsvps, event_poll_votes). Keep #msgList empty on first paint; wire submitMessage / editMsg / deleteMsg. For RSVP use #rsvp with name/adults/kids and window.handleRSVP; for poll use #pollOpt0.. and window.vote — no rsvps_* / poll_* localStorage. Never use a hardcoded fake id.

CRITICAL JS RULES:
1. NEVER use inline event handlers in HTML attributes (no onclick="", no onchange="", no onsubmit=""). Bind ALL events with addEventListener() or element.onclick = fn inside DOMContentLoaded.
2. RSVP form: use form.addEventListener('submit', function(e){ e.preventDefault(); ... }) — never onsubmit="".
3. Any function called from dynamically-generated innerHTML (e.g. edit/delete buttons built inside renderMessages) MUST be assigned to window so it is globally accessible:
   window.editMsg = function editMsg(idx) { ... };
   window.deleteMsg = function deleteMsg(idx) { ... };
   window.saveMsg = function saveMsg(idx) { ... };
   window.cancelEdit = function cancelEdit(idx) { ... };
   NEVER name a function "postMessage" — it conflicts with the browser's built-in window.postMessage API. Use "submitMessage" or "sendMessage" instead, and assign them to window (e.g. window.submitMessage = function submitMessage() { ... }).

LIFECYCLE (parse the actual event date from the prompt):
- Before event day: RSVP open, Photos open, Messages open
- On event day and after: RSVP closes (hide RSVP form, show "RSVP is now closed" message), Photos and Messages still open
- After eventDate + 7 days: Everything locks (isLocked=true). Hide upload buttons, hide message input, show "This event has ended — thank you for celebrating with us!" banner. Uploaded photos, RSVPs, and messages stay visible.

Run this at the top of <script> (outside any function):
const today = new Date(); today.setHours(0,0,0,0);
const eventDate = new Date('ACTUAL_EVENT_DATE_FROM_PROMPT'); eventDate.setHours(0,0,0,0);
const lockDate = new Date(eventDate); lockDate.setDate(lockDate.getDate() + 7);
const rsvpClosed = today >= eventDate;
const isLocked = today > lockDate;

SECTIONS:
1. Hero — title, date, location, JS countdown timer, "Hosted by [name]" line.
   Keep hero copy concise and non-redundant:
   - NEVER repeat the title text in the subtitle — they must be meaningfully different.
   - The subtitle must NOT be the same sentence as the title, not even paraphrased.
   - If no tagline was provided, invent a warm, poetic one-liner that fits the event tone (e.g. "Join us for a day of love, color, and celebration" or "A joyful gathering to honor the bride-to-be").
   - If date/time is shown in chips/metadata, do not repeat the same full date/time sentence in subtitle.
   - Prefer: title = event name + honoree, subtitle = short warm welcome or poetic context phrase.
2. Schedule — vertical timeline
3. Photo Wall — 2 sections with event-appropriate labels (e.g. Ceremony & Reception for weddings, Celebration & Fun for birthdays). Each section MUST include ALL of the following:
   HTML: <label for="photo-input-N" class="upload-btn">+ Add Photos</label> styled as a button, plus <input type="file" id="photo-input-N" accept="image/*" multiple style="position:absolute;opacity:0;width:1px;height:1px;overflow:hidden"> — NEVER use display:none on file inputs.
   JS (REQUIRED — do not skip): attach addEventListener('change') to each file input. Inside handler: loop files, check size ≤5MB, use FileReader.readAsDataURL(), in onload save base64 to localStorage array at key "photos_[eventId]_N", then call renderPhotos(N) to rebuild the grid. renderPhotos(N) reads localStorage, creates <img> elements with object-fit:contain and a max-height so the full image is visible (not cropped), in a CSS grid, each with a × button that removes from localStorage and re-renders. Call renderPhotos(N) on DOMContentLoaded to restore saved photos.
4. RSVP — form (hidden if rsvpClosed): name, adults (min 1), kids (min 0), Submit button. If rsvpClosed show "RSVP is now closed" message. Do NOT use localStorage for RSVP on OneDay (host uses event_rsvps). Wire window.handleRSVP; show live totals in #rsvpCount when the host injects sync.
5. Poll — 2+ options with #pollOpt0, pollCount0, pollBar0, etc. Do NOT use localStorage for poll on OneDay (host uses event_poll_votes). Wire window.vote(0), window.vote(1), … read-only UI after vote if locked.
6. Message Wall — textarea + name input + "Post Message" Submit button (hidden if locked). Container #messages with #msgText, #msgName, #msgList (start empty). Do NOT use localStorage for messages. Assign window.submitMessage to post (host replaces with shared API), window.editMsg / deleteMsg / saveMsg / cancelEdit for row actions. Name field optional (default "Guest"). IMPORTANT: edit/delete/save/cancel MUST be on window (see JS RULES above).`;

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 25);
}

function buildSlug(meta) {
  // Only honoree + eventType (no host)
  const parts = [];
  if (meta?.names) parts.push(slugify(meta.names));
  if (meta?.eventType) parts.push(slugify(meta.eventType));
  return parts.filter(Boolean).join('-').slice(0, 50) || null;
}

async function getUniqueId(supabase, meta) {
  const base = buildSlug(meta);
  if (!base) return nanoid(8);

  // Check for collision
  const { data } = await supabase
    .from('event_apps')
    .select('id')
    .eq('id', base)
    .single();

  if (!data) return base; // No collision — use clean slug
  return `${base}-${nanoid(4)}`; // Collision — append short suffix
}

function fixInlineHandlerScoping(html) {
  // 1. Collect function names from inline event handlers
  const funcNames = new Set();
  for (const m of html.matchAll(/\bon\w+="([^"]+)"/g)) {
    const fn = m[1].trim().match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (fn && fn[1] !== 'event' && fn[1] !== 'return') funcNames.add(fn[1]);
  }
  if (!funcNames.size) return html;

  // 2. Find the script block that contains DOMContentLoaded
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

  // 3. Find the DOMContentLoaded opening { using a regex
  const dclRe = /document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,\s*(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{/;
  const dclMatch = dclRe.exec(sc);
  if (!dclMatch) return html;

  // 4. Walk forward with brace counting to find the matching closing }
  let depth = 1;
  let i = dclMatch.index + dclMatch[0].length; // first char after opening {
  while (i < sc.length && depth > 0) {
    const ch = sc[i];
    if (ch === '{') { depth++; }
    else if (ch === '}') { depth--; if (depth === 0) break; }
    else if (ch === '/' && sc[i + 1] === '/') { // line comment
      const nl = sc.indexOf('\n', i); i = nl === -1 ? sc.length - 1 : nl;
    } else if (ch === '/' && sc[i + 1] === '*') { // block comment
      const end = sc.indexOf('*/', i + 2); i = end === -1 ? sc.length - 1 : end + 1;
    } else if (ch === '"' || ch === "'") { // string literal
      const q = ch; i++;
      while (i < sc.length && sc[i] !== q) { if (sc[i] === '\\') i++; i++; }
    } else if (ch === '`') { // template literal (simplified)
      i++;
      while (i < sc.length && sc[i] !== '`') { if (sc[i] === '\\') i++; i++; }
    }
    i++;
  }
  i--; // i now points to the closing }

  // 5. Inject window.X = X assignments just before the closing }
  const assignments = '\n' + [...funcNames]
    .map(n => `  if(typeof ${n}==='function')window.${n}=${n};`)
    .join('\n') + '\n';

  const newSc = sc.slice(0, i) + assignments + sc.slice(i);
  return html.slice(0, scriptContentStart) + newSc + html.slice(scriptContentEnd);
}

function injectPhotoUpload(html) {
  const injection = [
    '<scr' + 'ipt>',
    '(function(){',
    'document.addEventListener("DOMContentLoaded",function(){',
    'if(window.__ONEDAY_PHOTO_UPLOAD_INJECTED__)return;window.__ONEDAY_PHOTO_UPLOAD_INJECTED__=1;',
    'var eid=(window.location.pathname.split("/").pop()||"event").slice(0,30);',
    // Step 1: Fix display:none file inputs so change events fire in all browsers
    'document.querySelectorAll("input[type=\\"file\\"]").forEach(function(inp){',
    'if(inp.style.display==="none"||window.getComputedStyle(inp).display==="none"){',
    'inp.style.cssText="position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";',
    '}',
    '});',
    // Step 2: Fix any buttons that rely on onclick to open the picker — replace with reliable click
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
    // Step 3: Attach our change handlers + render (skip if already wired — avoids double-save with serve-time engine)
    'document.querySelectorAll("input[type=\\"file\\"]").forEach(function(inp,idx){',
    'if(inp.dataset.onedayInjected)return;inp.dataset.onedayInjected="1";',
    'var key="photos_"+eid+"_"+idx;',
    'var cont=inp.closest("section")||inp.closest("[class*=photo]")||inp.closest("[id*=photo]")||inp.parentElement;',
    'var grid=cont.querySelector("[id*=grid],[class*=grid],[class*=photo-list],[class*=photos]");',
    'if(!grid){grid=document.createElement("div");grid.style.display="grid";grid.style.gridTemplateColumns="repeat(auto-fill,minmax(150px,1fr))";grid.style.gap="8px";grid.style.marginTop="12px";inp.parentElement.insertBefore(grid,inp.nextSibling);}',
    'function render(){',
    'var saved=[];try{saved=JSON.parse(localStorage.getItem(key)||"[]");}catch(ex){}',
    'grid.innerHTML="";',
    'saved.forEach(function(src,i){',
    'var w=document.createElement("div");w.style.cssText="position:relative;min-height:120px;max-height:420px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.06);border-radius:10px;overflow:hidden;padding:6px;box-sizing:border-box;";',
    'var im=document.createElement("img");im.src=src;im.style.cssText="width:100%;max-width:100%;max-height:360px;height:auto;object-fit:contain;object-position:center;border-radius:6px;display:block;";',
    'var b=document.createElement("button");b.textContent="\xD7";b.style.cssText="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.65);color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:16px;cursor:pointer;";',
    'b.setAttribute("data-idx",i);b.setAttribute("data-key",key);',
    'b.onclick=function(){var k=this.getAttribute("data-key");var n=parseInt(this.getAttribute("data-idx"));var a=[];try{a=JSON.parse(localStorage.getItem(k)||"[]");}catch(ex){}a.splice(n,1);localStorage.setItem(k,JSON.stringify(a));render();};',
    'w.appendChild(im);w.appendChild(b);grid.appendChild(w);',
    '});',
    '}',
    'render();',
    'inp.addEventListener("change",function(){',
    'var files=Array.from(this.files);var arr=[];try{arr=JSON.parse(localStorage.getItem(key)||"[]");}catch(ex){}',
    'if(arr.length+files.length>200){alert("Max 200 photos per event.");this.value="";return;}',
    'var pending=files.length;',
    'files.forEach(function(file){',
    'if(file.size>5242880){alert(file.name+" exceeds 5MB.");pending--;return;}',
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

  // Use lastIndexOf to find the real </body>, not one inside a JS string
  const bodyIdx = html.lastIndexOf('</body>');
  if (bodyIdx === -1) return html + '\n' + injection;
  return html.slice(0, bodyIdx) + '\n' + injection + '\n</body>' + html.slice(bodyIdx + 7);
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

function buildUserPrompt(prompt) {
  return `Create a complete event app (with Poll and Message Wall included) for the following event:\n\n${prompt}`;
}

/** Anthropic returns an array of content blocks; the first block is not always text. */
function extractAnthropicText(message) {
  if (!message?.content?.length) return '';
  for (const block of message.content) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return '';
}

function anthropicModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

async function sendConfirmationEmail(resend, email, eventUrl, manageUrl) {
  if (!process.env.RESEND_API_KEY || !resend) {
    console.warn('[generate-and-save] Confirmation email skipped: set RESEND_API_KEY in production.');
    return { status: 'skipped', reason: 'RESEND_NOT_CONFIGURED' };
  }
  const manageBlock =
    manageUrl &&
    `<p style="color:#aaa;margin-bottom:12px;">Host tools (moderate messages, photos, RSVPs — keep this link private):</p>
          <a href="${manageUrl}" style="display:inline-block;background:rgba(168,85,247,0.25);border:1px solid #a855f7;color:#e9d5ff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;margin-bottom:16px;">Open host link →</a>
          <p style="background:#1a1a2e;padding:12px 16px;border-radius:6px;font-size:0.8rem;word-break:break-all;color:#94a3b8;">${manageUrl}</p>`;
  try {
    await resend.emails.send({
      from: confirmationFromAddress(),
      to: email,
      subject: 'Your OneDay event page is live 🎉',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f5;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="font-size:1.4rem;font-weight:700;">◆ OneDay</span>
          </div>
          <h1 style="font-size:1.6rem;margin-bottom:8px;">Your event page is live! 🎉</h1>
          <p style="color:#aaa;margin-bottom:24px;">Your AI-generated event microsite is ready to share with your guests.</p>
          <a href="${eventUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;margin-bottom:24px;">View Your Event Page →</a>
          <p style="color:#888;font-size:0.85rem;margin-bottom:8px;">Or copy this link to share:</p>
          <p style="background:#1a1a2e;padding:12px 16px;border-radius:6px;font-size:0.9rem;word-break:break-all;color:#c084fc;">${eventUrl}</p>
          ${manageBlock || ''}
          <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
          <p style="color:#666;font-size:0.8rem;">Your event page is permanent — it will live at this link forever as a memory page.</p>
          <p style="color:#666;font-size:0.8rem;">Anyone with the host link can moderate guest content. Do not share it publicly.</p>
        </div>
      `,
    });
    return { status: 'sent' };
  } catch (err) {
    // Non-fatal — log but don't fail the request
    console.error('[generate-and-save] Resend error:', err?.message, err?.statusCode, JSON.stringify(err?.body));
    return { status: 'failed', reason: err?.message || 'RESEND_SEND_FAILED' };
  }
}

const DEV_MODE = (id) => typeof id === 'string' && id.startsWith('dev_test_');
const ALLOW_DEV_TEST_PAYMENTS = process.env.ALLOW_DEV_TEST_PAYMENTS === 'true';

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, plan, tier, email, paymentIntentId, eventMeta, deviceId } = req.body || {};
  const creatorDeviceId = normalizeDeviceId(deviceId);
  // isFree: client sends tier='free' OR paymentIntentId starts with 'free_' (belt-and-suspenders)
  const isFree = tier === 'free' || (typeof paymentIntentId === 'string' && paymentIntentId.startsWith('free_'));
  const eventTier = isFree ? 'free' : 'pro';

  // Input validation
  if (!prompt || !email) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!isFree && !paymentIntentId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const missingVars = getMissingEnvVars();
  if (missingVars.length > 0) {
    console.error('[generate-and-save] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({ error: 'Server configuration is incomplete. Please contact support.' });
  }

  const isDev = DEV_MODE(paymentIntentId);
  if (isDev && !ALLOW_DEV_TEST_PAYMENTS) {
    return res.status(400).json({
      error: 'Dev payment IDs are disabled. Complete a real Stripe payment to continue.',
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[generate-and-save] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'AI service not configured. Please contact support.' });
  }
  if (!isFree && !isDev && !process.env.STRIPE_SECRET_KEY) {
    console.error('[generate-and-save] STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Payment service not configured. Please contact support.' });
  }

  try {
    const stripe = !isFree && !isDev ? getStripe() : null;
    const anthropic = getAnthropic();
    const supabase = getSupabase();
    const resend = getResend();

    // 1. Verify payment (skip for free tier and dev mode)
    if (!isFree && !isDev && stripe) {
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } catch (stripeErr) {
        console.error('[generate-and-save] Stripe retrieve:', stripeErr?.message || stripeErr);
        return res.status(502).json({
          error: 'Could not verify payment. Please refresh the page and try again, or contact support.',
        });
      }
      if (paymentIntent.status !== 'succeeded') {
        return res.status(402).json({ error: 'Payment has not been completed.' });
      }

      // 2. Prevent duplicate generation
      const { data: existing } = await supabase
        .from('event_apps')
        .select('id')
        .eq('payment_intent_id', paymentIntentId)
        .single();

      if (existing) {
        const adminToken = generateAdminToken();
        const admin_token_hash = hashAdminToken(adminToken);
        const patch = { admin_token_hash };
        if (creatorDeviceId) patch.creator_device_id = creatorDeviceId;
        const { error: dupUpdErr } = await supabase
          .from('event_apps')
          .update(patch)
          .eq('id', existing.id);
        if (dupUpdErr) {
          console.error('[generate-and-save] duplicate event update:', dupUpdErr.message);
        }
        const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/e/${existing.id}`;
        const manageUrl = `${appUrl}?admin=${adminToken}`;
        const emailResult = await sendConfirmationEmail(getResend(), email, appUrl, manageUrl);
        return res.status(200).json({
          id: existing.id,
          url: appUrl,
          manageUrl,
          emailStatus: emailResult?.status || 'failed',
          emailReason: emailResult?.reason || null,
        });
      }
    }

    // 3. Call Anthropic API (large single-page HTML; low max_tokens truncates mid-document)
    let message;
    try {
      message = await anthropic.messages.create({
        model: anthropicModel(),
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildUserPrompt(prompt) },
        ],
      });
    } catch (aiErr) {
      const s = aiErr?.status ?? aiErr?.statusCode;
      const m = String(
        aiErr?.message || aiErr?.error?.message || aiErr?.error?.error?.message || aiErr || ''
      );
      console.error('[generate-and-save] Anthropic API error:', s, m, aiErr);
      if (s === 400 || m.toLowerCase().includes('invalid_request')) {
        return res.status(500).json({
          error:
            'The AI could not process this request. Try shortening your event description, or contact support.',
        });
      }
      if (
        m.toLowerCase().includes('model') &&
        (m.toLowerCase().includes('not found') || m.toLowerCase().includes('does not exist'))
      ) {
        return res.status(500).json({
          error:
            'AI model is misconfigured on the server (ANTHROPIC_MODEL). Contact support.',
        });
      }
      if (
        m.toLowerCase().includes('credit') ||
        m.toLowerCase().includes('billing') ||
        m.toLowerCase().includes('quota') ||
        m.toLowerCase().includes('balance')
      ) {
        return res.status(503).json({
          error: 'AI service quota or billing issue. Please try again later or contact support.',
        });
      }
      if (m.toLowerCase().includes('context') && m.toLowerCase().includes('length')) {
        return res.status(400).json({
          error: 'Your event description is too long for one generation. Remove some detail and try again.',
        });
      }
      throw aiErr;
    }

    if (message.stop_reason === 'max_tokens') {
      console.error('[generate-and-save] Truncated at max_tokens — page incomplete');
      return res.status(500).json({
        error:
          'The page was cut off at the length limit. Shorten your event description slightly and try again, or contact support to regenerate.',
      });
    }

    const rawHtml = extractAnthropicText(message);
    if (!rawHtml.trim()) {
      console.error('[generate-and-save] Empty AI response text');
      return res.status(500).json({
        error: 'AI returned no page content. Please try again.',
      });
    }

    let html;
    try {
      html = fixInlineHandlerScoping(extractHtml(rawHtml));
      html = injectPhotoUpload(html);
    } catch (processErr) {
      console.error('[generate-and-save] HTML post-process error:', processErr?.message || processErr);
      return res.status(500).json({
        error: 'Processing the generated page failed. Please try again.',
      });
    }

    const lower = html.toLowerCase();
    if (!lower.includes('<!doctype')) {
      console.error('[generate-and-save] AI did not return valid HTML');
      return res.status(500).json({ error: 'AI returned invalid HTML. Please try again.' });
    }
    if (!lower.includes('</body>') || !lower.includes('</html>')) {
      console.error('[generate-and-save] Incomplete HTML (missing </body> or </html>)');
      return res.status(500).json({
        error: 'Incomplete page generated. Please try again.',
      });
    }

    const title = prompt.split(/[.!?\n]/)[0].trim().slice(0, 60) || 'My Event';
    const id = await getUniqueId(supabase, eventMeta);
    const resolvedPlan = plan || 'standard';
    const adminToken = generateAdminToken();
    const admin_token_hash = hashAdminToken(adminToken);

    // Save to Supabase
    const { error: insertError } = await supabase.from('event_apps').insert({
      id,
      payment_intent_id: paymentIntentId || null,
      title,
      html,
      prompt,
      plan: resolvedPlan,
      tier: eventTier,
      edit_count: 0,
      email,
      is_live: true,
      generation_status: 'complete',
      creator_device_id: creatorDeviceId,
      admin_token_hash,
    });

    if (insertError) {
      console.error('[generate-and-save] Supabase insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to save event app.' });
    }

    const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/e/${id}`;
    const manageUrl = `${appUrl}?admin=${adminToken}`;

    // 4. Send confirmation email (non-blocking)
    const emailResult = await sendConfirmationEmail(resend, email, appUrl, manageUrl);

    return res.status(200).json({
      id,
      url: appUrl,
      manageUrl,
      emailStatus: emailResult?.status || 'failed',
      emailReason: emailResult?.reason || null,
    });

  } catch (err) {
    const status = err?.status ?? err?.statusCode;
    const msg = String(
      err?.message || err?.error?.message || err?.error?.error?.message || err || ''
    );
    console.error('[generate-and-save] Error:', msg, 'status=', status, err);

    const lowered = msg.toLowerCase();
    if (status === 401 || msg.includes('401') || lowered.includes('invalid x-api-key')) {
      return res.status(500).json({ error: 'AI service key is invalid. Please contact support.' });
    }
    if (status === 429 || msg.includes('429') || lowered.includes('rate limit')) {
      return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    }
    if (status === 529 || lowered.includes('overloaded')) {
      return res.status(503).json({ error: 'AI is busy. Please try again in a moment.' });
    }
    if (lowered.includes('timeout') || lowered.includes('timed out')) {
      return res.status(504).json({ error: 'Generation timed out. Please try again.' });
    }
    if (lowered.includes('fetch failed') || lowered.includes('econnreset') || lowered.includes('socket')) {
      return res.status(503).json({ error: 'Network error talking to AI. Please try again in a moment.' });
    }
    if (lowered.includes('stripe') && lowered.includes('payment')) {
      return res.status(502).json({ error: 'Payment verification failed. Please refresh and try again.' });
    }

    return res.status(500).json({
      error:
        'Generation failed. Please try again. If it keeps happening, contact support with the time you tried (we log details on the server).',
    });
  }
}
