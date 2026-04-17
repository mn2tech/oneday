/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Vercel runs `next build`, which lint-checks by default. If CI fails on lint while
  // local passes, run `npm run lint` and fix issues, or temporarily set this to true.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
