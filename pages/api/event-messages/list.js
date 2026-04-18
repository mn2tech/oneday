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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared messages are not configured.', messages: [] });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from('event_messages')
    .select('id, author_name, body, created_at, updated_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-messages/list]', error);
    const msg = String(error.message || error);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_messages SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
        messages: [],
      });
    }
    return res.status(500).json({ error: 'Database error.', messages: [] });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ messages: rows || [] });
}
