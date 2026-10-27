/**
 * Admin Dashboard — /admin/dashboard
 *
 * Server Component: fetches initial data (heartbeat, job counts, active session,
 * active event, all events for the switch dropdown) and passes to DashboardClient.
 *
 * Protected by the admin JWT middleware (cookie 'admin_token').
 * Uses plain/clean admin styling, not doodle style (Requirement 17.2).
 *
 * Requirements: 9.11, 11.6
 */
export const dynamic = 'force-dynamic';

import React from 'react';
import { createServerClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;
const TERMINAL_SESSION_STATUSES = ['completed', 'abandoned', 'failed'] as const;

interface DbEvent {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
}

export default async function DashboardPage() {
  const supabase = createServerClient();

  // Fetch all data needed for initial render in parallel
  const [heartbeatResult, jobCountsResult, activeSessionResult, eventsResult] =
    await Promise.all([
      supabase
        .from('print_station_heartbeat')
        .select('last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase.from('print_jobs').select('status'),

      supabase
        .from('sessions')
        .select('id, status, created_at')
        .not('status', 'in', `(${TERMINAL_SESSION_STATUSES.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('events')
        .select('id, name, status')
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
    ]);

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  const lastHeartbeatAt = heartbeatResult.data?.last_seen_at ?? null;
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const printStationOnline = lastHeartbeatAt
    ? now - new Date(lastHeartbeatAt).getTime() < HEARTBEAT_ONLINE_THRESHOLD_MS
    : false;

  // ── Job counts ─────────────────────────────────────────────────────────────
  const jobRows = jobCountsResult.data ?? [];
  const jobCounts = { queued: 0, printing: 0, printed: 0, failed: 0, cancelled: 0 };
  for (const row of jobRows) {
    const s = row.status as keyof typeof jobCounts;
    if (s in jobCounts) jobCounts[s] += 1;
  }

  // ── Active session + event ─────────────────────────────────────────────────
  const activeSession = activeSessionResult.data ?? null;
  const events: DbEvent[] = (eventsResult.data as DbEvent[]) ?? [];
  const activeEvent = events.find((e) => e.status === 'active') ?? null;

  const initialData = {
    printStation: { isOnline: printStationOnline, lastHeartbeatAt },
    jobCounts,
    activeSession,
    activeEvent,
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pantau status print station, antrian cetak, dan sesi booth.
        </p>
      </div>

      <DashboardClient initialData={initialData} events={events} />
    </div>
  );
}
