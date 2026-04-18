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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared messages are not configured.' });
  }

  const { eventId, id } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid message id.' });
  }

  const supabase = getSupabase();

  const { data: deleted, error } = await supabase
    .from('event_messages')
    .delete()
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id');

  if (error) {
    console.error('[event-messages/delete]', error);
    return res.status(500).json({ error: 'Could not delete message.' });
  }

  if (!deleted || !deleted.length) {
    return res.status(404).json({ error: 'Message not found.' });
  }

  return res.status(200).json({ ok: true });
}
