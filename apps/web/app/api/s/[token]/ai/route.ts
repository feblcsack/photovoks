/**
 * POST /api/s/[token]/ai  { styleId, shotIndex, prompt?, retryId? }
 *   styleId 'prompt' = the guest's own text (event.aiGuestPrompt).
 *
 * Starts an AI generation for one photo of the session. Work runs in the
 * background (`after()`); the client polls GET /api/s/[token].
 * Limits: event must allow AI + style, ai_per_session results per session,
 * daily cap per event (checked in the processor).
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGuest } from '@/lib/guest-guard';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { buildGuestPrompt, cleanGuestPrompt, CUSTOM_STYLE_ID, GUEST_PROMPT_ID, styleById } from '@/lib/ai/styles';
import { getProvider, isAiConfigured } from '@/lib/ai/provider';
import { processAiGeneration } from '@/lib/ai/process';
import { log } from '@/lib/logger';
import { getSettings } from '@/lib/settings';
import { consumePayment, paymentRequirement, releasePayment } from '@/lib/payments';

export const maxDuration = 60;
const MAX_ATTEMPTS = 3;

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  const { session, event } = guest;

  if (!event.aiEnabled) return jsonError('Gaya AI tidak aktif untuk event ini', 403);
  if (!(await getSettings()).ai.enabled) return jsonError('Gaya AI sedang dimatikan oleh admin', 403);
  if (!isAiConfigured()) return jsonError('AI belum dikonfigurasi di server (OPENROUTER_API_KEY kosong).', 503);

  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const supabase = createServerClient();

  // ── Retry a failed generation ─────────────────────────────────────────────
  if (body.retryId !== undefined) {
    if (!isUuid(body.retryId)) return jsonError('retryId tidak valid', 400);
    const { data: gen } = await supabase
      .from('ai_generations')
      .select('id, session_id, status, attempts')
      .eq('id', body.retryId)
      .maybeSingle();
    if (!gen || gen.session_id !== session.id) return jsonError('Tidak ditemukan', 404);
    if (gen.status !== 'failed') return NextResponse.json({ id: gen.id, status: gen.status });
    if (gen.attempts >= MAX_ATTEMPTS) return jsonError('Batas percobaan ulang tercapai', 429);
    const { data: reset } = await supabase
      .from('ai_generations')
      .update({ status: 'pending', error_reason: null })
      .eq('id', gen.id)
      .eq('status', 'failed')
      .select('id')
      .maybeSingle();
    if (reset) after(() => processAiGeneration(gen.id));
    return NextResponse.json({ id: gen.id, status: 'pending' });
  }

  // ── New generation ────────────────────────────────────────────────────────
  const styleId = typeof body.styleId === 'string' ? body.styleId : '';
  const shotIndex = Number(body.shotIndex ?? 0);
  if (!Number.isInteger(shotIndex) || shotIndex < 0 || shotIndex >= session.shot_count) return jsonError('Foto tidak valid', 400);
  const isGuestPrompt = styleId === GUEST_PROMPT_ID;
  if (isGuestPrompt ? !event.aiGuestPrompt : !event.aiStyles.includes(styleId)) return jsonError('Gaya tidak tersedia', 400);

  let prompt: string | null = null;
  if (isGuestPrompt) {
    const text = cleanGuestPrompt(body.prompt);
    if (!text) return jsonError('Tulis permintaan 3–300 karakter', 400);
    prompt = buildGuestPrompt(text);
  } else if (styleId === CUSTOM_STYLE_ID) {
    if (event.activePromptTemplateId) {
      const { data: tpl } = await supabase.from('prompt_templates').select('content').eq('id', event.activePromptTemplateId).maybeSingle();
      prompt = (tpl?.content as string) ?? null;
    }
  } else {
    prompt = styleById(styleId)?.prompt ?? null;
  }
  if (!prompt) return jsonError('Gaya tidak tersedia', 400);

  const { data: existing } = await supabase
    .from('ai_generations')
    .select('id, style_id, shot_index, status, prompt')
    .eq('session_id', session.id);
  const same = (existing ?? []).find((g) => g.style_id === styleId && g.shot_index === shotIndex && g.prompt === prompt && g.status !== 'failed' && g.status !== 'failed_safety');
  if (same) return NextResponse.json({ id: same.id, status: same.status });
  // Paid AI (e.g. Rp 1.500 per image): every generation needs its own payment;
  // the per-session cap only applies to free AI.
  const payReq = await paymentRequirement(event, 'ai');
  const used = (existing ?? []).filter((g) => g.status !== 'failed' && g.status !== 'failed_safety').length;
  if (!payReq.required && guest.role === null && used >= event.aiPerSession) {
    return jsonError(`Maksimal ${event.aiPerSession} hasil AI per sesi`, 429);
  }
  let paymentId: string | null = null;
  if (payReq.required) {
    const paid = await consumePayment(body.paymentToken, { eventId: event.id, purpose: 'ai', sessionId: session.id });
    if ('error' in paid) return jsonError(paid.error, 402, { payment: payReq });
    paymentId = paid.id;
  }

  const provider = getProvider();
  const { data: created, error } = await supabase
    .from('ai_generations')
    .insert({ session_id: session.id, shot_index: shotIndex, style_id: styleId, prompt, provider: provider.id, model: provider.model(), ...(paymentId ? { payment_id: paymentId } : {}) })
    .select('id')
    .single();
  if (error || !created) {
    if (paymentId) await releasePayment(paymentId);
    return jsonError('Gagal memulai AI', 500);
  }

  log({ level: 'info', event: 'ai.requested', sessionId: session.id, details: { generationId: created.id, styleId } });
  after(() => processAiGeneration(created.id));
  return NextResponse.json({ id: created.id, status: 'pending' }, { status: 202 });
}
