/**
 * GET   /api/events/[code]   → event settings (event PIN or admin)
 * PATCH /api/events/[code]   → update settings (event PIN or admin)
 *
 * Code / PIN changes and deletion are admin-only (see /api/admin/events/[id]).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { buildEventUpdate, EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { readJson, jsonError } from '@/lib/http';
import { log } from '@/lib/logger';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  return NextResponse.json({ event: access.event, role: access.role });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;

  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const built = buildEventUpdate(body);
  if ('error' in built) return jsonError(built.error, 400);
  if (!Object.keys(built.update).length) return NextResponse.json({ event: access.event });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('events')
    .update(built.update)
    .eq('id', access.event.id)
    .select(EVENT_COLUMNS)
    .single();
  if (error || !data) return jsonError('Gagal menyimpan pengaturan', 500);

  log({ level: 'info', event: 'event.updated', details: { eventId: access.event.id, by: access.role, fields: Object.keys(built.update) } });
  return NextResponse.json({ event: mapEvent(data) });
}
