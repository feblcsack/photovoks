/**
 * GET /api/sessions/[token]/status
 *
 * NOTE: the dynamic segment is named `sessionId` for routing reasons, but the
 * value is the visitor's unguessable session TOKEN (the QR-code credential).
 * Unknown / expired tokens get a generic 404 (nothing leaked).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionStatusByToken } from '@/lib/session-status';

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { sessionId: token } = await context.params;
  const data = await getSessionStatusByToken(token);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
