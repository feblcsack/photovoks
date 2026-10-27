/**
 * GET /api/admin/status
 *
 * Returns the print station online status and last heartbeat timestamp.
 * Used by the session page to poll whether the print station is available
 * for sketch print requests.
 *
 * No authentication required — only exposes a boolean online status and
 * a timestamp. No sensitive data is returned.
 *
 * Response: { printStationOnline: boolean, lastHeartbeatAt: string | null }
 *
 * Requirements: 8.8, 9.11
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/** Station is considered online if heartbeat is fresher than this threshold. */
const HEARTBEAT_ONLINE_THRESHOLD_MS = 90_000;

export async function GET(): Promise<NextResponse> {
  const supabase = createServerClient();

  const { data: heartbeat } = await supabase
    .from('print_station_heartbeat')
    .select('last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let printStationOnline = false;
  const lastHeartbeatAt = heartbeat?.last_seen_at ?? null;

  if (lastHeartbeatAt) {
    const lastSeenMs = new Date(lastHeartbeatAt).getTime();
    printStationOnline = Date.now() - lastSeenMs < HEARTBEAT_ONLINE_THRESHOLD_MS;
  }

  return NextResponse.json({ printStationOnline, lastHeartbeatAt });
}
