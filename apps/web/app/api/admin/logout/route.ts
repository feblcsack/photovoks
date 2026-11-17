/**
 * POST /api/admin/logout — clears the httpOnly admin session cookie.
 * Always succeeds (also used by the inactivity auto-logout).
 */
import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { ADMIN_COOKIE, adminCookieOptions } from '@/lib/security';

export async function POST(): Promise<NextResponse> {
  log({ level: 'info', event: 'admin.logout', details: {} });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', adminCookieOptions(0));
  return response;
}
