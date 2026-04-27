import { createClient } from '@supabase/supabase-js';
import { guestPushEnabled, publicVapidKey } from '../../../lib/guestPushNotifications';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function parseSubscription(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '';
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : {};
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      enabled: guestPushEnabled(),
      vapidPublicKey: publicVapidKey() || null,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!guestPushEnabled()) {
    return res.status(503).json({ error: 'Guest push notifications are not configured.' });
  }

  const eventId = typeof req.body?.eventId === 'string' ? req.body.eventId.trim() : '';
  if (!eventId || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const deviceId = normalizeDeviceId(req.body?.deviceId);
  if (!deviceId) {
    return res.status(400).json({ error: 'Missing or invalid deviceId.' });
  }

  const subscription = parseSubscription(req.body?.subscription);
  if (!subscription) {
    return res.status(400).json({ error: 'Invalid push subscription payload.' });
  }

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  const payload = {
    event_id: eventId,
    device_id: deviceId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    is_active: true,
    user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 240) : null,
    last_seen_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from('event_guest_push_subscriptions')
    .upsert(payload, { onConflict: 'event_id,endpoint' });

  if (error) {
    console.error('[guest-notifications/subscribe] upsert', error);
    return res.status(500).json({
      error: 'Could not save push subscription.',
      code: error.code || null,
      details: String(error.message || error).slice(0, 240),
    });
  }

  return res.status(200).json({ ok: true });
}
