import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseWs = supabaseUrl.replace(/^http/, 'ws');
// Backup Supabase project + S3/R2 endpoint: the browser uploads straight to
// them with pre-signed URLs, and videos redirect to them.
const supabaseUrl2 = process.env.SUPABASE_URL_2 ?? '';
const s3Endpoint = (() => {
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : '';
  } catch {
    return '';
  }
})();
// QRIS payments (Aulaa embedded checkout popup).
const aulaa = 'https://payment.aulaa.co';
// DOKU Checkout (Jokul popup script + hosted page, sandbox and production).
const doku = 'https://sandbox.doku.com https://jokul.doku.com https://checkout.doku.com https://*.doku.com';
const gateways = `${aulaa} ${doku}`;
const storageOrigins = [supabaseUrl, supabaseUrl2, s3Endpoint].filter(Boolean).join(' ');

/**
 * Content-Security-Policy: only this site + your Supabase project may be
 * contacted from the browser. Blocks injected third-party scripts, framing
 * (clickjacking) and plugin content.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${gateways}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigins} ${doku}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: data: ${storageOrigins} ${supabaseWs} ${gateways}`,
  `media-src 'self' blob: mediastream: ${storageOrigins}`,
  // Location card: interactive OpenStreetMap embed (UI Depok) + QRIS popup
  `frame-src https://www.openstreetmap.org ${gateways}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${doku}`,
]
  .join('; ')
  .replace(/\s+/g, ' ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: `camera=(self), microphone=(), geolocation=(), payment=(self "${aulaa}" "https://sandbox.doku.com" "https://jokul.doku.com")` },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['sharp'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
