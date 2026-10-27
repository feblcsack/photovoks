/**
 * Next.js Proxy (formerly Middleware)
 *
 * Responsibilities:
 * 1. IP-based rate limiting on POST /api/sessions.
 * 2. Admin JWT validation — protects all /admin/* routes except /admin/pin.
 *    The JWT is signed with the SUPABASE_SERVICE_ROLE_KEY (HS256) and issued by
 *    POST /api/admin/verify-pin. On missing or invalid JWT, redirects to
 *    /admin/pin. On valid JWT, request proceeds.
 *
 * Rate limit: 10 requests per IP per 60-second window.
 *
 * NOTE: In-memory rate-limit state is per-instance and resets on cold starts.
 * For multi-instance production deployments, swap for a distributed store.
 *
 * Requirements:
 *  - Req 6.4  (server-side session creation / rate limiting)
 *  - Req 11.2 (admin PIN verified server-side; routes protected)
 *  - Req 11.5 (admin JWT validated; redirect on missing/invalid token)
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store: ip → { count, windowStart }
const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// ── Admin JWT validation ──────────────────────────────────────────────────────

/**
 * Returns true if the request carries a valid admin JWT in the `admin_token`
 * cookie. The JWT must have been signed with the SUPABASE_SERVICE_ROLE_KEY and
 * carry `role: 'admin'` in its payload.
 *
 * We use `jose` which is Edge-compatible (no Node.js crypto module needed).
 */
async function hasValidAdminToken(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value;
  if (!token) return false;

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      issuer: 'photovoks/admin',
    });
    return payload.role === 'admin';
  } catch {
    // Expired, tampered, or otherwise invalid token
    return false;
  }
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── 1. Rate-limit POST /api/sessions ──────────────────────────────────────
  if (request.method === 'POST' && pathname === '/api/sessions') {
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
          },
        }
      );
    }
  }

  // ── 2. Protect admin pages and APIs (except login/logout) ─────────────────
  const isAdminPage = pathname.startsWith('/admin') && !pathname.startsWith('/admin/pin');
  const isAdminApi =
    pathname.startsWith('/api/admin') &&
    pathname !== '/api/admin/verify-pin' &&
    pathname !== '/api/admin/logout';

  if (isAdminPage || isAdminApi) {
    const valid = await hasValidAdminToken(request);
    if (!valid) {
      const loginUrl = new URL('/admin/pin', request.url);
      // Preserve the originally requested URL so we can redirect back after login
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on admin pages and the existing API routes
  matcher: ['/admin/:path*', '/api/:path*'],
};
