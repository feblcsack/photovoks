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

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { code } = await ctx.params;
  const access = await requireEventAccess(code);
  if (!access.ok) return access.response;
  const supabase = createServerClient();
  const [frames, online] = await Promise.all([
    framesForEvent(supabase, access.event.id, true),
    isPrintStationOnline(supabase),
  ]);
  return NextResponse.json(
    { event: access.event, role: access.role, frames, aiConfigured: isAiConfigured(), printStationOnline: online },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
