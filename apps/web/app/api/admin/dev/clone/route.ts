/**
 * POST /api/admin/dev/clone { includeSessions } — copies events, frames,
 * prompts, settings, sticker library (+ optionally sessions) from the active
 * database to the other profile. The target must already have the schema
 * (paste `pnpm db:sql` into its SQL editor first).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { cloneDatabase } from '@/lib/devtools';
import { activeDbProfile } from '@/lib/supabase/server';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  try {
    return NextResponse.json(await cloneDatabase({ to: activeDbProfile() === 'primary' ? 'secondary' : 'primary', includeSessions: body?.includeSessions === true }));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal', 500);
  }
}
