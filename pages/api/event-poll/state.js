import { createClient } from '@supabase/supabase-js';
import { MIN_POLL_OPTIONS, MAX_POLL_OPTIONS } from '../../../lib/pollLimits';

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

function parseOptionCount(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return MIN_POLL_OPTIONS;
  return Math.min(MAX_POLL_OPTIONS, Math.max(MIN_POLL_OPTIONS, n));
}

function emptyCounts(n) {
  return Array.from({ length: n }, () => 0);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const fallback = emptyCounts(MIN_POLL_OPTIONS);

  if (!cloudConfigured()) {
    return res.status(503).json({
      error: 'Shared poll is not configured.',
      counts: fallback,
      myChoice: null,
    });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const optionCount = parseOptionCount(req.query.optionCount);

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
        counts: emptyCounts(optionCount),
        myChoice: null,
      });
    }
    return res.status(500).json({ error: 'Database error.', counts: emptyCounts(optionCount), myChoice: null });
  }

  const counts = emptyCounts(optionCount);
  let myChoice = null;

  for (const r of rows || []) {
    const c = Number(r.choice);
    if (Number.isInteger(c) && c >= 0 && c < optionCount) {
      counts[c] += 1;
    }
    if (voterId && r.voter_id === voterId) {
      myChoice = Number.isInteger(c) && c >= 0 && c < optionCount ? c : null;
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ counts, myChoice, optionCount });
}
