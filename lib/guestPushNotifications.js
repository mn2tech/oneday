import webpush from 'web-push';

let vapidConfigured = false;

function requiredEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function guestPushEnabled() {
  return Boolean(
    requiredEnv('WEB_PUSH_VAPID_PUBLIC_KEY') &&
      requiredEnv('WEB_PUSH_VAPID_PRIVATE_KEY') &&
      requiredEnv('WEB_PUSH_SUBJECT')
  );
}

function ensureVapid() {
  if (!guestPushEnabled()) {
    throw new Error('WEB_PUSH_NOT_CONFIGURED');
  }
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    requiredEnv('WEB_PUSH_SUBJECT'),
    requiredEnv('WEB_PUSH_VAPID_PUBLIC_KEY'),
    requiredEnv('WEB_PUSH_VAPID_PRIVATE_KEY')
  );
  vapidConfigured = true;
}

export function publicVapidKey() {
  return requiredEnv('WEB_PUSH_VAPID_PUBLIC_KEY');
}

function parseSubscriptionRow(row) {
  const keys = row?.keys && typeof row.keys === 'object' ? row.keys : {};
  const endpoint = typeof row?.endpoint === 'string' ? row.endpoint.trim() : '';
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

export async function sendGuestPush({ subscriptions, title, body, url }) {
  ensureVapid();
  const payload = JSON.stringify({
    title: String(title || 'OneDay update').slice(0, 120),
    body: String(body || '').slice(0, 240),
    url: String(url || '/'),
    tag: 'oneday-event-update',
  });

  const results = { sent: 0, failed: 0, invalidEndpoints: [] };
  const items = Array.isArray(subscriptions) ? subscriptions : [];
  for (const row of items) {
    const sub = parseSubscriptionRow(row);
    if (!sub) continue;
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60 * 60 });
      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      const status = Number(err?.statusCode || err?.status || 0);
      if (status === 404 || status === 410) {
        results.invalidEndpoints.push(sub.endpoint);
      }
    }
  }
  return results;
}
