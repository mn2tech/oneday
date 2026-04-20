/**
 * Browser-generated device id (hex). Used for row-level ownership checks on the server.
 */
const MIN_LEN = 16;
const MAX_LEN = 128;

export function normalizeDeviceId(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.length < MIN_LEN || s.length > MAX_LEN) return null;
  if (!/^[a-f0-9]+$/.test(s)) return null;
  return s;
}

/** Compare stored owner id with request device id (both normalized). */
export function isOwnerRow(stored, requestDeviceId) {
  const req = normalizeDeviceId(requestDeviceId);
  if (!req) return false;
  if (stored == null || stored === '') return false;
  return String(stored).trim().toLowerCase() === req;
}

/**
 * Legacy rows may have no owner_device_id — allow mutation so existing content is not stuck.
 * New rows always set owner_device_id; UI only shows actions when owned_by_me.
 */
export function canMutateLegacyAwareRow(storedOwner, requestDeviceId) {
  const s = storedOwner != null ? String(storedOwner).trim() : '';
  if (!s) return true;
  return isOwnerRow(s, requestDeviceId);
}
