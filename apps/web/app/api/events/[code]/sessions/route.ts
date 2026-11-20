/**
 * GET /api/events/[code]/sessions?range=today|week|month|all&status=&offset=&limit=
 * Event managers only. Returns session summaries (with tokens) + stats.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { buildSummaries, SESSION_COLUMNS } from '@/lib/sessions';

type Ctx = { params: Promise<{ code: string }> };

function rangeStart(range: string | null): string | null {
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === 'week') return new Date(Date.now() - 7 * 86_400_000).toISOString();
  if (range === 'month') return new Date(Date.now() - 30 * 86_400_000).toISOString();
  return null;
}

const VISIBLE_STATUSES = ['composed', 'printing', 'printed', 'completed', 'failed'];

export async function GET(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;

  const sp = request.nextUrl.searchParams;
  const limit = Math.min(60, Math.max(1, Number(sp.get('limit')) || 24));
  const offset = Math.max(0, Number(sp.get('offset')) || 0);
  const since = rangeStart(sp.get('range'));
  const status = sp.get('status');

  const supabase = createServerClient();
  let q = supabase
    .from('sessions')
    .select(SESSION_COLUMNS, { count: 'exact' })
    .eq('event_id', access.event.id)
    .in('status', status && VISIBLE_STATUSES.includes(status) ? [status] : VISIBLE_STATUSES)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (since) q = q.gte('created_at', since);
  if (sp.get('hidden') === 'only') q = q.eq('is_hidden', true);

  const { data: rows, count, error } = await q;
  if (error) return NextResponse.json({ error: 'Gagal memuat sesi' }, { status: 500 });

  let statsQ = supabase.from('sessions').select('print_count, status').eq('event_id', access.event.id).in('status', VISIBLE_STATUSES);
  if (since) statsQ = statsQ.gte('created_at', since);
  let aiQ = supabase
    .from('ai_generations')
    .select('id, sessions!inner(event_id)', { count: 'exact', head: true })
    .eq('status', 'done')
    .eq('sessions.event_id', access.event.id);
  if (since) aiQ = aiQ.gte('created_at', since);
  const [{ data: statRows }, { count: aiCount }] = await Promise.all([statsQ.limit(10000), aiQ]);

  const sessions = await buildSummaries(supabase, rows ?? [], { withToken: true, withPrintJobs: true });
  const stats = {
    sessions: statRows?.length ?? 0,
    prints: (statRows ?? []).reduce((s, r) => s + (r.print_count ?? 0), 0),
    printedSessions: (statRows ?? []).filter((r) => r.status === 'printed' || r.status === 'completed').length,
    ai: aiCount ?? 0,
  };
  const total = count ?? 0;
  return NextResponse.json({ sessions, total, nextOffset: offset + limit < total ? offset + limit : null, stats });
}
