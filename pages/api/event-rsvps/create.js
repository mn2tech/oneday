import { createClient } from '@supabase/supabase-js';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';

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
const MAX_PER_EVENT = 500;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared RSVPs are not configured.' });
  }

  const { guestName, adults, kids, deviceId } = req.body || {};

  const dev = normalizeDeviceId(deviceId);
  if (!dev) {
    return res.status(400).json({ error: 'Missing or invalid deviceId (16–128 hex chars).' });
  }

  const rawEventId = req.body && req.body.eventId;
  const eventId =
    typeof rawEventId === 'string' ? rawEventId.trim() : '';

  if (!eventId || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
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
    console.error('[event-rsvps/create] event lookup', eventLookupErr);
    return res.status(500).json({ error: 'Database error.' });
  }
  if (!eventRow) {
    return res.status(400).json({ error: 'Event not found.', code: 'NO_EVENT' });
  }

  const { count, error: countErr } = await supabase
    .from('event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (countErr) {
    console.error('[event-rsvps/create] count', countErr);
    return res.status(500).json({ error: 'Database error.' });
  }

  if ((count ?? 0) >= MAX_PER_EVENT) {
    return res.status(400).json({ error: 'RSVP limit reached for this event.' });
  }

  const { data: existingMine, error: mineErr } = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', eventId)
    .eq('owner_device_id', dev)
    .maybeSingle();

  if (mineErr) {
    console.error('[event-rsvps/create] existing device', mineErr);
    return res.status(500).json({ error: 'Database error.' });
  }
  if (existingMine) {
    return res.status(400).json({
      error: 'This device already submitted an RSVP. Use Update to change it.',
      code: 'RSVP_EXISTS',
      existingId: existingMine.id,
    });
  }

  const payload = {
    event_id: eventId,
    guest_name: name,
    adults: ad,
    kids: kd,
    owner_device_id: dev,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('event_rsvps')
    .insert(payload)
    .select('id, guest_name, adults, kids, created_at')
    .single();

  if (insErr) {
    console.error('[event-rsvps/create] insert', insErr);
    const msg = String(insErr.message || insErr);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_rsvps SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
      });
    }
    if (insErr.code === '23503' || msg.includes('foreign key')) {
      return res.status(500).json({
        error:
          'Could not save RSVP. Run the RSVP normalization migration (event_rsvps -> canonical schema).',
        code: 'RSVP_SCHEMA',
      });
    }
    return res.status(500).json({ error: 'Could not save RSVP.' });
  }

  return res.status(200).json({ rsvp: inserted });
}
