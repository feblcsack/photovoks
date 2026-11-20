/**
 * PATCH  /api/events/[code]/sessions/[id] { hidden?: boolean }  → hide from shared galleries
 * DELETE /api/events/[code]/sessions/[id]                       → delete session + files
 * POST   /api/events/[code]/sessions/[id] { type, aiId?, copies } → queue a (re)print
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { deleteSessionFiles } from '@/lib/sessions';
import { enqueuePrint } from '@/lib/print/server';
import { log } from '@/lib/logger';

type Ctx = { params: Promise<{ code: string; sessionId: string }> };

async function guard(ctx: Ctx) {
  const { code, sessionId } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return { response: access.response } as const;
  if (!isUuid(sessionId)) return { response: jsonError('Sesi tidak ditemukan', 404) } as const;
  const supabase = createServerClient();
  const { data } = await supabase.from('sessions').select('id, event_id').eq('id', sessionId).maybeSingle();
  if (!data || data.event_id !== access.event.id) return { response: jsonError('Sesi tidak ditemukan', 404) } as const;
  return { access, supabase, sessionId } as const;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ('response' in g) return g.response;
  const body = await readJson(request);
  if (typeof body?.hidden !== 'boolean') return jsonError('hidden wajib boolean', 400);
  await g.supabase.from('sessions').update({ is_hidden: body.hidden }).eq('id', g.sessionId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ('response' in g) return g.response;
  await deleteSessionFiles(g.supabase, g.sessionId);
  await g.supabase.from('sessions').delete().eq('id', g.sessionId);
  log({ level: 'info', event: 'session.deleted', sessionId: g.sessionId, details: { by: g.access.role } });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if ('response' in g) return g.response;
  const body = (await readJson(request)) ?? {};
  const type = body.type === 'ai' ? 'ai' : 'strip';
  if (type === 'ai' && !isUuid(body.aiId)) return jsonError('aiId wajib', 400);
  const copies = Number.isInteger(body.copies) ? Math.min(10, Math.max(1, body.copies as number)) : 1;
  const result = await enqueuePrint(g.supabase, {
    sessionId: g.sessionId,
    eventId: g.access.event.id,
    type,
    copies,
    source: g.access.role === 'admin' ? 'admin' : 'station',
    paper: g.access.event.printPaper,
    aiGenerationId: type === 'ai' ? (body.aiId as string) : undefined,
  });
  if ('error' in result) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true, printJobId: result.id });
}
