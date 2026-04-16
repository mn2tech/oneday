import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

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

AUTO-LOCK: Parse the event date. At load, if today > eventDate + 7 days → isLocked=true. When locked: hide upload buttons and RSVP form, show "This event has ended — thank you for celebrating with us!" banner in each section. Uploaded photos and RSVPs stay visible.

SECTIONS:
1. Hero — title, date, location, JS countdown timer, "Hosted by [name]" line
2. Schedule — vertical timeline
3. Photo Wall — 2 sections with event-appropriate labels (e.g. Ceremony & Reception for weddings, Celebration & Fun for birthdays). Each section: "Add Photos" button (hidden if locked), file input (accept="image/*" multiple), FileReader→base64→localStorage key "photos_[eventId]_[section]", imgs with object-fit:cover height:180px in CSS grid (repeat(auto-fill,minmax(150px,1fr))), × remove button per photo (hidden if locked), max 20 photos/3MB per section
4. RSVP — form (hidden if locked): name, adults (min 1), kids (min 0), Submit button. Save to localStorage "rsvps_[eventId]". Show list with totals "X adults Y kids". × delete per entry.

PREMIUM ONLY:
5. Poll — 2 options, % bars, localStorage, read-only if locked
6. Message Wall — input (hidden if locked) + list. Each message: Edit (inline input + Save/Cancel) and Delete. All CRUD persists via localStorage.`;

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
  const parts = [];
  if (meta?.names) parts.push(slugify(meta.names));
  if (meta?.eventType) parts.push(slugify(meta.eventType));
  if (meta?.hostedBy) parts.push('by-' + slugify(meta.hostedBy));
  return parts.filter(Boolean).join('-').slice(0, 70) || null;
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

function extractHtml(raw) {
  // Remove markdown code fences if model wraps in them
  let html = raw.trim();
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  // Ensure it starts with doctype
  if (!html.toLowerCase().startsWith('<!doctype')) {
    const idx = html.toLowerCase().indexOf('<!doctype');
    if (idx !== -1) html = html.slice(idx);
  }
  return html;
}

function buildUserPrompt(prompt, plan) {
  const planNote = plan === 'premium'
    ? '\n\nThis is a PREMIUM plan — include the Poll and Guest Message Wall sections.'
    : '\n\nThis is a BASIC plan — include all core sections (hero, schedule, photo wall, RSVP counter).';

  return `Create an event app for the following event:\n\n${prompt}${planNote}`;
}

const DEV_MODE = (id) => typeof id === 'string' && id.startsWith('dev_test_');

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, plan, email, paymentIntentId, eventMeta } = req.body;

  // Input validation
  if (!prompt || !plan || !email || !paymentIntentId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  if (!['basic', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  const missingVars = getMissingEnvVars();
  if (missingVars.length > 0) {
    console.error('[generate-and-save] Missing env vars:', missingVars.join(', '));
    return res.status(500).json({ error: 'Server configuration is incomplete. Please contact support.' });
  }

  const isDev = DEV_MODE(paymentIntentId);

  // Validate required env vars before doing anything
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

    // 1. Verify payment (skip in dev mode)
    if (!isDev) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        return res.status(402).json({ error: 'Payment has not been completed.' });
      }
      const paidPlan = paymentIntent.metadata?.plan;
      if (paidPlan && paidPlan !== plan) {
        return res.status(400).json({ error: 'Plan mismatch with payment.' });
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
    // Keep generation bounded so serverless runtime does not time out at the edge.
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(prompt, plan) },
      ],
    });

    const rawHtml = message.content[0]?.text || '';
    const html = extractHtml(rawHtml);

    if (!html.toLowerCase().includes('<!doctype')) {
      console.error('[generate-and-save] AI did not return valid HTML');
      return res.status(500).json({ error: 'AI returned invalid HTML. Please try again.' });
    }

    const title = prompt.split(/[.!?\n]/)[0].trim().slice(0, 60) || 'My Event';
    const id = await getUniqueId(supabase, eventMeta);

    // Save to Supabase in all environments (dev + production)
    const { error: insertError } = await supabase.from('event_apps').insert({
      id,
      payment_intent_id: paymentIntentId,
      title,
      html,
      prompt,
      plan,
      email,
      is_live: true,
      generation_status: 'complete',
    });

    if (insertError) {
      console.error('[generate-and-save] Supabase insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to save event app.' });
    }

    const appUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/e/${id}`;
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
