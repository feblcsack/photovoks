/**
 * Payments (SERVER ONLY): QRIS through Aulaa, or cash confirmed by an
 * operator/admin. A payment is created BEFORE the paid thing happens (photo
 * session, AI generation) and is "consumed" exactly once when it happens.
 *
 * Flow:
 *   booth/guest  POST /api/payments            → pending payment (+ QRIS link)
 *   QRIS         webhook / status check        → paid
 *   cash         operator approves in portal   → approved
 *   booth/guest  GET /api/payments/<token>     → polls until paid/approved
 *   then         POST /api/sessions | /ai with paymentToken → consumed
 */
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { log } from '@/lib/logger';
import type { EventConfig } from '@/lib/events';
import { aulaaConfigured, cancelAulaaPayment, createAulaaPayment, getAulaaPayment, type AulaaStatus } from './aulaa';
import { PAID_STATUSES, type PaymentAdminView, type PaymentMethod, type PaymentPurpose, type PaymentRequirement, type PaymentStatus, type PaymentView } from './types';

export * from './types';

const PAYMENT_COLUMNS =
  'id, event_id, session_id, purpose, amount, method, status, order_id, short_code, token, provider_id, payment_link, expires_at, paid_at, decided_by, consumed_at, meta, created_at, updated_at';

export const PAYMENT_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
const CODE_ALPHABET = 'ACDEFHJKMNPRTUVWXY34679';

