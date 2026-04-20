import { createClient } from '@supabase/supabase-js';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';
import { isEventHost } from '../../../lib/eventAdminAuth';

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
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared RSVPs are not configured.' });
  }

  const { eventId, enabled, deviceId, adminToken } = req.body || {};
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be boolean.' });
  }

  const dev = normalizeDeviceId(deviceId);
  const rawAdmin = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (!dev && !rawAdmin) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  const supabase = getSupabase();
  const host = await isEventHost(supabase, eventId, { deviceId: dev, adminToken: rawAdmin });
  if (!host) {
    return res.status(403).json({ error: 'Only the host can change RSVP joining.', code: 'NOT_HOST' });
  }

  const { data, error } = await supabase
    .from('event_apps')
    .update({ rsvp_join_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select('id, rsvp_join_enabled')
    .maybeSingle();

  if (error) {
    console.error('[event-rsvps/join-toggle]', error);
    return res.status(500).json({ error: 'Could not update RSVP joining.' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  return res.status(200).json({ ok: true, rsvp_join_enabled: data.rsvp_join_enabled !== false });
}
