import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { normalizeDeviceId } from '../../../lib/deviceOwnership';
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

function fromAddress() {
  return process.env.RESEND_FROM || 'OneDay <noreply@getoneday.com>';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_INVITES = 25;

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeEmailList(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const e = item.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || e.length > 254) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= MAX_INVITES) break;
  }
  return out;
}

function parseRawString(s) {
  if (typeof s !== 'string' || !s.trim()) return [];
  return s
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Invites are not available (shared backend not configured).' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'Email sending is not configured (RESEND_API_KEY).' });
  }

  const { eventId, emails, emailsRaw, deviceId, adminToken } = req.body || {};
  if (!eventId || typeof eventId !== 'string' || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  let list = normalizeEmailList(emails);
  if (!list.length && emailsRaw != null) {
    list = normalizeEmailList(parseRawString(String(emailsRaw)));
  }
  if (!list.length) {
    return res.status(400).json({ error: 'Add at least one valid email address.' });
  }

  const dev = normalizeDeviceId(deviceId);
  const rawAdmin = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (!dev && !rawAdmin) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  const supabase = getSupabase();
  const host = await isEventHost(supabase, eventId, { deviceId: dev, adminToken: rawAdmin });
  if (!host) {
    return res.status(403).json({ error: 'Only the host can send invitations.', code: 'NOT_HOST' });
  }

  const { data: ev, error: evErr } = await supabase
    .from('event_apps')
    .select('id, title')
    .eq('id', eventId)
    .maybeSingle();

  if (evErr) {
    console.error('[event-invites/send]', evErr);
    return res.status(500).json({ error: 'Could not load event.' });
  }
  if (!ev) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const eventUrl = `${baseUrl}/e/${encodeURIComponent(eventId)}`;
  const eventTitle = (ev.title && String(ev.title).trim()) || 'Your invitation';
  const titleHtml = escHtml(eventTitle);

  const resend = new Resend(key);
  const results = { sent: 0, failed: [] };

  for (const to of list) {
    try {
      await resend.emails.send({
        from: fromAddress(),
        to,
        subject: `You're invited — ${eventTitle.slice(0, 200)}`,
        html: `
        <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#0a0a0f;color:#f0f0f5;border-radius:12px;">
          <div style="margin-bottom:20px;"><span style="font-size:1.35rem;font-weight:700;">◆ OneDay</span></div>
          <h1 style="font-size:1.45rem;margin:0 0 12px;">You're invited</h1>
          <p style="color:#aaa;margin:0 0 20px;line-height:1.5;">${titleHtml}</p>
          <a href="${escHtml(eventUrl)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:600;margin-bottom:20px;">Open event page →</a>
          <p style="color:#888;font-size:0.85rem;margin:0;">Or copy this link:</p>
          <p style="background:#1a1a2e;padding:12px 16px;border-radius:6px;font-size:0.88rem;word-break:break-all;color:#c084fc;margin:8px 0 0;">${escHtml(eventUrl)}</p>
        </div>`,
      });
      results.sent += 1;
    } catch (err) {
      console.error('[event-invites/send] Resend', to, err?.message);
      results.failed.push({ email: to, reason: err?.message || 'SEND_FAILED' });
    }
  }

  return res.status(200).json({
    ok: true,
    sent: results.sent,
    failed: results.failed,
    attempted: list.length,
  });
}
