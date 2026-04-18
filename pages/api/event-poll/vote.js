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

function aggregateCounts(rows, n) {
  const counts = emptyCounts(n);
  for (const r of rows || []) {
    const c = Number(r.choice);
    if (Number.isInteger(c) && c >= 0 && c < n) {
      counts[c] += 1;
    }
  }
  return counts;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared poll is not configured.' });
  }

  const { eventId, voterId, choice, optionCount: optionCountRaw } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  if (!voterId || typeof voterId !== 'string' || voterId.length < 8 || voterId.length > 128) {
    return res.status(400).json({ error: 'Invalid voterId.' });
  }

  const optionCount = parseOptionCount(optionCountRaw);

  const ch = Number(choice);
  if (!Number.isInteger(ch) || ch < 0 || ch >= optionCount) {
    return res.status(400).json({ error: `choice must be an integer from 0 to ${optionCount - 1}.` });
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
    if (writeErr.code === '23514' || msg.includes('check constraint')) {
      return res.status(400).json({
        error:
          'Database still limits poll to 2 choices. Run supabase-migration-poll-extend.sql in Supabase SQL editor.',
        code: 'POLL_SCHEMA',
      });
    }
    if (writeErr.code === '23503' || msg.includes('foreign key')) {
      return res.status(400).json({ error: 'Event not found.', code: 'EVENT_FK' });
    }
    return res.status(500).json({ error: 'Could not record vote.' });
  }

  const { data: rows } = await supabase.from('event_poll_votes').select('choice').eq('event_id', eventId);

  const counts = aggregateCounts(rows, optionCount);

  return res.status(200).json({ counts, myChoice: ch, optionCount });
}
