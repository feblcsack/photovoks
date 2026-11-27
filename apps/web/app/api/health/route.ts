/**
 * GET /api/health — public, minimal health check for uptime monitors
 * (UptimeRobot, Better Stack, cron-job.org…). No secrets, cached 30 s.
 * 200 = database reachable, 503 = not (page an operator / flip DB_ACTIVE).
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';

export async function GET() {
  const t = Date.now();
  let db = false;
  try {
    const { error } = await createServerClient().from('events').select('id', { head: true }).limit(1);
    db = !error;
  } catch {
    db = false;
  }
  const { maintenance } = await getSettings();
  const body = { ok: db, db, maintenance: maintenance.enabled, ms: Date.now() - t, at: new Date().toISOString() };
  return NextResponse.json(body, { status: db ? 200 : 503, headers: { 'Cache-Control': 'public, max-age=15, s-maxage=30' } });
}
