import { createClient } from '@supabase/supabase-js';
import { objectPublicUrl, presignedGet, isS3Configured } from '../../../lib/s3';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const MAX_PER_SECTION = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isS3Configured()) {
    return res.status(503).json({ error: 'Shared photo storage is not configured.' });
  }

  const { eventId, sectionIndex, key, byteSize, contentType } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const sec = Number(sectionIndex);
  if (!Number.isInteger(sec) || sec < 0 || sec > 10) {
    return res.status(400).json({ error: 'Invalid sectionIndex.' });
  }

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key.' });
  }

  const prefix = `events/${eventId}/${sec}/`;
  if (!key.startsWith(prefix) || key.includes('..')) {
    return res.status(400).json({ error: 'Invalid key.' });
  }

  const size = Number(byteSize);
  if (!Number.isFinite(size) || size < 1 || size > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid file size (max 10MB).' });
  }

  const supabase = getSupabase();

  const { count, error: countErr } = await supabase
    .from('event_photos')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('section_index', sec);

  if (countErr) {
    console.error('[event-photos/register] count', countErr);
    return res.status(500).json({ error: 'Database error.' });
  }

  if ((count ?? 0) >= MAX_PER_SECTION) {
    return res.status(400).json({ error: `Maximum ${MAX_PER_SECTION} photos per section.` });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('event_photos')
    .insert({
      event_id: eventId,
      section_index: sec,
      s3_key: key,
      content_type: contentType || 'image/jpeg',
      byte_size: Math.round(size),
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('[event-photos/register] insert', insErr);
    return res.status(500).json({ error: 'Failed to save photo metadata.' });
  }

  let url = objectPublicUrl(key);
  if (!url) {
    try {
      url = await presignedGet(key, 3600);
    } catch (e) {
      console.error('[event-photos/register] presignedGet', e);
      return res.status(500).json({ error: 'Could not build image URL.' });
    }
  }

  return res.status(200).json({
    id: inserted.id,
    url,
    key,
  });
}
