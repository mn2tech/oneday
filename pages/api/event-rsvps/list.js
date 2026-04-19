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

function normalizeRow(r) {
  if (!r) return r;
  if (r.guest_name != null && r.adults != null) {
    return {
      id: r.id,
      guest_name: r.guest_name,
      adults: r.adults,
      kids: r.kids ?? 0,
      created_at: r.created_at,
    };
  }
  const total = Number(r.attendees_count);
  const adults = Number.isFinite(total) && total >= 1 ? total : 1;
  return {
    id: r.id,
    guest_name: r.notes && String(r.notes).trim() ? String(r.notes).trim() : 'Guest',
    adults,
    kids: 0,
    created_at: r.created_at,
  };
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

  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from('event_rsvps')
    .select('*')
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

  const rsvps = (rows || []).map(normalizeRow);
  let totalAdults = 0;
  let totalKids = 0;
  for (const r of rsvps) {
    totalAdults += Number(r.adults) || 0;
    totalKids += Number(r.kids) || 0;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ rsvps, totalAdults, totalKids });
}
