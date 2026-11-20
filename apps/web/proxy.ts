/**
 * Next.js Proxy (runs in the Node.js runtime).
 *
 * 1. Rate limits public write endpoints per IP.
 * 2. Protects /admin/* pages (redirect to PIN screen) and /api/admin/* APIs
 *    (401 JSON) using the httpOnly admin session cookie.
 *    Every admin route handler ALSO calls requireAdmin() (defense in depth).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminCookieOptions, clientIp, rateLimited, readAdminToken, signAdminToken } from '@/lib/security';

const LIMITS: Array<{ test: (p: string) => boolean; max: number; windowMs: number }> = [
  { test: (p) => p === '/api/sessions', max: 30, windowMs: 60_000 },
  { test: (p) => p === '/api/admin/verify-pin', max: 10, windowMs: 60_000 },
  { test: (p) => /^\/api\/events\/[^/]+\/unlock$/.test(p), max: 10, windowMs: 60_000 },
  { test: (p) => /^\/api\/s\/[^/]+\/ai$/.test(p), max: 10, windowMs: 60_000 },
  { test: (p) => /^\/api\/s\/[^/]+\/print$/.test(p), max: 20, windowMs: 60_000 },
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

  const adminToken = request.cookies.get(ADMIN_COOKIE)?.value;
  const admin = adminToken ? await readAdminToken(adminToken) : null;

  if (isAdminPage || isAdminApi) {
    if (!admin) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/admin/pin', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();
  // Sliding session: an active admin gets a fresh 30-min cookie every 5 min.
  // (Idle auto-logout after 10 min is enforced client-side as well.)
  if (admin && Date.now() / 1000 - admin.iat > 5 * 60) {
    response.cookies.set(ADMIN_COOKIE, await signAdminToken(admin.adminId), adminCookieOptions(ADMIN_SESSION_SECONDS));
  }
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/event/:path*', '/booth/:path*'],
};
