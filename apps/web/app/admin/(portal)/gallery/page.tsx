import { createServerClient } from '@/lib/supabase/server';
import { buildSummaries, SESSION_COLUMNS } from '@/lib/sessions';
import { AdminGallery } from '@/components/admin/AdminGallery';

export const dynamic = 'force-dynamic';
const PAGE = 48;

export default async function AdminGalleryPage({ searchParams }: { searchParams: Promise<{ page?: string; event?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = createServerClient();
  const { data: events } = await supabase.from('events').select('id, code, name, print_paper').order('created_at', { ascending: false });
  let q = supabase
    .from('sessions')
    .select(SESSION_COLUMNS, { count: 'exact' })
    .in('status', ['composed', 'printing', 'printed', 'completed'])
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const filterEvent = (events ?? []).find((e) => e.code === sp.event);
  if (filterEvent) q = q.eq('event_id', filterEvent.id);
  const { data: rows, count } = await q;
  const sessions = await buildSummaries(supabase, rows ?? [], { withToken: true, withPrintJobs: true });
  return <AdminGallery sessions={sessions} events={events ?? []} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} total={count ?? 0} eventFilter={filterEvent?.code ?? ''} />;
}
