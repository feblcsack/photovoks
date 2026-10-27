/**
 * POST /api/admin/verify-pin
 *
 * Verifies the admin PIN against the bcrypt hash stored in `admin_users`.
 * Enforces a 5-attempt lockout (5-minute duration).
 * On success, issues a short-lived signed JWT (10-minute validity).
 *
 * The JWT is signed with the SUPABASE_SERVICE_ROLE_KEY so it can be verified
 * server-side in middleware without a round-trip to Supabase Auth. The claim
 * `role: 'admin'` distinguishes it from visitor session tokens.
 *
 * Security notes:
 * - PIN hash is NEVER returned to the client.
 * - Lockout state is stored in `admin_users.locked_until` and checked
 *   server-side before any bcrypt comparison.
 * - All admin authentication events are logged as structured JSON.
 *
 * HTTP responses:
 * - 200  { token: string }   — correct PIN, JWT included
 * - 400  { error: string }   — missing/invalid body
 * - 401  { error: string }   — wrong PIN
 * - 423  { error: string, lockedUntil: string, retryAfterSeconds: number }
 *         — account locked
 * - 500  { error: string }   — internal error
 *
 * Requirements: 11.2, 11.3, 11.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { SignJWT } from 'jose';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JWT_VALIDITY_SECONDS = 600; // 10 minutes (Requirement 11.3)

function getJwtSecret(): Uint8Array {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  return new TextEncoder().encode(key);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('pin' in body) ||
    typeof (body as Record<string, unknown>).pin !== 'string'
  ) {
    return NextResponse.json(
      { error: 'Missing or invalid field: pin' },
      { status: 400 }
    );
  }

  const { pin } = body as { pin: string };

  // The admin PIN is exactly 4 digits. Reject anything else before touching
  // the database so malformed input never counts toward the lockout.
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
  }

  const supabase = createServerClient();

  // ── Fetch admin user record ───────────────────────────────────────────────
  // We fetch the first (and only) admin user. Multi-admin support can be
  // added later by accepting a username in the request body.
  const { data: adminUser, error: fetchError } = await supabase
    .from('admin_users')
    .select('id, pin_hash, failed_attempts, locked_until')
    .limit(1)
    .single();

  if (fetchError || !adminUser) {
    log({
      level: 'error',
      event: 'admin.auth.lookup_failed',
      details: { error: fetchError?.message },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // ── Check lockout ─────────────────────────────────────────────────────────
  if (adminUser.locked_until) {
    const lockedUntil = new Date(adminUser.locked_until);
    const now = new Date();

    if (lockedUntil > now) {
      const retryAfterSeconds = Math.ceil(
        (lockedUntil.getTime() - now.getTime()) / 1000
      );

      log({
        level: 'warn',
        event: 'admin.auth.locked',
        details: {
          lockedUntil: lockedUntil.toISOString(),
          retryAfterSeconds,
        },
      });

      return NextResponse.json(
        {
          error: 'Account temporarily locked due to too many failed attempts.',
          lockedUntil: lockedUntil.toISOString(),
          retryAfterSeconds,
        },
        {
          status: 423,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        }
      );
    }
  }

  // ── Verify PIN against bcrypt hash ────────────────────────────────────────
  // NOTE: adminUser.pin_hash is read here but NEVER sent to the client.
  let pinMatches = false;
  try {
    pinMatches = await compare(pin, adminUser.pin_hash);
  } catch (err) {
    log({
      level: 'error',
      event: 'admin.auth.bcrypt_failed',
      details: { error: String(err) },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // ── Handle failure ────────────────────────────────────────────────────────
  if (!pinMatches) {
    const newFailedAttempts = (adminUser.failed_attempts ?? 0) + 1;
    const shouldLock = newFailedAttempts >= MAX_ATTEMPTS;

    const updatePayload: Record<string, unknown> = {
      failed_attempts: shouldLock ? 0 : newFailedAttempts,
    };

    if (shouldLock) {
      updatePayload.locked_until = new Date(
        Date.now() + LOCKOUT_DURATION_MS
      ).toISOString();
    }

    await supabase
      .from('admin_users')
      .update(updatePayload)
      .eq('id', adminUser.id);

    log({
      level: 'warn',
      event: shouldLock ? 'admin.lockout' : 'admin.auth.failed',
      details: {
        failedAttempts: newFailedAttempts,
        locked: shouldLock,
      },
    });

    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }

  // ── Handle success — reset failure counters ───────────────────────────────
  await supabase
    .from('admin_users')
    .update({ failed_attempts: 0, locked_until: null })
    .eq('id', adminUser.id);

  // ── Issue signed JWT (10-minute validity) ─────────────────────────────────
  // Requirement 11.3: JWT validity must be exactly 10 minutes.
  // The JWT is signed with the service role key so it can be verified in
  // Edge Middleware without importing Supabase client (not available in Edge).
  let token: string;
  try {
    const secret = getJwtSecret();
    const now = Math.floor(Date.now() / 1000);

    token = await new SignJWT({ role: 'admin', adminId: adminUser.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + JWT_VALIDITY_SECONDS)
      .setIssuer('photovoks/admin')
      .sign(secret);
  } catch (err) {
    log({
      level: 'error',
      event: 'admin.auth.jwt_sign_failed',
      details: { error: String(err) },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  log({
    level: 'info',
    event: 'admin.login',
    details: { adminId: adminUser.id },
  });

  return NextResponse.json({ token }, { status: 200 });
}
