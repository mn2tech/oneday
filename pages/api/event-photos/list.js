import { createClient } from '@supabase/supabase-js';
import { objectPublicUrl, presignedGet, isS3Configured } from '../../../lib/s3';
import { isOwnerRow, normalizeDeviceId } from '../../../lib/deviceOwnership';
import { isEventHost } from '../../../lib/eventAdminAuth';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isS3Configured()) {
    return res.status(503).json({ error: 'Shared photo storage is not configured.', photos: [] });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const viewerDevice = normalizeDeviceId(req.query.deviceId);
  const hostToken = typeof req.query.hostToken === 'string' ? req.query.hostToken.trim() : '';

  const sectionIndex = req.query.sectionIndex;
  const supabase = getSupabase();

  const isHost = await isEventHost(supabase, eventId, {
    deviceId: viewerDevice,
    adminToken: hostToken,
  });

  const buildQuery = (withSortOrder) => {
    let q = supabase
      .from('event_photos')
      .select(withSortOrder ? 'id, s3_key, section_index, sort_order, created_at, owner_device_id' : 'id, s3_key, section_index, created_at, owner_device_id')
      .eq('event_id', eventId);

    if (withSortOrder) {
      q = q.order('sort_order', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    } else {
      q = q.order('created_at', { ascending: false });
    }

    if (sectionIndex !== undefined && sectionIndex !== '') {
      const sec = Number(sectionIndex);
      if (!Number.isInteger(sec) || sec < 0) {
        return { error: { status: 400, payload: { error: 'Invalid sectionIndex.' } } };
      }
      q = q.eq('section_index', sec);
    }

    return { query: q };
  };

  let built = buildQuery(true);
  if (built.error) {
    return res.status(built.error.status).json(built.error.payload);
  }

  let { data: rows, error } = await built.query;
  if (error && isMissingSortOrder(error)) {
    built = buildQuery(false);
    ({ data: rows, error } = await built.query);
  }

  if (error) {
    console.error('[event-photos/list]', error);
    return res.status(500).json({ error: 'Database error.' });
  }

  const photos = [];
  for (const row of rows || []) {
    let url = objectPublicUrl(row.s3_key);
    if (!url) {
      try {
        url = await presignedGet(row.s3_key, 3600);
      } catch (e) {
        console.error('[event-photos/list] presign', row.s3_key, e);
        continue;
      }
    }
    photos.push({
      id: row.id,
      url,
      section_index: row.section_index,
      owned_by_me: isOwnerRow(row.owner_device_id, viewerDevice) || isHost,
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ photos, is_host: isHost });
}
