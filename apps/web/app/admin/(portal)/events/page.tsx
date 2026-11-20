import { createServerClient } from '@/lib/supabase/server';
import { EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { EventsManager } from '@/components/admin/EventsManager';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const supabase = createServerClient();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase.from('events').select(EVENT_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('sessions').select('event_id').in('status', ['composed', 'printing', 'printed', 'completed']).limit(20000),
  ]);
  const sessionCounts: Record<string, number> = {};
  for (const c of counts ?? []) sessionCounts[c.event_id] = (sessionCounts[c.event_id] ?? 0) + 1;
  return <EventsManager initial={(data ?? []).map(mapEvent)} sessionCounts={sessionCounts} />;
}
