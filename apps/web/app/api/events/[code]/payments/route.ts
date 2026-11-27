/**
 * GET   /api/events/<code>/payments?status=active  → payments of this event
 * PATCH /api/events/<code>/payments { id, action: 'approve' | 'decline' }
 * Operators (event PIN) and admins approve cash payments here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEventAccess } from '@/lib/access';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { decidePayment, listPayments, paymentTotals } from '@/lib/payments';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const status = request.nextUrl.searchParams.get('status') === 'active' ? 'active' : undefined;
  const [list, totals] = await Promise.all([listPayments({ eventId: access.event.id, status, limit: 80 }), paymentTotals(access.event.id)]);
  return NextResponse.json({ ...list, totals }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  const action = body?.action === 'approve' ? 'approve' : body?.action === 'decline' ? 'decline' : null;
  if (!action || !isUuid(body?.id)) return jsonError('Aksi tidak valid', 400);
  const done = await decidePayment(body!.id as string, access.event.id, action, access.role === 'admin' ? 'admin' : 'operator');
  if (!done) return jsonError('Pembayaran sudah diproses atau tidak ditemukan', 409);
  return NextResponse.json({ payment: done });
}
