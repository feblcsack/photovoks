/**
 * Next.js Proxy (runs in the Node.js runtime).
 *
 * 1. Rate limits public write endpoints per IP.
 * 2. Protects /admin/* pages (redirect to PIN screen) and /api/admin/* APIs
 *    (401 JSON) using the httpOnly admin session cookie.
 *    Every admin route handler ALSO calls requireAdmin() (defense in depth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, clientIp, rateLimited, verifyAdminToken } from '@/lib/security';

const LIMITS: Array<{ test: (p: string) => boolean; max: number; windowMs: number }> = [
  { test: (p) => p === '/api/sessions', max: 20, windowMs: 60_000 },
  { test: (p) => p === '/api/admin/verify-pin', max: 10, windowMs: 60_000 },
  { test: (p) => p.endsWith('/generate-sketch'), max: 10, windowMs: 60_000 },
  { test: (p) => p === '/api/print-jobs/sketch', max: 10, windowMs: 60_000 },
];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (request.method === 'POST') {
    const rule = LIMITS.find((r) => r.test(pathname));
    if (rule && rateLimited(`${pathname}:${clientIp(request)}`, rule.max, rule.windowMs)) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rule.windowMs / 1000)) } },
      );
    }
  }

  const isAdminPage = pathname.startsWith('/admin') && !pathname.startsWith('/admin/pin');
  const isAdminApi =
    pathname.startsWith('/api/admin') &&
    pathname !== '/api/admin/verify-pin' &&
    pathname !== '/api/admin/logout';

  if (isAdminPage || isAdminApi) {
    const valid = await verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value);
    if (!valid) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/admin/pin', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
