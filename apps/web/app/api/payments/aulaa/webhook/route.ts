/**
 * POST /api/payments/aulaa/webhook — Aulaa payment notifications.
 * Set this URL as the project's callback in the Aulaa dashboard:
 *   https://<domain>/api/payments/aulaa/webhook
 * Verified with X-Webhook-Signature (HMAC-SHA256 of the raw body).
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyAulaaSignature, type AulaaStatus } from '@/lib/payments/aulaa';
import { applyAulaaWebhook } from '@/lib/payments';
import { log } from '@/lib/logger';

const STATUSES: AulaaStatus[] = ['pending', 'paid', 'expired', 'cancelled', 'failed', 'refunded'];

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyAulaaSignature(raw, request.headers.get('x-webhook-signature'))) {
    log({ level: 'warn', event: 'payment.webhook_bad_signature' });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }
  const orderId = typeof body.order_id === 'string' ? body.order_id : '';
  const status = STATUSES.includes(body.status as AulaaStatus) ? (body.status as AulaaStatus) : null;
  if (!orderId || !status) return NextResponse.json({ received: true });
  const result = await applyAulaaWebhook(orderId, status, Number(body.amount) || 0, typeof body.paid_at === 'string' ? body.paid_at : null);
  log({ level: 'info', event: 'payment.webhook', details: { orderId, status, result } });
  // Always 2xx for known/unknown orders so Aulaa stops retrying; mismatches are logged.
  return NextResponse.json({ received: true, result });
}
