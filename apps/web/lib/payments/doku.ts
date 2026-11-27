/**
 * DOKU Checkout client (SERVER ONLY) — hosted payment page, non-SNAP API.
 * Docs: https://developers.doku.com/accept-payments/doku-checkout
 *
 *   POST /checkout/v1/payment            → response.payment.url (+ token_id)
 *   GET  /orders/v1/status/{invoice}     → transaction.status
 *   HTTP Notification → POST /api/payments/doku/notify (set in DOKU Back Office)
 *
 * Every request/notification is signed:
 *   Signature: HMACSHA256=base64(HMAC_SHA256(secret,
 *     "Client-Id:…\nRequest-Id:…\nRequest-Timestamp:…\nRequest-Target:<path>[\nDigest:base64(sha256(body))]"))
 *
 * Env: DOKU_CLIENT_ID, DOKU_SECRET_KEY, DOKU_ENV=sandbox|production (default sandbox),
 *      DOKU_ALL_METHODS=1 to offer every activated method instead of QRIS only.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const DOKU_NOTIFY_PATH = '/api/payments/doku/notify';

export function dokuConfigured(): boolean {
  return Boolean(process.env.DOKU_CLIENT_ID && process.env.DOKU_SECRET_KEY);
}

export function dokuIsProduction(): boolean {
  return process.env.DOKU_ENV === 'production';
}

const base = () => (dokuIsProduction() ? 'https://api.doku.com' : 'https://api-sandbox.doku.com');

/** ISO-8601 UTC without milliseconds, e.g. 2020-08-11T08:45:42Z. */
function timestamp(d = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function dokuSignature(o: { clientId: string; requestId: string; timestamp: string; target: string; body?: string | null; secret: string }): string {
  const lines = [`Client-Id:${o.clientId}`, `Request-Id:${o.requestId}`, `Request-Timestamp:${o.timestamp}`, `Request-Target:${o.target}`];
  if (o.body != null) lines.push(`Digest:${createHash('sha256').update(o.body, 'utf8').digest('base64')}`);
  return `HMACSHA256=${createHmac('sha256', o.secret).update(lines.join('\n')).digest('base64')}`;
}

export class DokuError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', target: string, body?: unknown): Promise<T> {
  const clientId = process.env.DOKU_CLIENT_ID;
  const secret = process.env.DOKU_SECRET_KEY;
  if (!clientId || !secret) throw new DokuError('DOKU belum dikonfigurasi (DOKU_CLIENT_ID / DOKU_SECRET_KEY)', 503);
  const raw = body === undefined ? null : JSON.stringify(body);
  const requestId = randomUUID();
  const ts = timestamp();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${base()}${target}`, {
      method,
      headers: {
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': ts,
        Signature: dokuSignature({ clientId, requestId, timestamp: ts, target, body: raw, secret }),
        ...(raw ? { 'Content-Type': 'application/json' } : {}),
      },
      body: raw ?? undefined,
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON */
    }
    if (!res.ok) {
      const msgs = data.error_messages ?? (data.error as { message?: string } | undefined)?.message ?? data.message;
      throw new DokuError(`DOKU: ${Array.isArray(msgs) ? msgs.join(', ') : msgs ?? `error ${res.status}`}`, res.status);
    }
    return data as T;
  } catch (e) {
    if (e instanceof DokuError) throw e;
    throw new DokuError(e instanceof Error && e.name === 'AbortError' ? 'DOKU tidak merespons' : 'Gagal menghubungi DOKU', 502);
  } finally {
    clearTimeout(timer);
  }
}

export interface DokuCheckout {
  url: string;
  tokenId: string | null;
}

/** Creates a DOKU Checkout page (QRIS only unless DOKU_ALL_METHODS=1). */
export async function createDokuCheckout(input: { invoice: string; amount: number; dueMinutes: number; callbackUrl?: string }): Promise<DokuCheckout> {
  const all = process.env.DOKU_ALL_METHODS === '1';
  const res = await call<{ response?: { payment?: { url?: string; token_id?: string } } }>('POST', '/checkout/v1/payment', {
    order: {
      amount: Math.round(input.amount),
      invoice_number: input.invoice,
      currency: 'IDR',
      auto_redirect: false,
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      // No free text (e.g. line_items names): DOKU rejects characters outside
      // a narrow set, so an event name could break the payment.
    },
    payment: { payment_due_date: Math.max(5, Math.min(1440, Math.round(input.dueMinutes))), ...(all ? {} : { payment_method_types: ['QRIS'] }) },
  });
  const url = res.response?.payment?.url;
  if (!url) throw new DokuError('DOKU tidak mengembalikan link pembayaran', 502);
  return { url, tokenId: res.response?.payment?.token_id ?? null };
}

export type DokuStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'REFUNDED' | 'TIMEOUT' | 'REDIRECT' | string;

export async function getDokuStatus(invoice: string): Promise<{ status: DokuStatus; amount: number | null }> {
  const res = await call<{ transaction?: { status?: string }; order?: { amount?: number | string } }>('GET', `/orders/v1/status/${encodeURIComponent(invoice)}`);
  return { status: (res.transaction?.status ?? 'PENDING').toUpperCase(), amount: res.order?.amount != null ? Number(res.order.amount) : null };
}

/** Verifies an HTTP Notification (Request-Target = OUR notify path). */
export function verifyDokuNotification(headers: Headers, rawBody: string): boolean {
  const clientId = process.env.DOKU_CLIENT_ID;
  const secret = process.env.DOKU_SECRET_KEY;
  const sig = headers.get('signature');
  const requestId = headers.get('request-id');
  const ts = headers.get('request-timestamp');
  if (!clientId || !secret || !sig || !requestId || !ts) return false;
  if (headers.get('client-id') && headers.get('client-id') !== clientId) return false;
  const expected = dokuSignature({ clientId, requestId, timestamp: ts, target: DOKU_NOTIFY_PATH, body: rawBody, secret });
  const a = Buffer.from(sig.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Popup script for the browser (Jokul Checkout). */
export function dokuCheckoutScript(): string {
  return dokuIsProduction() ? 'https://jokul.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js' : 'https://sandbox.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js';
}
