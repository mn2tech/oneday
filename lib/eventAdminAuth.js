import crypto from 'crypto';
import { canMutateLegacyAwareRow, normalizeDeviceId, isOwnerRow } from './deviceOwnership';

export function generateAdminToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashAdminToken(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length < 32 || s.length > 200) return null;
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * True if requester is the event creator: matching browser device id and/or valid admin token hash.
 */
export async function isEventHost(supabase, eventId, { deviceId, adminToken }) {
  if (!eventId || typeof eventId !== 'string') return false;
  const { data: row, error } = await supabase
    .from('event_apps')
    .select('creator_device_id, admin_token_hash')
    .eq('id', eventId)
    .maybeSingle();
  if (error || !row) return false;

  const dev = normalizeDeviceId(deviceId);
  if (dev && row.creator_device_id && isOwnerRow(row.creator_device_id, dev)) return true;

  const raw = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (raw && row.admin_token_hash) {
    const h = hashAdminToken(raw);
    if (h && timingSafeEqualHex(h, row.admin_token_hash)) return true;
  }
  return false;
}

/** Guest row owner OR event host (creator device / admin token). */
export async function canMutateGuestOrHost(supabase, eventId, storedOwner, deviceId, adminToken) {
  const dev = normalizeDeviceId(deviceId);
  const raw = typeof adminToken === 'string' ? adminToken.trim() : '';
  if (!dev && !raw) return false;
  if (await isEventHost(supabase, eventId, { deviceId: dev, adminToken: raw })) return true;
  if (!dev) return false;
  return canMutateLegacyAwareRow(storedOwner, dev);
}
