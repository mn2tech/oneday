import { nanoid } from 'nanoid';
import { createClient } from '@supabase/supabase-js';
import { presignedPut, isS3Configured } from '../../../lib/s3';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function extForMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isS3Configured()) {
    return res.status(503).json({ error: 'Shared photo storage is not configured.' });
  }

  const { eventId, sectionIndex, contentType } = req.body || {};

  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const sec = Number(sectionIndex);
  if (!Number.isInteger(sec) || sec < 0 || sec > 10) {
    return res.status(400).json({ error: 'Invalid sectionIndex.' });
  }

  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed.' });
  }

  const supabase = getSupabase();
  const { data: ev, error: evErr } = await supabase
    .from('event_apps')
    .select('id')
    .eq('id', eventId)
    .maybeSingle();

  if (evErr || !ev) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const ext = extForMime(contentType);
  const key = `events/${eventId}/${sec}/${nanoid(12)}.${ext}`;

  try {
    const uploadUrl = await presignedPut(key, contentType, 3600);
    return res.status(200).json({
      uploadUrl,
      key,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (e) {
    console.error('[event-photos/presign]', e);
    return res.status(500).json({ error: 'Could not create upload URL.' });
  }
}
