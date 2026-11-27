/**
 * POST /api/payments/doku/notify — DOKU HTTP Notification.
 * Set in DOKU Back Office as the Notification URL:
 *   https://<domain>/api/payments/doku/notify
 * Verified with the Signature header (Request-Target = this path). Parsed
 * leniently (DOKU may add fields; QRIS payloads can be SNAP-shaped).
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyDokuNotification } from '@/lib/payments/doku';
import { applyDokuNotification } from '@/lib/payments';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyDokuNotification(request.headers, raw)) {
    log({ level: 'warn', event: 'payment.doku_bad_signature' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const invoice: string = body?.order?.invoice_number ?? body?.originalPartnerReferenceNo ?? body?.partnerReferenceNo ?? '';
  const status: string = String(body?.transaction?.status ?? body?.latestTransactionStatus ?? '').toUpperCase();
  const amountRaw = body?.order?.amount ?? body?.amount?.value;
  const amount = amountRaw != null && !Number.isNaN(Number(amountRaw)) ? Number(amountRaw) : null;
  if (!invoice || !status) return NextResponse.json({ received: true });
  // SNAP code "00" = success.
  const result = await applyDokuNotification(invoice, status === '00' ? 'SUCCESS' : status, amount);
  log({ level: 'info', event: 'payment.doku_notify', details: { invoice, status, result } });
  return NextResponse.json({ received: true, result });
}
