/**
 * GET /api/admin/dashboard
 *
 * Returns aggregated dashboard data:
 * - Print station heartbeat status (online/offline, last seen timestamp)
 * - Print job counts grouped by status
 * - Current active session (most recent non-terminal session)
 * - Active event info
 *
 * Protected by admin JWT middleware (cookie 'admin_token').
 * Requirements: 9.11, 11.6
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** Heartbeat threshold: station is online if last heartbeat < 90 s ago. */
const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

/** Session statuses that are considered terminal (session is over). */
const TERMINAL_SESSION_STATUSES = ['completed', 'abandoned', 'failed'] as const;

export async function GET(): Promise<NextResponse> {
  const supabase = createServerClient();

  // Run all independent queries in parallel
  const [heartbeatResult, jobCountsResult, activeSessionResult, activeEventResult] =
    await Promise.all([
      // 1. Latest heartbeat
      supabase
        .from('print_station_heartbeat')
        .select('last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 2. Print job counts by status
      supabase
        .from('print_jobs')
        .select('status'),

      // 3. Most recent non-terminal session
      supabase
        .from('sessions')
        .select('id, status, created_at')
        .not('status', 'in', `(${TERMINAL_SESSION_STATUSES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 4. Active event
      supabase
        .from('events')
        .select('id, name, status')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const lastHeartbeatAt = heartbeatResult.data?.last_seen_at ?? null;
  let printStationOnline = false;
  if (lastHeartbeatAt) {
    printStationOnline =
      Date.now() - new Date(lastHeartbeatAt).getTime() < HEARTBEAT_ONLINE_THRESHOLD_MS;
  }

  // ── Job counts ────────────────────────────────────────────────────────────
  const jobRows = jobCountsResult.data ?? [];
  const jobCounts: Record<string, number> = {
    queued: 0,
    printing: 0,
    printed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of jobRows) {
    const s = row.status as string;
    jobCounts[s] = (jobCounts[s] ?? 0) + 1;
  }

  // ── Active session ────────────────────────────────────────────────────────
  const activeSession = activeSessionResult.data ?? null;

  // ── Active event ──────────────────────────────────────────────────────────
  const activeEvent = activeEventResult.data ?? null;

  return NextResponse.json({
    printStation: {
      isOnline: printStationOnline,
      lastHeartbeatAt,
    },
    jobCounts,
    activeSession,
    activeEvent,
  });
}
