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
    return res.status(503).json({
      error: 'Shared poll is not configured.',
      counts: [0, 0],
      myChoice: null,
    });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const voterId =
    typeof req.query.voterId === 'string' && req.query.voterId.length <= 128
      ? req.query.voterId
      : '';

  const supabase = getSupabase();

  const { data: rows, error } = await supabase
    .from('event_poll_votes')
    .select('choice,voter_id')
    .eq('event_id', eventId);

  if (error) {
    console.error('[event-poll/state]', error);
    const msg = String(error.message || error);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_poll_votes SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
        counts: [0, 0],
        myChoice: null,
      });
    }
    return res.status(500).json({ error: 'Database error.', counts: [0, 0], myChoice: null });
  }

  let c0 = 0;
  let c1 = 0;
  let myChoice = null;

  for (const r of rows || []) {
    if (r.choice === 0) c0 += 1;
    else if (r.choice === 1) c1 += 1;
    if (voterId && r.voter_id === voterId) myChoice = r.choice;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ counts: [c0, c1], myChoice });
}
