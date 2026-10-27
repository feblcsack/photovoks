/**
 * POST /api/admin/logout
 *
 * Invalidates the admin session by expiring the admin_token cookie.
 * Also emits a structured log entry for the admin.logout lifecycle event.
 *
 * This route is intentionally minimal — it does not verify the JWT because
 * logging out should always succeed even with an invalid or already-expired
 * token (e.g. the auto-logout triggered by useActivityTimer).
 *
 * The client should call this before clearing the cookie locally.
 *
 * Requirements: 16.4
 */

import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';

export async function POST(): Promise<NextResponse> {
  log({
    level: 'info',
    event: 'admin.logout',
    details: {},
  });

  // Clear the admin_token cookie by setting it with Max-Age=0
  const response = NextResponse.json({ ok: true });
  response.cookies.set('admin_token', '', {
    path: '/',
    maxAge: 0,
    httpOnly: false, // must be readable by client to clear it
    sameSite: 'strict',
  });

  return response;
}
