export default function handler(req, res) {
  const rawStart = typeof req.query.start === 'string' ? req.query.start : '/';
  const startUrl = rawStart.startsWith('/') ? rawStart : '/';
  const manifest = {
    name: 'OneDay',
    short_name: 'OneDay',
    description: 'AI-powered event microsites',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#7c5cfc',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(JSON.stringify(manifest));
}
