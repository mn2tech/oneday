/**
 * Public read-only: whether the server can run shared interactions (messages / poll / RSVP APIs).
 * Open GET /api/health/cloud in the browser — if sharedInteractionsReady is false, add SUPABASE_SERVICE_ROLE_KEY to server env.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const sharedInteractionsReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    sharedInteractionsReady,
    emailLikelyConfigured: Boolean(process.env.RESEND_API_KEY),
  });
}