/** What a guest must pay for `purpose` at this event right now. */
export async function paymentRequirement(event: EventConfig, purpose: PaymentPurpose): Promise<PaymentRequirement> {
  const { payments } = await getSettings();
  const amount = purpose === 'session' ? event.sessionPrice : event.aiPrice;
  const methods: PaymentMethod[] = [];
  if ((event.paymentMode === 'qris' || event.paymentMode === 'both') && aulaaConfigured()) methods.push('qris');
  if (event.paymentMode === 'cash' || event.paymentMode === 'both') methods.push('cash');
  // QRIS-only event but Aulaa not configured: fall back to cash so the booth never dead-ends.
  if (event.paymentMode === 'qris' && !methods.length) methods.push('cash');
  const required = payments.enabled && event.paymentMode !== 'off' && amount > 0 && methods.length > 0;
  return { required, amount: required ? amount : 0, methods: required ? methods : [] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toView(r: any): PaymentView {
  const status = r.status as PaymentStatus;
  return {
    token: r.token,
    purpose: r.purpose,
    method: r.method,
    amount: r.amount,
    status,
    shortCode: r.short_code,
    paymentLink: r.payment_link ?? null,
    expiresAt: r.expires_at ?? null,
    paidAt: r.paid_at ?? null,
    consumed: Boolean(r.consumed_at),
    usable: PAID_STATUSES.includes(status) && !r.consumed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAdminView(r: any): PaymentAdminView {
  return {
    ...toView(r),
    id: r.id,
    eventId: r.event_id,
    eventName: r.events?.name,
    eventCode: r.events?.code,
    orderId: r.order_id,
    decidedBy: r.decided_by ?? null,
    createdAt: r.created_at,
    sessionId: r.session_id ?? null,
  };
}

function shortCode(): string {
  return Array.from(randomBytes(4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export interface CreatePaymentInput {
  event: EventConfig;
  purpose: PaymentPurpose;
  method: PaymentMethod;
  sessionId?: string | null;
  /** Free pass issued by an operator (cash, amount 0, already approved). */
  operatorFree?: { by: string };
  origin?: string;
}

export async function createPayment(input: CreatePaymentInput): Promise<{ payment: PaymentView } | { error: string; status: number }> {
  const supabase = createServerClient();
  const { payments } = await getSettings();
  const req = await paymentRequirement(input.event, input.purpose);
  if (!input.operatorFree) {
    if (!req.required) return { error: 'Tidak perlu bayar', status: 400 };
    if (!req.methods.includes(input.method)) return { error: 'Metode pembayaran tidak tersedia', status: 400 };
  }
  const token = randomBytes(18).toString('base64url');
  const orderId = `PV-${input.event.code}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + payments.expiryMinutes * 60_000);
  const free = input.operatorFree;

  const { data: row, error } = await supabase
    .from('payments')
    .insert({
      event_id: input.event.id,
      session_id: input.sessionId ?? null,
      purpose: input.purpose,
      amount: free ? 0 : req.amount,
      method: free ? 'cash' : input.method,
      status: free ? 'approved' : 'pending',
      order_id: orderId,
      short_code: shortCode(),
      token,
      provider: input.method === 'qris' && !free ? 'aulaa' : null,
      expires_at: expiresAt.toISOString(),
      ...(free ? { decided_by: free.by, paid_at: new Date().toISOString(), meta: { free: true } } : {}),
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error || !row) {
    log({ level: 'error', event: 'payment.create_failed', details: { error: error?.message } });
    return { error: error?.message?.includes('payments') ? 'Tabel pembayaran belum ada — jalankan migrasi v5.' : 'Gagal membuat pembayaran', status: 500 };
  }

  if (input.method === 'qris' && !free) {
    try {
      const ap = await createAulaaPayment({ orderId, amount: req.amount, expiresAt });
      const { data: updated } = await supabase
        .from('payments')
        .update({ provider_id: ap.id, payment_link: ap.payment_link, meta: { is_test: !!ap.is_test, charged: ap.charged_amount ?? null } })
        .eq('id', row.id)
        .select(PAYMENT_COLUMNS)
        .single();
      return { payment: toView(updated ?? row) };
    } catch (e) {
      await supabase.from('payments').update({ status: 'failed', meta: { error: e instanceof Error ? e.message : 'aulaa' } }).eq('id', row.id);
      log({ level: 'error', event: 'payment.qris_failed', details: { error: e instanceof Error ? e.message : String(e) } });
      return { error: e instanceof Error ? e.message : 'QRIS tidak tersedia', status: 502 };
    }
  }
  log({ level: 'info', event: 'payment.created', details: { id: row.id, method: row.method, purpose: row.purpose, amount: row.amount } });
  return { payment: toView(row) };
}

const lastProviderCheck = new Map<string, number>();

function mapAulaa(s: AulaaStatus): PaymentStatus {
  return s === 'paid' ? 'paid' : s === 'expired' ? 'expired' : s === 'cancelled' ? 'cancelled' : s === 'failed' || s === 'refunded' ? 'failed' : 'pending';
}

/**
 * Loads a payment by its public token. Pending QRIS payments are reconciled
 * with Aulaa (at most every 4 s per payment — Aulaa allows 30/min); pending
 * ones past their expiry are expired.
 */
export async function paymentByToken(token: string): Promise<PaymentView | null> {
  if (!PAYMENT_TOKEN_RE.test(token)) return null;
  const supabase = createServerClient();
  const { data: row } = await supabase.from('payments').select(PAYMENT_COLUMNS).eq('token', token).maybeSingle();
  if (!row) return null;
  if (row.status !== 'pending') return toView(row);

  if (row.method === 'qris' && row.provider_id && Date.now() - (lastProviderCheck.get(row.id) ?? 0) > 4000) {
    lastProviderCheck.set(row.id, Date.now());
    if (lastProviderCheck.size > 2000) lastProviderCheck.clear();
    try {
      const ap = await getAulaaPayment(row.provider_id);
      const next = mapAulaa(ap.status);
      if (next !== 'pending') {
        const updated = await setStatus(supabase, row.id, 'pending', next, { paid_at: ap.paid_at ?? (next === 'paid' ? new Date().toISOString() : null), decided_by: 'aulaa' });
        if (updated) return toView(updated);
      }
    } catch {
      /* provider hiccup — keep pending, the webhook may still arrive */
    }
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now() - 30_000) {
    const updated = await setStatus(supabase, row.id, 'pending', 'expired', {});
    if (updated) return toView(updated);
  }
  return toView(row);
}

async function setStatus(supabase: SupabaseClient, id: string, from: PaymentStatus, to: PaymentStatus, extra: Record<string, unknown>) {
  const { data } = await supabase.from('payments').update({ status: to, ...extra }).eq('id', id).eq('status', from).select(PAYMENT_COLUMNS).maybeSingle();
  if (data) log({ level: 'info', event: 'payment.status', details: { id, from, to } });
  return data;
}

/** Webhook: marks an Aulaa order paid/expired (idempotent, amount checked). */
export async function applyAulaaWebhook(orderId: string, status: AulaaStatus, amount: number, paidAt: string | null): Promise<'ok' | 'unknown' | 'mismatch'> {
  const supabase = createServerClient();
  const { data: row } = await supabase.from('payments').select('id, amount, status').eq('order_id', orderId).maybeSingle();
  if (!row) return 'unknown';
  if (status === 'paid' && Math.round(amount) !== row.amount) {
    log({ level: 'warn', event: 'payment.amount_mismatch', details: { orderId, expected: row.amount, got: amount } });
    return 'mismatch';
  }
  const next = mapAulaa(status);
  if (next !== 'pending' && row.status === 'pending') await setStatus(supabase, row.id, 'pending', next, { paid_at: paidAt ?? (next === 'paid' ? new Date().toISOString() : null), decided_by: 'aulaa' });
  return 'ok';
}

/** Guest/booth cancels its own pending payment. */
export async function cancelPayment(token: string): Promise<boolean> {
  if (!PAYMENT_TOKEN_RE.test(token)) return false;
  const supabase = createServerClient();
  const { data: row } = await supabase.from('payments').select('id, provider_id, status').eq('token', token).maybeSingle();
  if (!row || row.status !== 'pending') return false;
  await setStatus(supabase, row.id, 'pending', 'cancelled', {});
  if (row.provider_id) await cancelAulaaPayment(row.provider_id);
  return true;
}

/** Operator decision on a cash (or stuck QRIS) payment. */
export async function decidePayment(id: string, eventId: string | null, action: 'approve' | 'decline', by: string): Promise<PaymentAdminView | null> {
  const supabase = createServerClient();
  let q = supabase
    .from('payments')
    .update(action === 'approve' ? { status: 'approved', decided_by: by, paid_at: new Date().toISOString() } : { status: 'declined', decided_by: by })
    .eq('id', id)
    .eq('status', 'pending');
  if (eventId) q = q.eq('event_id', eventId);
  const { data } = await q.select(`${PAYMENT_COLUMNS}, events(name, code)`).maybeSingle();
  if (data) log({ level: 'info', event: `payment.${action}d`, details: { id, by } });
  return data ? toAdminView(data) : null;
}

/**
 * Atomically marks a paid payment as used. Returns the payment id, or an
 * error message for the guest.
 */
export async function consumePayment(token: unknown, check: { eventId: string; purpose: PaymentPurpose; sessionId?: string }): Promise<{ id: string } | { error: string }> {
  if (typeof token !== 'string' || !PAYMENT_TOKEN_RE.test(token)) return { error: 'Pembayaran diperlukan' };
  const current = await paymentByToken(token); // reconciles a QRIS payment that just went through
  if (!current) return { error: 'Pembayaran tidak ditemukan' };
  if (!current.usable) return { error: current.consumed ? 'Pembayaran ini sudah dipakai' : 'Pembayaran belum lunas' };
  const supabase = createServerClient();
  const { data } = await supabase
    .from('payments')
    .update({ consumed_at: new Date().toISOString(), ...(check.sessionId ? { session_id: check.sessionId } : {}) })
    .eq('token', token)
    .eq('event_id', check.eventId)
    .eq('purpose', check.purpose)
    .in('status', ['paid', 'approved'])
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  return data ? { id: data.id as string } : { error: 'Pembayaran tidak berlaku untuk ini' };
}

/** Gives a consumed payment back (the paid action failed to start). */
export async function releasePayment(id: string) {
  await createServerClient().from('payments').update({ consumed_at: null }).eq('id', id);
}

export async function listPayments(opts: { eventId?: string; limit?: number; status?: PaymentStatus | 'active' }): Promise<{ ok: boolean; payments: PaymentAdminView[] }> {
  let q = createServerClient()
    .from('payments')
    .select(`${PAYMENT_COLUMNS}, events(name, code)`)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, opts.limit ?? 60));
  if (opts.eventId) q = q.eq('event_id', opts.eventId);
  if (opts.status === 'active') q = q.eq('status', 'pending');
  else if (opts.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) return { ok: false, payments: [] };
  return { ok: true, payments: (data ?? []).map(toAdminView) };
}

/** Totals for the dashboard (today). */
export async function paymentTotals(eventId?: string): Promise<{ revenue: number; paidCount: number; pending: number }> {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  let q = createServerClient().from('payments').select('amount, status').gte('created_at', day.toISOString()).limit(5000);
  if (eventId) q = q.eq('event_id', eventId);
  const { data, error } = await q;
  if (error) return { revenue: 0, paidCount: 0, pending: 0 };
  const paid = (data ?? []).filter((p) => PAID_STATUSES.includes(p.status as PaymentStatus));
  return { revenue: paid.reduce((s, p) => s + (p.amount ?? 0), 0), paidCount: paid.length, pending: (data ?? []).filter((p) => p.status === 'pending').length };
}
