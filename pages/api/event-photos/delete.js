import { createClient } from '@supabase/supabase-js';
import { deleteObject, isS3Configured } from '../../../lib/s3';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';
import { canMutateGuestOrHost } from '../../../lib/eventAdminAuth';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isS3Configured()) {
    return res.status(503).json({ error: 'Shared photo storage is not configured.' });
  }

  const photoId = req.method === 'POST' ? req.body?.photoId : req.query.photoId;
  const eventId = req.method === 'POST' ? req.body?.eventId : req.query.eventId;
  const rawDevice = req.method === 'POST' ? req.body?.deviceId : req.query.deviceId;
  const rawAdmin =
    req.method === 'POST'
      ? req.body?.adminToken
      : typeof req.query.adminToken === 'string'
        ? req.query.adminToken
        : '';

  if (!photoId || !eventId) {
    return res.status(400).json({ error: 'Missing photoId or eventId.' });
  }

  const dev = normalizeDeviceId(rawDevice);
  const adminToken = typeof rawAdmin === 'string' ? rawAdmin.trim() : '';
  if (!dev && !adminToken) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  const supabase = getSupabase();
  const { data: row, error: fetchErr } = await supabase
    .from('event_photos')
    .select('id, s3_key, event_id, owner_device_id')
    .eq('id', photoId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (fetchErr || !row) {
    return res.status(404).json({ error: 'Photo not found.' });
  }

  if (!(await canMutateGuestOrHost(supabase, eventId, row.owner_device_id, dev, adminToken))) {
    return res.status(403).json({ error: 'Only the uploader or host can remove this photo.', code: 'NOT_OWNER' });
  }

  try {
    await deleteObject(row.s3_key);
  } catch (e) {
    console.error('[event-photos/delete] S3', e);
    return res.status(500).json({ error: 'Could not delete file from storage.' });
  }

  const { error: delErr } = await supabase.from('event_photos').delete().eq('id', photoId);

  if (delErr) {
    console.error('[event-photos/delete] DB', delErr);
    return res.status(500).json({ error: 'Could not delete photo record.' });
  }

  return res.status(200).json({ ok: true });
}
