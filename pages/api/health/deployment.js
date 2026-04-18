/**
 * Optional diagnostics (set DEPLOYMENT_HEALTH_SECRET in env, then GET /api/health/deployment?secret=YOUR_SECRET).
 * Does not expose secret values — only which integrations are configured.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.DEPLOYMENT_HEALTH_SECRET;
  if (!expected || req.query.secret !== expected) {
    return res.status(404).json({ error: 'Not found' });
  }

  const has = (k) => Boolean(process.env[k]);

  return res.status(200).json({
    NEXT_PUBLIC_SUPABASE_URL: has('NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_APP_URL: has('NEXT_PUBLIC_APP_URL'),
    RESEND_API_KEY: has('RESEND_API_KEY'),
    RESEND_FROM_set: has('RESEND_FROM'),
    AWS_S3_configured: Boolean(
      process.env.AWS_S3_BUCKET &&
        process.env.AWS_REGION &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY
    ),
    note:
      'Shared messages/poll/RSVP require SUPABASE_SERVICE_ROLE_KEY on the server. Email requires RESEND_API_KEY + verified RESEND_FROM domain.',
  });
}
