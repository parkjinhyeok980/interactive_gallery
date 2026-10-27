import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, images: { remotePatterns: [
  { protocol: 'https', hostname: '**.cdninstagram.com' },
  { protocol: 'https', hostname: '**.fbcdn.net' },
] } };
export default config;
