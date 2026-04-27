import { createClient } from '@supabase/supabase-js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, bucketName, isS3Configured } from '../../../lib/s3';

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
    return res.status(503).json({ error: 'Shared photo storage is not configured.' });
  }

  const photoId = typeof req.query.photoId === 'string' ? req.query.photoId.trim() : '';
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : '';

  if (!photoId || !eventId || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid photoId or eventId.' });
  }

  const supabase = getSupabase();
  const { data: row, error: fetchErr } = await supabase
    .from('event_photos')
    .select('s3_key, content_type, event_id')
    .eq('id', photoId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (fetchErr || !row) {
    return res.status(404).json({ error: 'Photo not found.' });
  }

  const s3 = getS3Client();
  let out;
  try {
    out = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName(),
        Key: row.s3_key,
      })
    );
  } catch (e) {
    console.error('[event-photos/download] S3', e);
    return res.status(500).json({ error: 'Could not read file from storage.' });
  }

  const body = out.Body;
  if (!body) {
    return res.status(500).json({ error: 'Empty file.' });
  }

  const ct = row.content_type || out.ContentType || 'application/octet-stream';
  const basename = (row.s3_key && row.s3_key.split('/').pop()) || 'photo.jpg';
  const safe = String(basename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo.jpg';

  res.setHeader('Content-Type', ct);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.setHeader('Cache-Control', 'private, max-age=60');

  if (typeof body.pipe === 'function') {
    body.on('error', (e) => {
      console.error('[event-photos/download] stream', e);
      if (!res.headersSent) res.status(500).end();
    });
    body.pipe(res);
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    res.end(Buffer.concat(chunks));
  } catch (e) {
    console.error('[event-photos/download] buffer', e);
    if (!res.headersSent) return res.status(500).json({ error: 'Download failed.' });
  }
}
