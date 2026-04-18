import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function cloudConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const MAX_BODY = 2000;
const MAX_NAME = 120;
const MAX_PER_EVENT = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared messages are not configured.' });
  }

  const { eventId, authorName, body } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > MAX_BODY) {
    return res.status(400).json({ error: `Message must be 1–${MAX_BODY} characters.` });
  }

  let name = typeof authorName === 'string' ? authorName.trim() : '';
  if (!name) name = 'Guest';
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);

  const supabase = getSupabase();

  const { count, error: countErr } = await supabase
    .from('event_messages')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (countErr) {
    console.error('[event-messages/create] count', countErr);
    return res.status(500).json({ error: 'Database error.' });
  }

  if ((count ?? 0) >= MAX_PER_EVENT) {
    return res.status(400).json({ error: 'Message limit reached for this event.' });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('event_messages')
    .insert({
      event_id: eventId,
      author_name: name,
      body: text,
    })
    .select('id, author_name, body, created_at, updated_at')
    .single();

  if (insErr) {
    console.error('[event-messages/create] insert', insErr);
    const msg = String(insErr.message || insErr);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_messages SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
      });
    }
    if (insErr.code === '23503' || msg.includes('foreign key')) {
      return res.status(400).json({
        error: 'Event not found.',
        code: 'EVENT_FK',
      });
    }
    return res.status(500).json({ error: 'Could not save message.' });
  }

  const row = inserted;
  return res.status(200).json({ message: row });
}
