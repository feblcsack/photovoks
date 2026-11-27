/**
 * Usage counters for the developer panel (SERVER ONLY).
 *
 * The /media route records how many bytes it pulled from the origin storage.
 * Because browsers and the CDN cache /media responses, this is close to the
 * real storage egress. Counters are buffered in memory and flushed in one RPC.
 * Silently does nothing before migration v5.
 */
import { createServerClient } from '@/lib/supabase/server';

export type UsageMetric = 'origin_bytes' | 'origin_requests' | 'served_bytes' | 'served_requests' | 'transform_requests';

const buffer = new Map<UsageMetric, number>();

export function trackUsage(metric: UsageMetric, value: number) {
  if (!value) return;
  buffer.set(metric, (buffer.get(metric) ?? 0) + value);
}

/** Flushes buffered counters. Call from `after()` so it never delays a response. */
let lastFlush = 0;
export async function flushUsage(): Promise<void> {
  if (!buffer.size) return;
  // Origin pulls (the real egress) are written right away; cheap "served from
  // this server" counters are batched to at most one write per 15 s.
  if (!buffer.has('origin_bytes') && Date.now() - lastFlush < 15_000) return;
  lastFlush = Date.now();
  const items = Array.from(buffer.entries());
  buffer.clear();
  const supabase = createServerClient();
  await Promise.all(items.map(([metric, value]) => supabase.rpc('bump_usage', { p_metric: metric, p_value: Math.round(value) }).then(() => undefined, () => undefined)));
}

export interface UsageDay {
  day: string;
  originBytes: number;
  originRequests: number;
  servedBytes: number;
  servedRequests: number;
}

/** Last `days` days of counters, oldest first. */
export async function usageHistory(days = 31): Promise<{ ok: boolean; days: UsageDay[] }> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await createServerClient().from('usage_daily').select('day, metric, value').gte('day', since).order('day', { ascending: true });
  if (error) return { ok: false, days: [] };
  const byDay = new Map<string, UsageDay>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(d, { day: d, originBytes: 0, originRequests: 0, servedBytes: 0, servedRequests: 0 });
  }
  for (const r of data ?? []) {
    const d = byDay.get(r.day as string);
    if (!d) continue;
    const v = Number(r.value) || 0;
    if (r.metric === 'origin_bytes') d.originBytes += v;
    else if (r.metric === 'origin_requests') d.originRequests += v;
    else if (r.metric === 'served_bytes') d.servedBytes += v;
    else if (r.metric === 'served_requests') d.servedRequests += v;
  }
  return { ok: true, days: Array.from(byDay.values()) };
}
