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

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared messages are not configured.' });
  }

  const { eventId, id, body, authorName } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid message id.' });
  }

  const text = typeof body === 'string' ? body.trim() : '';
  if (!text || text.length > MAX_BODY) {
    return res.status(400).json({ error: `Message must be 1–${MAX_BODY} characters.` });
  }

  let name;
  if (authorName !== undefined) {
    name = typeof authorName === 'string' ? authorName.trim() : '';
    if (!name) name = 'Guest';
    if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);
  }

  const supabase = getSupabase();

  const patch = { body: text, updated_at: new Date().toISOString() };
  if (name !== undefined) patch.author_name = name;

  const { data: row, error } = await supabase
    .from('event_messages')
    .update(patch)
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id, author_name, body, created_at, updated_at')
    .single();

  if (error) {
    console.error('[event-messages/update]', error);
    return res.status(500).json({ error: 'Could not update message.' });
  }

  if (!row) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  return res.status(200).json({ message: row });
}
