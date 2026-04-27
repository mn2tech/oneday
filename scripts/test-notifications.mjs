import assert from 'node:assert/strict';

const originalEnv = { ...process.env };

const {
  escapeHtml,
  hostEmailNotificationsEnabled,
  normalizeNotificationEmail,
  sendHostMessageNotification,
  sendHostPhotoNotification,
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

  const sendRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sendRequests.push({
      url: String(url),
      method: options?.method,
      body: JSON.parse(String(options?.body || '{}')),
    });
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
    assert.deepEqual(
      await sendHostMessageNotification({
        event: { id: 'event-1', title: 'Party', email: 'Host@Example.com' },
        message: { author_name: 'Friend <One>', body: 'Congrats & cheers!' },
      }),
      { status: 'sent' }
    );
    assert.deepEqual(
      await sendHostPhotoNotification({
        event: { id: 'event-1', title: 'Party', email: 'Host@Example.com' },
        photo: {
          section_index: 1,
          content_type: 'image/png',
          byte_size: 1536000,
          url: 'https://cdn.example.com/photo.png?x=1&y=2',
        },
      }),
      { status: 'sent' }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sendRequests.length, 3);
  for (const request of sendRequests) {
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.method, 'POST');
    assert.equal(request.body.from, 'OneDay <notifications@example.com>');
    assert.equal(request.body.to, 'host@example.com');
    assert.match(request.body.html, /https:\/\/example\.com\/e\/event-1/);
  }

  assert.equal(sendRequests[0].body.subject, 'New RSVP for Party');
  assert.match(sendRequests[0].body.html, /Guest &amp; Friend/);

  assert.equal(sendRequests[1].body.subject, 'New message for Party');
  assert.match(sendRequests[1].body.html, /Friend &lt;One&gt;/);
  assert.match(sendRequests[1].body.html, /Congrats &amp; cheers!/);

  assert.equal(sendRequests[2].body.subject, 'New photo for Party');
  assert.match(sendRequests[2].body.html, /Photo wall section 2/);
  assert.match(sendRequests[2].body.html, /image\/png/);
  assert.match(sendRequests[2].body.html, /1.5 MB/);
  assert.match(sendRequests[2].body.html, /https:\/\/cdn\.example\.com\/photo\.png\?x=1&amp;y=2/);

  console.log('notification helper tests passed');
} finally {
  process.env = originalEnv;
}
