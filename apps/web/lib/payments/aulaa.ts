/**
 * Aulaa (aulaa.co) payment-link API client (SERVER ONLY).
 *
 * Docs: https://aulaa.co/dokumentasi — base https://api.aulaa.co,
 * `Authorization: Bearer <API key>`.
 *   POST /v1/payments              create (order_id, amount, payment_method, expired_at)
 *   GET  /v1/payments/{id}         status: pending | paid | expired | cancelled | failed | refunded
 *   POST /v1/payments/{id}/cancel  cancel a pending payment
 * Webhook: POST to the project callback URL, header X-Webhook-Signature =
 * hex HMAC-SHA256(raw body, webhook secret). Payload has order_id + status.
 *
 * Env: AULAA_API_KEY, AULAA_WEBHOOK_SECRET, optional AULAA_API_BASE.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE = () => (process.env.AULAA_API_BASE || 'https://api.aulaa.co').replace(/\/+$/, '');
export const AULAA_CHECKOUT_ORIGIN = 'https://payment.aulaa.co';

export function aulaaConfigured(): boolean {
  return Boolean(process.env.AULAA_API_KEY);
}

export function aulaaWebhookConfigured(): boolean {
  return Boolean(process.env.AULAA_WEBHOOK_SECRET);
}

export type AulaaStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed' | 'refunded';

export interface AulaaPayment {
  id: string;
  order_id: string;
  status: AulaaStatus;
  amount: number;
  charged_amount?: number;
  fee_amount?: number;
  payment_link: string;
  expired_at?: string | null;
  paid_at?: string | null;
  is_test?: boolean;
}

export class AulaaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly paymentId?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const key = process.env.AULAA_API_KEY;
  if (!key) throw new AulaaError('QRIS belum dikonfigurasi (AULAA_API_KEY kosong)', 503);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      throw new AulaaError(typeof data.error === 'string' ? data.error : `Aulaa error ${res.status}`, res.status, typeof data.payment_id === 'string' ? data.payment_id : undefined);
    }
    return data as T;
  } catch (e) {
    if (e instanceof AulaaError) throw e;
    throw new AulaaError(e instanceof Error && e.name === 'AbortError' ? 'Aulaa tidak merespons' : 'Gagal menghubungi Aulaa', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Creates a QRIS payment. Idempotent on order_id (409 → fetch existing). */
export async function createAulaaPayment(input: { orderId: string; amount: number; expiresAt: Date; redirectUrl?: string }): Promise<AulaaPayment> {
  try {
    return await call<AulaaPayment>('POST', '/v1/payments', {
      order_id: input.orderId,
      amount: Math.round(input.amount),
      payment_method: 'qris',
      expired_at: input.expiresAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
    });
  } catch (e) {
    if (e instanceof AulaaError && e.status === 409 && e.paymentId) return getAulaaPayment(e.paymentId);
    throw e;
  }
}

export function getAulaaPayment(id: string): Promise<AulaaPayment> {
  return call<AulaaPayment>('GET', `/v1/payments/${encodeURIComponent(id)}`);
}

export async function cancelAulaaPayment(id: string): Promise<void> {
  await call('POST', `/v1/payments/${encodeURIComponent(id)}/cancel`).catch(() => undefined);
}

/** Verifies the X-Webhook-Signature header over the raw request body. */
export function verifyAulaaSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.AULAA_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
