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
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST') {
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
      .select('title, event_date, html, content_phase1, content_phase1_draft')
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

    const extractedLive = extractLiveEventDetailsFromHtml(result.data.html || '', {
      title: result.data.title || '',
      eventDate: result.data.event_date || '',
    });
    const liveContent = normalizePhase1Content(
      result.data.content_phase1 ||
        {
          ...createEmptyPhase1Content(result.data.title || ''),
          eventDetails: extractedLive,
        },
      result.data.title || ''
    );
    const currentLive = mergeDetailsWithFallback(liveContent.eventDetails, extractedLive);
    const draftContent = normalizePhase1Content(result.data.content_phase1_draft || {}, result.data.title || '');
    const effectiveEditor = (result.data.content_phase1_draft && typeof result.data.content_phase1_draft === 'object')
      ? draftContent
      : liveContent;
    const editorWithFallback = {
      ...effectiveEditor,
      eventDetails: mergeDetailsWithFallback(effectiveEditor.eventDetails, currentLive),
    };
    return res.status(200).json({
      ok: true,
      content: editorWithFallback,
      liveContent,
      draftContent,
      hasDraft: Boolean(result.data.content_phase1_draft),
      currentLive,
    });
  }

  if (req.method === 'PUT') {
    const normalized = normalizePhase1Content(req.body?.content, '');
    const errors = validatePhase1Content(normalized);
    if (errors.length) {
      return res.status(400).json({ error: 'Invalid structured content.', details: errors });
    }

    const { data, error } = await supabase
      .from('event_apps')
      .update({ content_phase1_draft: normalized, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select('id')
      .maybeSingle();

    if (error) {
      if (String(error.message || '').toLowerCase().includes('content_phase1_draft')) {
        return res.status(400).json({
          error: 'Draft preview requires DB migration. Add event_apps.content_phase1_draft first.',
          migrationRequired: true,
        });
      }
      console.error('[event-structured-phase1][PUT]', error);
      return res.status(500).json({ error: 'Could not save structured draft.' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    return res.status(200).json({ ok: true, content: normalized, savedAs: 'draft' });
  }

  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!action) {
    return res.status(400).json({ error: 'Missing action.' });
  }

  if (action === 'publish') {
    const readResult = await supabase
      .from('event_apps')
      .select('content_phase1_draft')
      .eq('id', eventId)
      .maybeSingle();
    if (readResult.error) {
      console.error('[event-structured-phase1][POST-publish-read]', readResult.error);
      return res.status(500).json({ error: 'Could not load draft for publish.' });
    }
    if (!readResult.data) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    if (!readResult.data.content_phase1_draft) {
      return res.status(400).json({ error: 'No draft to publish.' });
    }
    const normalizedDraft = normalizePhase1Content(readResult.data.content_phase1_draft, '');
    const writeResult = await supabase
      .from('event_apps')
      .update({
        content_phase1: normalizedDraft,
        content_phase1_draft: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select('id')
      .maybeSingle();
    if (writeResult.error) {
      console.error('[event-structured-phase1][POST-publish-write]', writeResult.error);
      return res.status(500).json({ error: 'Could not publish draft.' });
    }
    return res.status(200).json({ ok: true, published: true, content: normalizedDraft });
  }

  if (action === 'discard_draft') {
    const clearResult = await supabase
      .from('event_apps')
      .update({ content_phase1_draft: null, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select('id')
      .maybeSingle();
    if (clearResult.error) {
      console.error('[event-structured-phase1][POST-discard]', clearResult.error);
      return res.status(500).json({ error: 'Could not discard draft.' });
    }
    if (!clearResult.data) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    return res.status(200).json({ ok: true, discarded: true });
  }

  return res.status(400).json({ error: 'Unsupported action.' });
}
