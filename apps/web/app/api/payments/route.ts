/**
 * POST /api/payments
 *   { purpose: 'session', eventCode, method }          booth (event PIN / admin)
 *   { purpose: 'ai', sessionToken, method }            guest (session QR token)
 *   { purpose: 'session', eventCode, free: true }      operator free pass
 * → { payment: PaymentView }
 *
 * GET /api/payments?eventCode=…&purpose=session  → { requirement } (booth)
 */
import { NextRequest, NextResponse } from 'next/server';
import { readJson, jsonError } from '@/lib/http';
import { requireEventAccess } from '@/lib/access';
import { resolveGuest } from '@/lib/guest-guard';
import { createPayment, paymentRequirement, type PaymentMethod } from '@/lib/payments';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('eventCode') ?? '';
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  return NextResponse.json({ requirement: await paymentRequirement(access.event, 'session') }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const method: PaymentMethod = body.method === 'qris' ? 'qris' : 'cash';

  if (body.purpose === 'session') {
    const access = await requireEventAccess(typeof body.eventCode === 'string' ? body.eventCode : '');
    if (!access.ok) return access.response;
    const res = await createPayment({
      event: access.event,
      purpose: 'session',
      method,
      operatorFree: body.free === true ? { by: access.role === 'admin' ? 'admin (gratis)' : 'operator booth (gratis)' } : undefined,
    });
    return 'error' in res ? jsonError(res.error, res.status) : NextResponse.json(res, { status: 201 });
  }

  if (body.purpose === 'ai') {
    const guest = await resolveGuest(typeof body.sessionToken === 'string' ? body.sessionToken : '');
    if (!guest) return jsonError('Sesi tidak ditemukan', 404);
    const res = await createPayment({ event: guest.event, purpose: 'ai', method, sessionId: guest.session.id });
    return 'error' in res ? jsonError(res.error, res.status) : NextResponse.json(res, { status: 201 });
  }
  return jsonError('Tujuan pembayaran tidak valid', 400);
}
