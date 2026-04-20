import { createClient } from '@supabase/supabase-js';
import { isOwnerRow, normalizeDeviceId } from '../../../lib/deviceOwnership';
import { isEventHost } from '../../../lib/eventAdminAuth';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Shared messages are not configured.', messages: [] });
  }

  const eventId = req.query.eventId;
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const viewerDevice = normalizeDeviceId(req.query.deviceId);
  const hostToken = typeof req.query.hostToken === 'string' ? req.query.hostToken.trim() : '';

  const supabase = getSupabase();

  const isHost = await isEventHost(supabase, eventId, {
    deviceId: viewerDevice,
    adminToken: hostToken,
  });

  const { data: rows, error } = await supabase
    .from('event_messages')
    .select('id, author_name, body, created_at, updated_at, owner_device_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-messages/list]', error);
    const msg = String(error.message || error);
    if (msg.includes('does not exist') || msg.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database table missing. Run event_messages SQL in Supabase (see supabase-setup.sql).',
        code: 'TABLE_MISSING',
        messages: [],
      });
    }
    return res.status(500).json({ error: 'Database error.', messages: [] });
  }

  const messages = (rows || []).map((r) => ({
    id: r.id,
    author_name: r.author_name,
    body: r.body,
    created_at: r.created_at,
    updated_at: r.updated_at,
    owned_by_me: isOwnerRow(r.owner_device_id, viewerDevice) || isHost,
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ messages, is_host: isHost });
}
