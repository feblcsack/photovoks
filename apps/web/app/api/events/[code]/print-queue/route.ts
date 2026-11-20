/**
 * GET   /api/events/[code]/print-queue          → active + recent jobs with print-ready URLs
 * PATCH /api/events/[code]/print-queue { jobId, action }
 *   action: 'claim'    queued → printing   (operator is printing it from this browser)
 *           'printed'  → printed           (increments session print_count)
 *           'failed'   → failed
 *           'requeue'  failed/cancelled/printing → queued
 *           'cancel'   queued → cancelled
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { isPrintStationOnline } from '@/lib/sessions';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const supabase = createServerClient();

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: jobs } = await supabase
    .from('print_jobs')
    .select('id, session_id, type, status, copies, paper, source, asset_path, error_reason, created_at, updated_at, sessions(token, created_at, frames(name))')
    .eq('event_id', access.event.id)
    .not('asset_path', 'is', null)
    .or(`status.in.(queued,printing,failed),created_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(100);

  const bySessionBucket = (jobs ?? []).filter((j) => j.asset_path?.startsWith('sessions/')).map((j) => j.asset_path as string);
  const bySketchBucket = (jobs ?? []).filter((j) => j.asset_path?.startsWith('sketches/')).map((j) => j.asset_path as string);
  const [a, b, online] = await Promise.all([
    bySessionBucket.length ? supabase.storage.from('sessions').createSignedUrls(bySessionBucket, 3600) : Promise.resolve({ data: [] }),
    bySketchBucket.length ? supabase.storage.from('sketches').createSignedUrls(bySketchBucket, 3600) : Promise.resolve({ data: [] }),
    isPrintStationOnline(supabase),
  ]);
  const urls = new Map<string, string>();
  for (const e of [...(a.data ?? []), ...(b.data ?? [])]) if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);

  return NextResponse.json(
    {
      workerOnline: online,
      printMode: access.event.printMode,
      paper: access.event.printPaper,
      jobs: (jobs ?? []).map((j) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = j.sessions as any;
        return {
          id: j.id,
          sessionId: j.session_id,
          sessionToken: s?.token ?? null,
          sessionCreatedAt: s?.created_at ?? null,
          frameName: s?.frames?.name ?? null,
          type: j.type,
          status: j.status,
          copies: j.copies,
          paper: j.paper,
          source: j.source,
          errorReason: j.error_reason,
          createdAt: j.created_at,
          updatedAt: j.updated_at,
          url: j.asset_path ? urls.get(j.asset_path) ?? null : null,
        };
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  claim: { from: ['queued'], to: 'printing' },
  printed: { from: ['queued', 'printing', 'failed'], to: 'printed' },
  failed: { from: ['queued', 'printing'], to: 'failed' },
  requeue: { from: ['failed', 'cancelled', 'printing', 'printed'], to: 'queued' },
  cancel: { from: ['queued', 'failed'], to: 'cancelled' },
};

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const body = await readJson(request);
  const action = typeof body?.action === 'string' ? body.action : '';
  const t = TRANSITIONS[action];
  if (!t || !isUuid(body?.jobId)) return jsonError('Aksi tidak valid', 400);

  const supabase = createServerClient();
  const { data: job } = await supabase
    .from('print_jobs')
    .update({ status: t.to, error_reason: action === 'failed' ? 'operator_marked_failed' : null, station_id: 'browser' })
    .eq('id', body!.jobId as string)
    .eq('event_id', access.event.id)
    .in('status', t.from)
    .select('id, session_id, copies, type')
    .maybeSingle();
  if (!job) return jsonError('Status job sudah berubah — muat ulang antrean', 409);

  if (t.to === 'printed') {
    const { data: s } = await supabase.from('sessions').select('print_count').eq('id', job.session_id).maybeSingle();
    await supabase
      .from('sessions')
      .update({ print_count: (s?.print_count ?? 0) + (job.copies ?? 1), status: 'printed' })
      .eq('id', job.session_id);
  }
  return NextResponse.json({ ok: true, status: t.to });
}
