/**
 * GET /api/events/[code]/booth  (event PIN or admin)
 *
 * Everything a booth device needs: event config + active frames with
 * resolved (signed) asset URLs + AI availability.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/access';
import { framesForEvent } from '@/lib/frames/server';
import { isAiConfigured } from '@/lib/ai/provider';
import { isPrintStationOnline } from '@/lib/sessions';
import { signMedia } from '@/lib/event-media';

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const supabase = createServerClient();
  const ev = access.event;
  const [frames, online, urls] = await Promise.all([
    framesForEvent(supabase, ev.id, true, true),
    isPrintStationOnline(supabase),
    signMedia(supabase, ev.attractMediaPath ? [ev.attractMediaPath] : [], 24 * 3600),
  ]);
  const media = { attractUrl: ev.attractMediaPath ? urls.get(ev.attractMediaPath) ?? null : null };
  return NextResponse.json(
    { event: ev, role: access.role, frames, aiConfigured: isAiConfigured(), printStationOnline: online, media },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
