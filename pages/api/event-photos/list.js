import { createClient } from '@supabase/supabase-js';
import { objectPublicUrl, presignedGet, isS3Configured } from '../../../lib/s3';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
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

  const sectionIndex = req.query.sectionIndex;
  const supabase = getSupabase();

  let q = supabase
    .from('event_photos')
    .select('id, s3_key, section_index, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (sectionIndex !== undefined && sectionIndex !== '') {
    const sec = Number(sectionIndex);
    if (!Number.isInteger(sec) || sec < 0) {
      return res.status(400).json({ error: 'Invalid sectionIndex.' });
    }
    q = q.eq('section_index', sec);
  }

  const { data: rows, error } = await q;

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
    });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ photos });
}
