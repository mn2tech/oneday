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
    return res.status(503).json({ error: 'Shared poll is not configured.' });
  }

  const { eventId, voterId, choice } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  if (!voterId || typeof voterId !== 'string' || voterId.length < 8 || voterId.length > 128) {
    return res.status(400).json({ error: 'Invalid voterId.' });
  }

  const ch = Number(choice);
  if (ch !== 0 && ch !== 1) {
    return res.status(400).json({ error: 'choice must be 0 or 1.' });
  }

  const supabase = getSupabase();

  const { data: existing, error: selErr } = await supabase
    .from('event_poll_votes')
    .select('voter_id')
    .eq('event_id', eventId)
    .eq('voter_id', voterId)
    .maybeSingle();

  if (selErr) {
    console.error('[event-poll/vote] select', selErr);
    const msg = String(selErr.message || selErr);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_poll_votes SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
      });
    }
    return res.status(500).json({ error: 'Database error.' });
  }

  let writeErr;
  if (existing) {
    const { error } = await supabase
      .from('event_poll_votes')
      .update({ choice: ch })
      .eq('event_id', eventId)
      .eq('voter_id', voterId);
    writeErr = error;
  } else {
    const { error } = await supabase.from('event_poll_votes').insert({
      event_id: eventId,
      voter_id: voterId,
      choice: ch,
    });
    writeErr = error;
  }

  if (writeErr) {
    console.error('[event-poll/vote] write', writeErr);
    const msg = String(writeErr.message || writeErr);
    if (writeErr.code === '23503' || msg.includes('foreign key')) {
      return res.status(400).json({ error: 'Event not found.', code: 'EVENT_FK' });
    }
    return res.status(500).json({ error: 'Could not record vote.' });
  }

  const { data: rows } = await supabase
    .from('event_poll_votes')
    .select('choice')
    .eq('event_id', eventId);

  let c0 = 0;
  let c1 = 0;
  for (const r of rows || []) {
    if (r.choice === 0) c0 += 1;
    else if (r.choice === 1) c1 += 1;
  }

  return res.status(200).json({ counts: [c0, c1], myChoice: ch });
}
