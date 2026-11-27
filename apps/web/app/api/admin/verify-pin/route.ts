/**
 * POST /api/admin/verify-pin
 *
 * Verifies the admin PIN against the bcrypt hash stored in `admin_users`.
 * Enforces a 5-attempt lockout (5-minute duration).
 * On success, sets a short-lived signed admin session in an httpOnly cookie.
 *
 * Security notes:
 * - PIN hash is NEVER returned to the client.
 * - Lockout state is stored in `admin_users.locked_until` and checked
 *   server-side before any bcrypt comparison.
 * - All admin authentication events are logged as structured JSON.
 *
 * HTTP responses:
 * - 200  { ok: true }        — correct PIN, httpOnly cookie set
 * - 400  { error: string }   — missing/invalid body
 * - 401  { error: string }   — wrong PIN
 * - 423  { error: string, lockedUntil: string, retryAfterSeconds: number }
 *         — account locked
 * - 500  { error: string }   — internal error
 *
 * Requirements: 11.2, 11.3, 11.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { compare, hash } from 'bcryptjs';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminCookieOptions,
  signAdminToken,
} from '@/lib/security';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
/**
 * bcryptjs is pure JavaScript: cost 12 takes ~0.5–1 s on a small serverless
 * CPU (the main reason PIN login felt slow). A 4–8 digit PIN is protected by
 * the lockout above, not by hash cost, so hashes are upgraded to cost 10
 * (~4× faster) transparently on the next successful login.
 */
const TARGET_COST = 10;

function costOf(bcryptHash: string): number {
  const m = /^\$2[abxy]?\$(\d{2})\$/.exec(bcryptHash);
  return m ? Number(m[1]) : TARGET_COST;
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

  // The admin PIN is 4–8 digits. Reject anything else before touching the
  // database so malformed input never counts toward the lockout.
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4-8 digits' }, { status: 400 });
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

  // ── Handle success — reset counters / upgrade hash only when needed ──────
  const needsReset = (adminUser.failed_attempts ?? 0) !== 0 || adminUser.locked_until !== null;
  const needsRehash = costOf(adminUser.pin_hash) > TARGET_COST;
  if (needsReset || needsRehash) {
    const update: Record<string, unknown> = { failed_attempts: 0, locked_until: null };
    if (needsRehash) update.pin_hash = await hash(pin, TARGET_COST);
    // Not awaited on the critical path of the response body, but awaited
    // before returning so serverless runtimes don't drop the write.
    await supabase.from('admin_users').update(update).eq('id', adminUser.id);
  }

  // ── Issue admin session in an httpOnly cookie (never exposed to JS) ─────
  let token: string;
  try {
    token = await signAdminToken(adminUser.id);
  } catch (err) {
    log({
      level: 'error',
      event: 'admin.auth.jwt_sign_failed',
      details: { error: String(err) },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  log({ level: 'info', event: 'admin.login', details: { adminId: adminUser.id } });

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(ADMIN_COOKIE, token, adminCookieOptions(ADMIN_SESSION_SECONDS));
  return response;
}
