import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
  if (!eventId || eventId.length > 80 || !endpoint) {
    return res.status(400).json({ error: 'Invalid eventId or endpoint.' });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('event_guest_push_subscriptions')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('endpoint', endpoint);

  if (error) {
    console.error('[guest-notifications/unsubscribe] update', error);
    return res.status(500).json({ error: 'Could not unsubscribe device.' });
  }

  return res.status(200).json({ ok: true });
}
