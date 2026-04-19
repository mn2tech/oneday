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
const MAX_PER_EVENT = 500;

function legacyRsvpId() {
  return `rsvp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isParentIdFkViolation(err) {
  if (!err || String(err.code) !== '23503') return false;
  const s = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`;
  return /parent_id/i.test(s);
}

/** Legacy tables only have id, event_id, parent_id, attendees_count, notes, created_at */
function shouldTryLegacyInsertOnly(insErr) {
  if (!insErr) return false;
  const msg = String(insErr.message || insErr.details || '');
  if (insErr.code === '42703') return true;
  if (insErr.code === 'PGRST204') return true;
  if (/column .* does not exist|Could not find the .* column/i.test(msg)) return true;
  if (insErr.code === '23502' && /parent_id|attendees_count|^id$/i.test(msg)) return true;
  return false;
}

function normalizeRsvpRow(row) {
  if (!row) return row;
  if (row.guest_name != null && row.adults != null) {
    return {
      id: row.id,
      guest_name: row.guest_name,
      adults: row.adults,
      kids: row.kids ?? 0,
      created_at: row.created_at,
    };
  }
  const total = Number(row.attendees_count);
  const adults = Number.isFinite(total) && total >= 1 ? total : 1;
  return {
    id: row.id,
    guest_name: row.notes && String(row.notes).trim() ? String(row.notes).trim().slice(0, MAX_NAME) : 'Guest',
    adults,
    kids: 0,
    created_at: row.created_at,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared RSVPs are not configured.' });
  }

  const { eventId, guestName, adults, kids } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
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

  const modernInsert = {
    event_id: eventId,
    guest_name: name,
    adults: ad,
    kids: kd,
  };

  let { data: inserted, error: insErr } = await supabase
    .from('event_rsvps')
    .insert(modernInsert)
    .select('id, guest_name, adults, kids, created_at')
    .single();

  if (insErr && shouldTryLegacyInsertOnly(insErr)) {
    const baseLegacy = {
      event_id: eventId,
      attendees_count: ad + kd,
      notes: name,
    };
    const legacyVariants = [
      { ...baseLegacy, parent_id: 'guest' },
      { ...baseLegacy, parent_id: null },
      { ...baseLegacy },
    ];
    let retry = { data: null, error: null };
    for (const body of legacyVariants) {
      const payload = { id: legacyRsvpId(), ...body };
      if (!Object.prototype.hasOwnProperty.call(body, 'parent_id')) {
        delete payload.parent_id;
      }
      retry = await supabase
        .from('event_rsvps')
        .insert(payload)
        .select('id, event_id, parent_id, attendees_count, notes, created_at')
        .single();
      if (!retry.error) break;
      if (!isParentIdFkViolation(retry.error)) break;
    }
    inserted = retry.data;
    insErr = retry.error;
  }

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
      if (isParentIdFkViolation(insErr)) {
        return res.status(500).json({ error: 'Could not save RSVP.', code: 'RSVP_PARENT_FK' });
      }
      return res.status(400).json({ error: 'Event not found.', code: 'EVENT_FK' });
    }
    return res.status(500).json({ error: 'Could not save RSVP.' });
  }

  return res.status(200).json({ rsvp: normalizeRsvpRow(inserted) });
}
