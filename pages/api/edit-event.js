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
  maxDuration: 60,
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
    const updatedHtml = extractHtml(rawHtml);

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
