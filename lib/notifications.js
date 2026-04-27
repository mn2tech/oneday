const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const RESEND_EMAIL_API = 'https://api.resend.com/emails';

export function notificationFromAddress() {
  return process.env.RESEND_FROM || 'OneDay <noreply@getoneday.com>';
}

export function hostEmailNotificationsEnabled() {
  const raw = process.env.HOST_EMAIL_NOTIFICATIONS;
  if (raw == null || raw === '') return true;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

export function normalizeNotificationEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return '';
  return email;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function eventUrl(eventId) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (!baseUrl || !eventId) return '';
  return `${baseUrl}/e/${encodeURIComponent(eventId)}`;
}

export async function sendHostRsvpNotification({ event, rsvp }) {
  if (!hostEmailNotificationsEnabled()) {
    return { status: 'skipped', reason: 'HOST_EMAIL_NOTIFICATIONS_DISABLED' };
  }

  const to = normalizeNotificationEmail(event?.email);
  if (!to) {
    return { status: 'skipped', reason: 'HOST_EMAIL_MISSING' };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[notifications] Host RSVP email skipped: set RESEND_API_KEY.');
    return { status: 'skipped', reason: 'RESEND_NOT_CONFIGURED' };
  }

  const eventTitle = String(event?.title || 'your event').trim().slice(0, 200) || 'your event';
  const guestName = String(rsvp?.guest_name || 'Guest').trim().slice(0, 120) || 'Guest';
  const adults = Number.isFinite(Number(rsvp?.adults)) ? Number(rsvp.adults) : 0;
  const kids = Number.isFinite(Number(rsvp?.kids)) ? Number(rsvp.kids) : 0;
  const total = adults + kids;
  const link = eventUrl(event?.id);
  const linkBlock = link
    ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:600;margin:16px 0 12px;">Open event page</a>
       <p style="background:#1a1a2e;padding:12px 16px;border-radius:6px;font-size:0.88rem;word-break:break-all;color:#c084fc;margin:0;">${escapeHtml(link)}</p>`
    : '';

  try {
    const response = await fetch(RESEND_EMAIL_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: notificationFromAddress(),
        to,
        subject: `New RSVP for ${eventTitle}`,
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f5;border-radius:12px;">
            <div style="margin-bottom:20px;"><span style="font-size:1.35rem;font-weight:700;">◆ OneDay</span></div>
            <h1 style="font-size:1.45rem;margin:0 0 12px;">New RSVP received</h1>
            <p style="color:#aaa;margin:0 0 20px;line-height:1.5;">${escapeHtml(guestName)} just RSVP'd to ${escapeHtml(eventTitle)}.</p>
            <div style="background:#151525;border:1px solid #2a2a45;border-radius:10px;padding:16px;margin-bottom:18px;">
              <p style="margin:0 0 8px;"><strong>Guest:</strong> ${escapeHtml(guestName)}</p>
              <p style="margin:0 0 8px;"><strong>Adults:</strong> ${escapeHtml(adults)}</p>
              <p style="margin:0 0 8px;"><strong>Kids:</strong> ${escapeHtml(kids)}</p>
              <p style="margin:0;"><strong>Total guests:</strong> ${escapeHtml(total)}</p>
            </div>
            ${linkBlock}
            <p style="color:#666;font-size:0.8rem;margin-top:24px;">You are receiving this because this email is set as the host email for this OneDay event.</p>
          </div>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`RESEND_SEND_FAILED ${response.status}${body ? ` ${body}` : ''}`);
    }
    return { status: 'sent' };
  } catch (err) {
    console.error('[notifications] Host RSVP email failed:', err?.message);
    return { status: 'failed', reason: err?.message || 'RESEND_SEND_FAILED' };
  }
}
