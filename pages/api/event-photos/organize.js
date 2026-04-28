import { createClient } from '@supabase/supabase-js';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';
import { canMutateGuestOrHost } from '../../../lib/eventAdminAuth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function isMissingSortOrder(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.code === '42703' || msg.includes('sort_order') || msg.includes('schema cache');
}

function validSectionIndex(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}

async function assertCanMutateRows(supabase, eventId, rows, deviceId, adminToken) {
  for (const row of rows) {
    const ok = await canMutateGuestOrHost(supabase, eventId, row.owner_device_id, deviceId, adminToken);
    if (!ok) return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, eventId, photoId, sectionIndex, targetSectionIndex, orderedPhotoIds, deviceId, adminToken } =
    req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const dev = normalizeDeviceId(deviceId);
  const admin = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (!dev && !admin) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  const supabase = getSupabase();

  if (action === 'move') {
    const target = validSectionIndex(targetSectionIndex);
    if (!photoId || target == null) {
      return res.status(400).json({ error: 'Missing photoId or invalid targetSectionIndex.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('event_photos')
      .select('id, owner_device_id')
      .eq('id', photoId)
      .eq('event_id', eventId)
      .maybeSingle();

    if (fetchErr || !row) {
      return res.status(404).json({ error: 'Photo not found.' });
    }

    if (!(await assertCanMutateRows(supabase, eventId, [row], dev, admin))) {
      return res.status(403).json({ error: 'Only the uploader or host can move this photo.', code: 'NOT_OWNER' });
    }

    let { error: updErr } = await supabase
      .from('event_photos')
      .update({ section_index: target, sort_order: Date.now() })
      .eq('id', photoId)
      .eq('event_id', eventId);

    if (updErr && isMissingSortOrder(updErr)) {
      ({ error: updErr } = await supabase
        .from('event_photos')
        .update({ section_index: target })
        .eq('id', photoId)
        .eq('event_id', eventId));
    }

    if (updErr) {
      console.error('[event-photos/organize] move', updErr);
      return res.status(500).json({ error: 'Could not move photo.' });
    }

    return res.status(200).json({ ok: true });
  }

  if (action === 'reorder') {
    const sec = validSectionIndex(sectionIndex);
    const ids = Array.isArray(orderedPhotoIds)
      ? orderedPhotoIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 500)
      : [];

    if (sec == null || ids.length < 2) {
      return res.status(400).json({ error: 'Invalid sectionIndex or orderedPhotoIds.' });
    }

    const uniqueIds = Array.from(new Set(ids));
    const { data: rows, error: fetchErr } = await supabase
      .from('event_photos')
      .select('id, owner_device_id')
      .eq('event_id', eventId)
      .eq('section_index', sec)
      .in('id', uniqueIds);

    if (fetchErr) {
      console.error('[event-photos/organize] reorder lookup', fetchErr);
      return res.status(500).json({ error: 'Could not load photos for reordering.' });
    }

    if ((rows || []).length !== uniqueIds.length) {
      return res.status(400).json({ error: 'Some photos are missing from this section.' });
    }

    if (!(await assertCanMutateRows(supabase, eventId, rows || [], dev, admin))) {
      return res.status(403).json({ error: 'Only the uploader or host can reorder these photos.', code: 'NOT_OWNER' });
    }

    const base = Date.now();
    for (let i = 0; i < uniqueIds.length; i += 1) {
      const { error: updErr } = await supabase
        .from('event_photos')
        .update({ sort_order: base - i })
        .eq('id', uniqueIds[i])
        .eq('event_id', eventId)
        .eq('section_index', sec);

      if (updErr) {
        if (isMissingSortOrder(updErr)) {
          return res.status(500).json({
            error: 'Photo reordering needs the event_photos.sort_order SQL migration from supabase-setup.sql.',
            code: 'SORT_ORDER_MISSING',
          });
        }
        console.error('[event-photos/organize] reorder update', updErr);
        return res.status(500).json({ error: 'Could not save photo order.' });
      }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Invalid action.' });
}
