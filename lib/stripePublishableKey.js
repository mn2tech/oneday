/**
 * Normalize Stripe keys from env (trim, strip accidental quotes).
 * Works for publishable (pk_*) and secret (sk_*) keys.
 */
export function normalizeStripeEnvKey(raw) {
  if (raw == null) return '';
  let k = String(raw).trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

/** @deprecated use normalizeStripeEnvKey — kept for existing imports */
export const normalizeStripePublishableKey = normalizeStripeEnvKey;

/** Loose format check before calling loadStripe (does not verify with Stripe). */
export function looksLikeStripePublishableKey(k) {
  if (!k || k === 'undefined' || k.startsWith('pk_test_...')) return false;
  if (!/^pk_(live|test)_/.test(k)) return false;
  return k.length >= 40 && !/\s/.test(k);
}

/** Basic shape check for secret keys (server-side). */
export function looksLikeStripeSecretKey(k) {
  if (!k || k === 'undefined') return false;
  if (!/^sk_(live|test)_/.test(k)) return false;
  return k.length >= 40 && !/\s/.test(k);
}
