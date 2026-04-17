import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { Resend } from 'resend';

// Lazily initialised inside the handler so env vars are always resolved at request time
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
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
  return new Resend(process.env.RESEND_API_KEY);
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

CRITICAL JS RULE: NEVER use inline event handlers in HTML (no onclick="", no onchange="", no onsubmit=""). ALL event binding must be done in JavaScript using addEventListener or element.onclick = function(){}. This allows all code to safely live inside DOMContentLoaded.

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
1. Hero — title, date, location, JS countdown timer, "Hosted by [name]" line
2. Schedule — vertical timeline
3. Photo Wall — 2 sections with event-appropriate labels (e.g. Ceremony & Reception for weddings, Celebration & Fun for birthdays). Each section: use a <label> element styled as a button that has a "for" attribute pointing to the file input id — this opens the picker natively with NO JavaScript needed. File input: id="photo-input-[section]" accept="image/*" multiple style="display:none". On change event via addEventListener: FileReader→base64→localStorage key "photos_[eventId]_[section]", imgs with object-fit:cover height:180px in CSS grid (repeat(auto-fill,minmax(150px,1fr))), × remove button per photo (hidden if locked), max 20 photos/3MB per section
4. RSVP — form (hidden if rsvpClosed): name, adults (min 1), kids (min 0), Submit button. If rsvpClosed show "RSVP is now closed" message. Save to localStorage "rsvps_[eventId]". Show list with totals "X adults Y kids". × delete per entry (hidden if locked).
5. Poll — 2 options, % bars, localStorage, read-only if locked
6. Message Wall — input + Submit button (hidden if locked). List of messages, each with Edit (inline) and Delete. All persists via localStorage key "messages_[eventId]".`;

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

async function sendConfirmationEmail(resend, email, eventUrl) {
  if (!process.env.RESEND_API_KEY) return; // Skip if not configured
  try {
    await resend.emails.send({
      from: 'OneDay <noreply@getoneday.com>',
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
          <hr style="border:none;border-top:1px solid #333;margin:24px 0;" />
          <p style="color:#666;font-size:0.8rem;">Your event page is permanent — it will live at this link forever as a memory page.</p>
          <p style="color:#666;font-size:0.8rem;">Need changes? Visit your event page and use the edit link.</p>
        </div>
      `,
    });
  } catch (err) {
    // Non-fatal — log but don't fail the request
    console.error('[generate-and-save] Resend error:', err?.message);
  }
}

const DEV_MODE = (id) => typeof id === 'string' && id.startsWith('dev_test_');

export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, plan, email, paymentIntentId, eventMeta } = req.body;

  // Input validation
  if (!prompt || !email || !paymentIntentId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const missingVars = getMissingEnvVars();
  if (missingVars.length > 0) {
    console.error('[generate-and-save] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({ error: 'Server configuration is incomplete. Please contact support.' });
  }

  const isDev = DEV_MODE(paymentIntentId);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[generate-and-save] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'AI service not configured. Please contact support.' });
  }
  if (!isDev && !process.env.STRIPE_SECRET_KEY) {
    console.error('[generate-and-save] STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Payment service not configured. Please contact support.' });
  }

  try {
    const stripe = getStripe();
    const anthropic = getAnthropic();
    const supabase = getSupabase();
    const resend = getResend();

    // 1. Verify payment (skip in dev mode)
    if (!isDev) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
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
        const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/e/${existing.id}`;
        return res.status(200).json({ id: existing.id, url: appUrl });
      }
    }

    // 3. Call Anthropic API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(prompt) },
      ],
    });

    const rawHtml = message.content[0]?.text || '';
    const html = fixInlineHandlerScoping(extractHtml(rawHtml));

    if (!html.toLowerCase().includes('<!doctype')) {
      console.error('[generate-and-save] AI did not return valid HTML');
      return res.status(500).json({ error: 'AI returned invalid HTML. Please try again.' });
    }

    const title = prompt.split(/[.!?\n]/)[0].trim().slice(0, 60) || 'My Event';
    const id = await getUniqueId(supabase, eventMeta);
    const resolvedPlan = plan || 'standard';

    // Save to Supabase
    const { error: insertError } = await supabase.from('event_apps').insert({
      id,
      payment_intent_id: paymentIntentId,
      title,
      html,
      prompt,
      plan: resolvedPlan,
      email,
      is_live: true,
      generation_status: 'complete',
    });

    if (insertError) {
      console.error('[generate-and-save] Supabase insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to save event app.' });
    }

    const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/e/${id}`;

    // 4. Send confirmation email (non-blocking)
    await sendConfirmationEmail(resend, email, appUrl);

    return res.status(200).json({ id, url: appUrl });

  } catch (err) {
    console.error('[generate-and-save] Unhandled error:', err?.message || err);

    const lowered = String(err?.message || '').toLowerCase();
    if (lowered.includes('timeout') || lowered.includes('timed out')) {
      return res.status(504).json({ error: 'Generation timed out. Please try again.' });
    }

    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
