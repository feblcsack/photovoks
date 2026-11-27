/**
 * GET   /api/admin/payments?status=active → payments across all events
 * PATCH /api/admin/payments { id, action }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isUuid } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { decidePayment, listPayments, paymentTotals } from '@/lib/payments';

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const status = request.nextUrl.searchParams.get('status') === 'active' ? 'active' : undefined;
  const [list, totals] = await Promise.all([listPayments({ status, limit: 120 }), paymentTotals()]);
  return NextResponse.json({ ...list, totals }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  const action = body?.action === 'approve' ? 'approve' : body?.action === 'decline' ? 'decline' : null;
  if (!action || !isUuid(body?.id)) return jsonError('Aksi tidak valid', 400);
  const done = await decidePayment(body!.id as string, null, action, 'admin');
  if (!done) return jsonError('Pembayaran sudah diproses atau tidak ditemukan', 409);
  return NextResponse.json({ payment: done });
}
