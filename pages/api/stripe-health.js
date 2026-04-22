import Stripe from 'stripe';
import {
  looksLikeStripePublishableKey,
  looksLikeStripeSecretKey,
  normalizeStripeEnvKey,
} from '../../lib/stripePublishableKey';

/**
 * Stripe diagnostics (same gate as /api/health/deployment).
 * GET /api/stripe-health?secret=DEPLOYMENT_HEALTH_SECRET
 *
 * Proves whether the SECRET key works with Stripe’s API (server-side).
 * Publishable key is only checked for shape/prefix (browser bundle is separate).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.DEPLOYMENT_HEALTH_SECRET;
  if (!expected || req.query.secret !== expected) {
    return res.status(404).json({ error: 'Not found' });
  }

  const pkRaw = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const skRaw = process.env.STRIPE_SECRET_KEY;
  const pk = normalizeStripeEnvKey(pkRaw);
  const sk = normalizeStripeEnvKey(skRaw);

  const publishableKeyShapeOk = looksLikeStripePublishableKey(pk);
  const secretKeyShapeOk = looksLikeStripeSecretKey(sk);
  const publishableMode = pk.startsWith('pk_live_') ? 'live' : pk.startsWith('pk_test_') ? 'test' : 'unknown';
  const secretMode = sk.startsWith('sk_live_') ? 'live' : sk.startsWith('sk_test_') ? 'test' : 'unknown';
  const modeMismatch = publishableMode !== 'unknown' && secretMode !== 'unknown' && publishableMode !== secretMode;

  const out = {
    publishableKeyShapeOk,
    secretKeyShapeOk,
    publishableKeyPrefix: pk ? `${pk.slice(0, 12)}…` : 'NOT SET',
    secretKeyPrefix: sk ? `${sk.slice(0, 12)}…` : 'NOT SET',
    publishableMode,
    secretMode,
    modeMismatch,
    modeMismatchHint: modeMismatch
      ? 'Publishable and secret keys must both be LIVE or both be TEST. Mixing pk_live + sk_test (or the reverse) breaks checkout.'
      : null,
    secretKeyStripeApi: 'not_called',
    secretKeyLivemode: null,
    nextSteps: [],
  };

  if (!secretKeyShapeOk) {
    out.secretKeyStripeApi = 'skipped_invalid_shape';
    out.nextSteps.push('Fix STRIPE_SECRET_KEY in the host env (trim spaces, remove quotes, full sk_live_ or sk_test_ key), then redeploy.');
    return res.status(200).json(out);
  }

  const stripe = new Stripe(sk, { apiVersion: '2023-10-16' });

  try {
    const balance = await stripe.balance.retrieve();
    out.secretKeyStripeApi = 'ok';
    out.secretKeyLivemode = Boolean(balance.livemode);
    if (!publishableKeyShapeOk) {
      out.nextSteps.push(
        'Secret key works. Fix NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (full pk_live_/pk_test_, no quotes), redeploy, then retry checkout in the browser.'
      );
    } else if (modeMismatch) {
      out.nextSteps.push(out.modeMismatchHint);
    } else if (balance.livemode && publishableMode === 'live') {
      out.nextSteps.push('Keys look consistent. If the browser still says invalid publishable key, redeploy after changing NEXT_PUBLIC_* and hard-refresh the site.');
    }
  } catch (err) {
    out.secretKeyStripeApi = 'error';
    out.secretKeyStripeError = err.message || String(err);
    out.secretKeyStripeCode = err.code || err.type || null;
    out.nextSteps.push(
      'Stripe rejected STRIPE_SECRET_KEY. Regenerate the secret key in Dashboard → Developers → API keys, update the env var, redeploy.'
    );
  }

  return res.status(200).json(out);
}
