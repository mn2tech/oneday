import assert from 'node:assert/strict';

const originalEnv = { ...process.env };

const {
  escapeHtml,
  hostEmailNotificationsEnabled,
  normalizeNotificationEmail,
  sendHostRsvpNotification,
} = await import('../lib/notifications.js');

function resetEnv(overrides = {}) {
  process.env = { ...originalEnv, ...overrides };
}

try {
  resetEnv({ HOST_EMAIL_NOTIFICATIONS: '' });
  assert.equal(hostEmailNotificationsEnabled(), true);

  resetEnv({ HOST_EMAIL_NOTIFICATIONS: 'off' });
  assert.equal(hostEmailNotificationsEnabled(), false);

  assert.equal(normalizeNotificationEmail(' Host@Example.COM '), 'host@example.com');
  assert.equal(normalizeNotificationEmail('not-an-email'), '');
  assert.equal(escapeHtml('<Guest & "Friend">'), '&lt;Guest &amp; &quot;Friend&quot;&gt;');

  resetEnv({ HOST_EMAIL_NOTIFICATIONS: 'false', RESEND_API_KEY: '' });
  assert.deepEqual(
    await sendHostRsvpNotification({
      event: { id: 'event-1', title: 'Party', email: 'host@example.com' },
      rsvp: { guest_name: 'Guest', adults: 2, kids: 1 },
    }),
    { status: 'skipped', reason: 'HOST_EMAIL_NOTIFICATIONS_DISABLED' }
  );

  resetEnv({ HOST_EMAIL_NOTIFICATIONS: 'true', RESEND_API_KEY: '' });
  assert.deepEqual(
    await sendHostRsvpNotification({
      event: { id: 'event-1', title: 'Party', email: '' },
      rsvp: { guest_name: 'Guest', adults: 2, kids: 1 },
    }),
    { status: 'skipped', reason: 'HOST_EMAIL_MISSING' }
  );

  assert.deepEqual(
    await sendHostRsvpNotification({
      event: { id: 'event-1', title: 'Party', email: 'host@example.com' },
      rsvp: { guest_name: 'Guest', adults: 2, kids: 1 },
    }),
    { status: 'skipped', reason: 'RESEND_NOT_CONFIGURED' }
  );

  let sendRequest;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sendRequest = {
      url: String(url),
      method: options?.method,
      body: JSON.parse(String(options?.body || '{}')),
    };
    return new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    resetEnv({
      HOST_EMAIL_NOTIFICATIONS: 'true',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM: 'OneDay <notifications@example.com>',
      NEXT_PUBLIC_APP_URL: 'https://example.com',
    });
    assert.deepEqual(
      await sendHostRsvpNotification({
        event: { id: 'event-1', title: 'Party', email: 'Host@Example.com' },
        rsvp: { guest_name: 'Guest & Friend', adults: 2, kids: 1 },
      }),
      { status: 'sent' }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sendRequest.url, 'https://api.resend.com/emails');
  assert.equal(sendRequest.method, 'POST');
  assert.equal(sendRequest.body.from, 'OneDay <notifications@example.com>');
  assert.equal(sendRequest.body.to, 'host@example.com');
  assert.equal(sendRequest.body.subject, 'New RSVP for Party');
  assert.match(sendRequest.body.html, /Guest &amp; Friend/);
  assert.match(sendRequest.body.html, /https:\/\/example\.com\/e\/event-1/);

  console.log('notification helper tests passed');
} finally {
  process.env = originalEnv;
}
