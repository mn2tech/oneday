import { createClient } from '@supabase/supabase-js';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';
import { canMutateGuestOrHost } from '../../../lib/eventAdminAuth';

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
    return res.status(503).json({ error: 'Shared RSVPs are not configured.' });
  }

  const { eventId, id, deviceId, adminToken } = req.body || {};

  const dev = normalizeDeviceId(deviceId);
  const rawAdmin = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (!dev && !rawAdmin) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid RSVP id.' });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from('event_rsvps')
    .select('id, owner_device_id')
    .eq('id', id)
    .eq('event_id', eventId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[event-rsvps/delete] fetch', fetchErr);
    return res.status(500).json({ error: 'Database error.' });
  }
  if (!existing) {
    return res.status(404).json({ error: 'RSVP not found.' });
  }
  if (!(await canMutateGuestOrHost(supabase, eventId, existing.owner_device_id, dev, rawAdmin))) {
    return res.status(403).json({ error: 'Only the guest or host can remove this RSVP.', code: 'NOT_OWNER' });
  }

  const { data: deleted, error } = await supabase
    .from('event_rsvps')
    .delete()
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id');

  if (error) {
    console.error('[event-rsvps/delete]', error);
    return res.status(500).json({ error: 'Could not delete RSVP.' });
  }

  if (!deleted || !deleted.length) {
    return res.status(404).json({ error: 'RSVP not found.' });
  }

  return res.status(200).json({ ok: true });
}
