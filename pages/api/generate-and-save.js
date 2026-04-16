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

const SYSTEM_PROMPT = `You are an expert web developer and event designer.

Generate a COMPLETE, single-page HTML event app. Keep the CSS concise — avoid excessive animations or decorative elements that waste tokens.

STRICT RULES:
- Return ONLY raw HTML starting with <!DOCTYPE html>
- No markdown, no code fences, no explanation — just pure HTML
- Use Google Fonts via @import inside a <style> tag
- Mobile-first responsive design
- All CSS inside <style> in <head>, all JS inside <script> before </body>
- IMPORTANT: Always close all tags properly and end with </html>

REQUIRED SECTIONS (keep each section's CSS minimal):
1. Hero — title, date, location, countdown timer (JS), and a "Hosted by [name]" line styled warmly beneath the title
2. Schedule — simple vertical timeline
3. Photo Wall — CSS grid with the following features:
   - "Add Photos" button that opens a hidden <input type="file" accept="image/*" multiple>
   - On file select: read each file with FileReader, convert to base64, store array in localStorage key "photos_[eventId]"
   - Render uploaded photos as <img> tiles in the grid; show styled placeholder tiles when no photos uploaded yet
   - Each photo tile has a subtle × remove button (top-right corner) that deletes it from localStorage and removes from DOM
   - Limit: max 20 photos, max 3MB per photo — show a friendly alert if exceeded
   - Photos persist across page reloads via localStorage
4. RSVP counter — "+1 Going" button, count in localStorage

FOR PREMIUM ALSO INCLUDE:
5. Live Poll — 2 options, percentage bars, localStorage
6. Guest Message Wall — input + message list, localStorage
   - Each message must show an Edit button and a Delete button
   - Edit: clicking Edit replaces the message text with an inline <input> pre-filled with the current text, and swaps the Edit/Delete buttons for Save and Cancel
   - Save: updates the message text in localStorage and re-renders
   - Cancel: restores the original text without saving
   - Delete: removes the message from localStorage and removes it from the DOM
   - All message CRUD must persist via localStorage`;

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

  const { prompt, plan, email, paymentIntentId } = req.body;

  // Input validation
  if (!prompt || !plan || !email || !paymentIntentId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  if (!['basic', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  const isDev = DEV_MODE(paymentIntentId);

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
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
    const id = nanoid(8);

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
    console.error('[generate-and-save] Unhandled error:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
}
