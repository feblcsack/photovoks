/**
 * POST /api/events/[code]/unlock  { pin }
 *
 * Verifies the event PIN (bcrypt) and sets an httpOnly event-session cookie.
 * 5 wrong attempts lock the event PIN for 5 minutes. Rate-limited per IP by
 * the proxy as well.
 */
import { NextRequest, NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { createServerClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { readJson, jsonError } from '@/lib/http';
import { isValidEventPin } from '@/lib/events';
import {
  EVENT_SESSION_SECONDS,
  eventCookieName,
  eventCookieOptions,
  loadEventByCode,
  pinVersionOf,
  signEventToken,
} from '@/lib/access';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { code } = await ctx.params;
  const body = await readJson(request);
  if (!body || !isValidEventPin(body.pin)) return jsonError('PIN harus 4–8 angka', 400);

  const loaded = await loadEventByCode(code);
  if (!loaded) return jsonError('Kode event tidak ditemukan', 404);
  const { event, pinHash } = loaded;
  if (!pinHash) return jsonError('Event ini belum punya PIN. Atur PIN di portal pemilik.', 409);

  if (loaded.pinLockedUntil && new Date(loaded.pinLockedUntil).getTime() > Date.now()) {
    const retry = Math.ceil((new Date(loaded.pinLockedUntil).getTime() - Date.now()) / 1000);
    return jsonError(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(retry / 60)} menit.`, 423, { retryAfterSeconds: retry });
  }

  const supabase = createServerClient();
  const ok = await compare(body.pin as string, pinHash);
  if (!ok) {
    const attempts = loaded.pinFailedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await supabase
      .from('events')
      .update({
        pin_failed_attempts: lock ? 0 : attempts,
        ...(lock ? { pin_locked_until: new Date(Date.now() + LOCK_MS).toISOString() } : {}),
      })
      .eq('id', event.id);
    log({ level: 'warn', event: lock ? 'event.pin_locked' : 'event.pin_failed', details: { eventId: event.id, attempts } });
    return jsonError(lock ? 'PIN salah 5x. Dikunci 5 menit.' : `PIN salah (${MAX_ATTEMPTS - attempts} percobaan tersisa)`, 401);
  }

  if (loaded.pinFailedAttempts || loaded.pinLockedUntil) {
    await supabase.from('events').update({ pin_failed_attempts: 0, pin_locked_until: null }).eq('id', event.id);
  }

  const token = await signEventToken(event.id, event.code, pinVersionOf(pinHash));
  log({ level: 'info', event: 'event.unlocked', details: { eventId: event.id } });
  const res = NextResponse.json({ ok: true, code: event.code });
  res.cookies.set(eventCookieName(event.code), token, eventCookieOptions(EVENT_SESSION_SECONDS));
  return res;
}

/** DELETE = lock (sign out of this event on this device). */
export async function DELETE(_request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { code } = await ctx.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(eventCookieName(String(code).toUpperCase()), '', eventCookieOptions(0));
  return res;
}
