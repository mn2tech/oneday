/**
 * Normalize Stripe publishable key from env (trim, strip accidental quotes).
 * Common causes of "Invalid API Key": leading newline, spaces, or "pk_live_..." in .env.
 */
export function normalizeStripePublishableKey(raw) {
  if (raw == null) return '';
  let k = String(raw).trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

/** Loose format check before calling loadStripe (does not verify with Stripe). */
export function looksLikeStripePublishableKey(k) {
  if (!k || k === 'undefined' || k.startsWith('pk_test_...')) return false;
  if (!/^pk_(live|test)_/.test(k)) return false;
  return k.length >= 40 && !/\s/.test(k);
}
