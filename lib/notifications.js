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

function truncate(value, max) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

async function sendHostNotification({ event, subject, html, logLabel }) {
  if (!hostEmailNotificationsEnabled()) {
    return { status: 'skipped', reason: 'HOST_EMAIL_NOTIFICATIONS_DISABLED' };
  }

  const to = normalizeNotificationEmail(event?.email);
  if (!to) {
    return { status: 'skipped', reason: 'HOST_EMAIL_MISSING' };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[notifications] ${logLabel} skipped: set RESEND_API_KEY.`);
    return { status: 'skipped', reason: 'RESEND_NOT_CONFIGURED' };
  }

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
        subject,
        html,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`RESEND_SEND_FAILED ${response.status}${body ? ` ${body}` : ''}`);
    }
    return { status: 'sent' };
  } catch (err) {
    console.error(`[notifications] ${logLabel} failed:`, err?.message);
    return { status: 'failed', reason: err?.message || 'RESEND_SEND_FAILED' };
  }
}

function linkBlock(eventId) {
  const link = eventUrl(eventId);
  return link
    ? `<a href="${escapeHtml(link)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:600;margin:16px 0 12px;">Open event page</a>
       <p style="background:#1a1a2e;padding:12px 16px;border-radius:6px;font-size:0.88rem;word-break:break-all;color:#c084fc;margin:0;">${escapeHtml(link)}</p>`
    : '';
}

export async function sendHostRsvpNotification({ event, rsvp }) {
  const eventTitle = String(event?.title || 'your event').trim().slice(0, 200) || 'your event';
  const guestName = String(rsvp?.guest_name || 'Guest').trim().slice(0, 120) || 'Guest';
  const adults = Number.isFinite(Number(rsvp?.adults)) ? Number(rsvp.adults) : 0;
  const kids = Number.isFinite(Number(rsvp?.kids)) ? Number(rsvp.kids) : 0;
  const total = adults + kids;

  return sendHostNotification({
    event,
    subject: `New RSVP for ${eventTitle}`,
    logLabel: 'Host RSVP email',
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
            ${linkBlock(event?.id)}
            <p style="color:#666;font-size:0.8rem;margin-top:24px;">You are receiving this because this email is set as the host email for this OneDay event.</p>
          </div>`,
  });
}

export async function sendHostMessageNotification({ event, message }) {
  const eventTitle = String(event?.title || 'your event').trim().slice(0, 200) || 'your event';
  const authorName = String(message?.author_name || 'Guest').trim().slice(0, 120) || 'Guest';
  const body = truncate(message?.body || '', 600);

  return sendHostNotification({
    event,
    subject: `New message for ${eventTitle}`,
    logLabel: 'Host message email',
    html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f5;border-radius:12px;">
            <div style="margin-bottom:20px;"><span style="font-size:1.35rem;font-weight:700;">◆ OneDay</span></div>
            <h1 style="font-size:1.45rem;margin:0 0 12px;">New message posted</h1>
            <p style="color:#aaa;margin:0 0 20px;line-height:1.5;">${escapeHtml(authorName)} posted on the message wall for ${escapeHtml(eventTitle)}.</p>
            <div style="background:#151525;border:1px solid #2a2a45;border-radius:10px;padding:16px;margin-bottom:18px;">
              <p style="margin:0 0 8px;"><strong>Author:</strong> ${escapeHtml(authorName)}</p>
              <p style="margin:0;white-space:pre-wrap;line-height:1.5;">${escapeHtml(body)}</p>
            </div>
            ${linkBlock(event?.id)}
            <p style="color:#666;font-size:0.8rem;margin-top:24px;">You are receiving this because this email is set as the host email for this OneDay event.</p>
          </div>`,
  });
}

export async function sendHostPhotoNotification({ event, photo }) {
  const eventTitle = String(event?.title || 'your event').trim().slice(0, 200) || 'your event';
  const section = Number.isInteger(Number(photo?.section_index))
    ? `Photo wall section ${Number(photo.section_index) + 1}`
    : 'Photo wall';
  const contentType = String(photo?.content_type || 'image').slice(0, 80);
  const size = formatBytes(photo?.byte_size);
  const imageLink = photo?.url
    ? `<a href="${escapeHtml(photo.url)}" style="display:inline-block;color:#c084fc;text-decoration:none;margin-top:8px;">View uploaded photo</a>`
    : '';

  return sendHostNotification({
    event,
    subject: `New photo for ${eventTitle}`,
    logLabel: 'Host photo email',
    html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f5;border-radius:12px;">
            <div style="margin-bottom:20px;"><span style="font-size:1.35rem;font-weight:700;">◆ OneDay</span></div>
            <h1 style="font-size:1.45rem;margin:0 0 12px;">New photo added</h1>
            <p style="color:#aaa;margin:0 0 20px;line-height:1.5;">A guest added a photo to ${escapeHtml(eventTitle)}.</p>
            <div style="background:#151525;border:1px solid #2a2a45;border-radius:10px;padding:16px;margin-bottom:18px;">
              <p style="margin:0 0 8px;"><strong>Location:</strong> ${escapeHtml(section)}</p>
              <p style="margin:0 0 8px;"><strong>File type:</strong> ${escapeHtml(contentType)}</p>
              <p style="margin:0;"><strong>File size:</strong> ${escapeHtml(size)}</p>
              ${imageLink}
            </div>
            ${linkBlock(event?.id)}
            <p style="color:#666;font-size:0.8rem;margin-top:24px;">You are receiving this because this email is set as the host email for this OneDay event.</p>
          </div>`,
  });
}
