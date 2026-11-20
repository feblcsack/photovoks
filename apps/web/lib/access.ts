/**
 * Event-level access control (SERVER ONLY).
 *
 * Two kinds of credentials:
 *  - Admin (owner) session cookie  → full access to every event.
 *  - Event PIN session cookie      → access to ONE event: run its booth,
 *    see its sessions / gallery, operate its print station, edit settings.
 *
 * Event cookies are signed JWTs (HS256) scoped to the event id. Changing the
 * event PIN bumps nothing server-side, so cookies are short-ish (12 h) — long
 * enough for an event day, short enough to expire overnight.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { createServerClient } from '@/lib/supabase/server';
import { ADMIN_COOKIE, getAdminKey, verifyAdminToken } from '@/lib/security';
import { EVENT_COLUMNS, mapEvent, normalizeEventCode, type EventConfig } from '@/lib/events';

export const EVENT_SESSION_SECONDS = 12 * 60 * 60;
const EVENT_ISSUER = 'photovoks/event';

export type AccessRole = 'admin' | 'event';

export function eventCookieName(code: string): string {
  return `pv_ev_${code}`;
}

export async function signEventToken(eventId: string, code: string, pinVersion: string): Promise<string> {
  return new SignJWT({ scope: 'event', eventId, code, pv: pinVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EVENT_SESSION_SECONDS}s`)
    .setIssuer(EVENT_ISSUER)
    .sign(getAdminKey());
}

/**
 * `pinVersion` is a short fingerprint of the current PIN hash: changing the
 * PIN invalidates every event cookie issued for the old PIN.
 */
export function pinVersionOf(pinHash: string | null): string {
  if (!pinHash) return 'none';
  return pinHash.slice(-12);
}

async function verifyEventToken(token: string | undefined, eventId: string, pinHash: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getAdminKey(), { issuer: EVENT_ISSUER, algorithms: ['HS256'] });
    return payload.scope === 'event' && payload.eventId === eventId && payload.pv === pinVersionOf(pinHash);
  } catch {
    return false;
  }
}

export function eventCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== '1',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

export interface EventWithSecret {
  event: EventConfig;
  pinHash: string | null;
  pinFailedAttempts: number;
  pinLockedUntil: string | null;
}

export async function loadEventByCode(rawCode: string): Promise<EventWithSecret | null> {
  const code = normalizeEventCode(rawCode);
  if (!code) return null;
  const supabase = createServerClient();
  const { data } = await supabase
    .from('events')
    .select(`${EVENT_COLUMNS}, pin_failed_attempts, pin_locked_until`)
    .eq('code', code)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    event: mapEvent(row),
    pinHash: row.pin_hash ?? null,
    pinFailedAttempts: row.pin_failed_attempts ?? 0,
    pinLockedUntil: row.pin_locked_until ?? null,
  };
}

/** Resolves the caller's role for an event (null = no access). */
export async function getEventRole(loaded: EventWithSecret): Promise<AccessRole | null> {
  if (await isAdmin()) return 'admin';
  const store = await cookies();
  const ok = await verifyEventToken(
    store.get(eventCookieName(loaded.event.code))?.value,
    loaded.event.id,
    loaded.pinHash,
  );
  return ok ? 'event' : null;
}

export type EventAccessResult =
  | { ok: true; event: EventConfig; role: AccessRole; loaded: EventWithSecret }
  | { ok: false; response: NextResponse };

/** Guard for route handlers under /api/events/[code]/*. */
export async function requireEventAccess(code: string): Promise<EventAccessResult> {
  const loaded = await loadEventByCode(code);
  if (!loaded) {
    return { ok: false, response: NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 }) };
  }
  const role = await getEventRole(loaded);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: 'Butuh PIN event' }, { status: 401 }) };
  }
  return { ok: true, event: loaded.event, role, loaded };
}

/** Same guard but by event id (used by session-level routes). */
export async function requireEventAccessById(eventId: string): Promise<EventAccessResult> {
  const supabase = createServerClient();
  const { data } = await supabase.from('events').select('code').eq('id', eventId).maybeSingle();
  if (!data) return { ok: false, response: NextResponse.json({ error: 'Event tidak ditemukan' }, { status: 404 }) };
  return requireEventAccess(data.code as string);
}
