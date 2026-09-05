import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const apiHeaders = [
  ...securityHeaders,
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
];

const cspHeaders = [
  ...securityHeaders,
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client'],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: apiHeaders,
      },
      {
        source: '/(.*)',
        headers: cspHeaders,
      },
    ];
  },
};

export default nextConfig;