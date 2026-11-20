/**
 * Shared server-side security helpers.
 *
 * - Admin session: HS256 JWT in an httpOnly cookie (never readable from JS).
 * - Session-token checks use constant-time comparison.
 * - Small input validators used by every route handler.
 *
 * SERVER ONLY — never import from a client component.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

export const ADMIN_COOKIE = 'admin_token';
export const ADMIN_SESSION_SECONDS = 30 * 60; // 30 minutes
const ADMIN_ISSUER = 'photovoks/admin';

// ── Validators ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Session tokens are 16-char base64url (96 bits). Allow a little slack. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

/** Constant-time string comparison (prevents timing side channels). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extracts a Bearer token from the Authorization header, or null. */
export function getBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return isSessionToken(token) ? token : null;
}

// ── Admin session ────────────────────────────────────────────────────────────

/**
 * Key used to sign admin JWTs. Prefers ADMIN_SESSION_SECRET; otherwise a key
 * is derived from the service-role key (HMAC with a fixed label) so the raw
 * service key is never used directly as a JWT secret.
 */
export function getAdminKey(): Uint8Array {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit && explicit.length >= 32) return new TextEncoder().encode(explicit);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('Missing ADMIN_SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY');
  return new Uint8Array(
    createHmac('sha256', serviceKey).update('photovoks-admin-session-v1').digest(),
  );
}

export async function signAdminToken(adminId: string): Promise<string> {
  return new SignJWT({ role: 'admin', adminId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_SECONDS}s`)
    .setIssuer(ADMIN_ISSUER)
    .sign(getAdminKey());
}

/** Returns the verified admin JWT payload (with iat/adminId) or null. */
export async function readAdminToken(token: string | undefined | null): Promise<{ adminId: string; iat: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAdminKey(), { issuer: ADMIN_ISSUER, algorithms: ['HS256'] });
    if (payload.role !== 'admin') return null;
    return { adminId: String(payload.adminId ?? ''), iat: Number(payload.iat ?? 0) };
  } catch {
    return null;
  }
}

export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getAdminKey(), {
      issuer: ADMIN_ISSUER,
      algorithms: ['HS256'],
    });
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/** Cookie options for the admin session — httpOnly so XSS cannot steal it. */
export function adminCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== '1',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

/**
 * Defense-in-depth check for admin route handlers (the proxy also checks).
 * Returns a 401 response when the caller is not an authenticated admin.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  const ok = await verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
  return ok ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// ── Simple in-memory rate limiter ────────────────────────────────────────────

const buckets = new Map<string, { count: number; start: number }>();

/** Returns true when `key` exceeded `max` hits within `windowMs`. */
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start >= windowMs) {
    buckets.set(key, { count: 1, start: now });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'local';
}
