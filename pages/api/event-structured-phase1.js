import { createClient } from '@supabase/supabase-js';
import { normalizeDeviceId } from '../../lib/deviceOwnership';
import { isEventHost } from '../../lib/eventAdminAuth';
import {
  createEmptyPhase1Content,
  extractLiveEventDetailsFromHtml,
  mergeDetailsWithFallback,
  normalizePhase1Content,
  validatePhase1Content,
} from '../../lib/eventStructuredPhase1';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function cloudConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getAuth(req) {
  const fromBody = req.body || {};
  const deviceRaw =
    typeof fromBody.deviceId === 'string'
      ? fromBody.deviceId
      : typeof req.query?.deviceId === 'string'
        ? req.query.deviceId
        : typeof req.headers['x-device-id'] === 'string'
          ? req.headers['x-device-id']
          : '';
  const adminRaw =
    typeof fromBody.adminToken === 'string'
      ? fromBody.adminToken
      : typeof req.query?.adminToken === 'string'
        ? req.query.adminToken
        : typeof req.headers['x-admin-token'] === 'string'
          ? req.headers['x-admin-token']
          : '';
  return {
    deviceId: normalizeDeviceId(deviceRaw),
    adminToken: adminRaw.trim(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!cloudConfigured()) {
    return res.status(503).json({ error: 'Structured admin editing is not configured.' });
  }

  const eventId = String((req.method === 'GET' ? req.query?.eventId : req.body?.eventId) || '').trim();
  if (!eventId || eventId.length > 80) {
    return res.status(400).json({ error: 'Invalid eventId.' });
  }

  const auth = getAuth(req);
  if (!auth.deviceId && !auth.adminToken) {
    return res.status(400).json({ error: 'Missing deviceId or adminToken.' });
  }

  const supabase = getSupabase();
  const host = await isEventHost(supabase, eventId, auth);
  if (!host) {
    return res.status(403).json({ error: 'Only the host can edit structured content.', code: 'NOT_HOST' });
  }

  if (req.method === 'GET') {
    let result = await supabase
      .from('event_apps')
      .select('title, event_date, html, content_phase1')
      .eq('id', eventId)
      .maybeSingle();

    if (result.error && String(result.error.message || '').toLowerCase().includes('content_phase1')) {
      result = await supabase
        .from('event_apps')
        .select('title, event_date, html')
        .eq('id', eventId)
        .maybeSingle();
    }
    if (result.error) {
      console.error('[event-structured-phase1][GET]', result.error);
      return res.status(500).json({ error: 'Could not load structured content.' });
    }
    if (!result.data) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    const currentLive = extractLiveEventDetailsFromHtml(result.data.html || '', {
      title: result.data.title || '',
      eventDate: result.data.event_date || '',
    });
    const normalized = normalizePhase1Content(
      result.data.content_phase1 ||
        {
          ...createEmptyPhase1Content(result.data.title || ''),
          eventDetails: currentLive,
        },
      result.data.title || ''
    );
    const contentWithFallback = {
      ...normalized,
      eventDetails: mergeDetailsWithFallback(normalized.eventDetails, currentLive),
    };
    return res.status(200).json({ ok: true, content: contentWithFallback, currentLive });
  }

  const normalized = normalizePhase1Content(req.body?.content, '');
  const errors = validatePhase1Content(normalized);
  if (errors.length) {
    return res.status(400).json({ error: 'Invalid structured content.', details: errors });
  }

  const { data, error } = await supabase
    .from('event_apps')
    .update({ content_phase1: normalized, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (String(error.message || '').toLowerCase().includes('content_phase1')) {
      return res.status(400).json({
        error: 'Structured editing requires DB migration. Add event_apps.content_phase1 first.',
        migrationRequired: true,
      });
    }
    console.error('[event-structured-phase1][PUT]', error);
    return res.status(500).json({ error: 'Could not save structured content.' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  return res.status(200).json({ ok: true, content: normalized });
}
