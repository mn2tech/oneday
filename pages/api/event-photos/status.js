import { createClient } from '@supabase/supabase-js';
import { isS3Configured } from '../../../lib/s3';

/**
 * GET /api/event-photos/status
 * Safe diagnostics (no secrets). Use to verify production config.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const s3 = isS3Configured();

  let tableCheck = { ok: null, message: null };
  if (supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { error } = await supabase.from('event_photos').select('id').limit(1);
    if (error) {
      tableCheck = {
        ok: false,
        message: error.message || String(error),
        code: error.code,
      };
    } else {
      tableCheck = { ok: true, message: 'event_photos is reachable' };
    }
  } else if (supabaseUrl && !serviceRole && anon) {
    tableCheck = {
      ok: false,
      message:
        'SUPABASE_SERVICE_ROLE_KEY is not set — photo register will fail (anon key cannot insert past RLS).',
    };
  } else {
    tableCheck = { ok: false, message: 'Missing Supabase URL or keys' };
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    s3Configured: s3,
    supabaseUrlSet: supabaseUrl,
    serviceRoleKeySet: serviceRole,
    anonKeySet: anon,
    warning:
      !serviceRole && anon
        ? 'Add SUPABASE_SERVICE_ROLE_KEY to Vercel for event_photos inserts.'
        : null,
    eventPhotosTable: tableCheck,
  });
}
