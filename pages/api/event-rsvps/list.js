import { createClient } from '@supabase/supabase-js';
import { isOwnerRow, normalizeDeviceId } from '../../../lib/deviceOwnership';
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({
      error: 'Shared RSVPs are not configured.',
      rsvps: [],
      totalAdults: 0,
      totalKids: 0,
    });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const viewerDevice = normalizeDeviceId(req.query.deviceId);
  const hostToken = typeof req.query.hostToken === 'string' ? req.query.hostToken.trim() : '';

  const supabase = getSupabase();

  const isHost = await isEventHost(supabase, eventId, {
    deviceId: viewerDevice,
    adminToken: hostToken,
  });

  const { data: eventRow, error: eventErr } = await supabase
    .from('event_apps')
    .select('guest_list_hidden, rsvp_join_enabled')
    .eq('id', eventId)
    .maybeSingle();
  let guestListHidden = false;
  let rsvpJoinEnabled = true;
  if (eventErr) {
    const msg = String(eventErr.message || eventErr);
    if (
      (msg.includes('guest_list_hidden') || msg.includes('rsvp_join_enabled')) &&
      msg.includes('column')
    ) {
      guestListHidden = false;
      rsvpJoinEnabled = true;
    } else {
    console.error('[event-rsvps/list] event', eventErr);
    return res.status(500).json({ error: 'Database error.', rsvps: [] });
    }
  }
  if (eventRow) guestListHidden = Boolean(eventRow.guest_list_hidden);
  if (eventRow && Object.prototype.hasOwnProperty.call(eventRow, 'rsvp_join_enabled')) {
    rsvpJoinEnabled = eventRow.rsvp_join_enabled !== false;
  }

  const { data: rows, error } = await supabase
    .from('event_rsvps')
    .select('id, guest_name, adults, kids, created_at, owner_device_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-rsvps/list]', error);
    const msg = String(error.message || error);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_rsvps SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
        rsvps: [],
      });
    }
    return res.status(500).json({ error: 'Database error.', rsvps: [] });
  }

  const rsvps = (rows || []).map((r) => ({
    id: r.id,
    guest_name: r.guest_name,
    adults: r.adults,
    kids: r.kids,
    created_at: r.created_at,
    owned_by_me: isOwnerRow(r.owner_device_id, viewerDevice),
  }));
  let totalAdults = 0;
  let totalKids = 0;
  for (const r of rsvps) {
    totalAdults += Number(r.adults) || 0;
    totalKids += Number(r.kids) || 0;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    rsvps,
    totalAdults,
    totalKids,
    is_host: isHost,
    guest_list_hidden: guestListHidden,
    rsvp_join_enabled: rsvpJoinEnabled,
  });
}
