/**
 * GET    /api/payments/<token>  → { payment }  (polled every ~3 s by booth/guest)
 * DELETE /api/payments/<token>  → cancel a pending payment
 * The 24-char random token is the capability; it is only known to the device
 * that created the payment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/http';
import { cancelPayment, paymentByToken } from '@/lib/payments';

export const maxDuration = 20;
type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const payment = await paymentByToken(token);
  if (!payment) return jsonError('Pembayaran tidak ditemukan', 404);
  return NextResponse.json({ payment }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const ok = await cancelPayment(token);
  return NextResponse.json({ ok });
}
