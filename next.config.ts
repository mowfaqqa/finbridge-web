import type { NextConfig } from 'next';

const apiOrigin = new URL(process.env.FINBRIDGE_API_ORIGIN ?? 'http://127.0.0.1:4000').origin;

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },
};

export default config;
