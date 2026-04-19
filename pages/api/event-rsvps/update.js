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

const MAX_NAME = 120;

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared RSVPs are not configured.' });
  }

  const { id, guestName, adults, kids } = req.body || {};
  const rawEventId = req.body && req.body.eventId;
  const eventId =
    typeof rawEventId === 'string' ? rawEventId.trim() : '';

  if (!eventId || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }
  if (!id || typeof id !== 'string' || id.length > 80) {
    return res.status(400).json({ error: 'Invalid RSVP id.' });
  }

  let name = typeof guestName === 'string' ? guestName.trim() : '';
  if (!name) name = 'Guest';
  if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);

  const ad = Number(adults);
  const kd = Number(kids);
  if (!Number.isInteger(ad) || ad < 1 || ad > 100) {
    return res.status(400).json({ error: 'Adults must be an integer from 1 to 100.' });
  }
  if (!Number.isInteger(kd) || kd < 0 || kd > 100) {
    return res.status(400).json({ error: 'Kids must be an integer from 0 to 100.' });
  }

  const supabase = getSupabase();

  const { data: eventRow, error: eventLookupErr } = await supabase
    .from('event_apps')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();

  if (eventLookupErr) {
    console.error('[event-rsvps/update] event lookup', eventLookupErr);
    return res.status(500).json({ error: 'Database error.' });
  }
  if (!eventRow) {
    return res.status(400).json({ error: 'Event not found.', code: 'NO_EVENT' });
  }

  const payload = {
    guest_name: name,
    adults: ad,
    kids: kd,
  };

  const { data: updated, error: updErr } = await supabase
    .from('event_rsvps')
    .update(payload)
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id, guest_name, adults, kids, created_at')
    .maybeSingle();

  if (updErr) {
    console.error('[event-rsvps/update] update', updErr);
    return res.status(500).json({ error: 'Could not update RSVP.' });
  }
  if (!updated) {
    return res.status(404).json({ error: 'RSVP not found.' });
  }

  return res.status(200).json({ rsvp: updated });
}
