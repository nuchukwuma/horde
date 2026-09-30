/** @type {import('next').NextConfig} */

// Start strict; every relaxation here is compatibility debt with a removal plan.
// Tenant sites render seller-authored HTML, so script-src must never gain
// 'unsafe-inline' — sanitisation at write time assumes it stays off.
const isDev = process.env.NODE_ENV !== 'production';

// The dev server injects inline bootstrap scripts and React Refresh evaluates
// module code as strings, so `script-src 'self'` blocks the whole page. This
// relaxation is scoped to development by construction rather than by a flag
// someone can set in production: a production build never takes this branch.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
  : "script-src 'self'";

// HMR talks over a WebSocket to the dev server's own origin.
const connectSrc = isDev
  ? "connect-src 'self' ws: https://api.paystack.co"
  : "connect-src 'self' https://api.paystack.co";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.paystack.com",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://res.cloudinary.com",
  "font-src 'self'",
  connectSrc,
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['mongoose', '@node-rs/argon2'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
