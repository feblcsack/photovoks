import Link from 'next/link';
import { ArrowRight, CalendarDays, Camera, CheckCircle2, CircleAlert, Frame, Plus } from 'lucide-react';
import { createServerClient } from '@/lib/supabase/server';
import { EVENT_COLUMNS, mapEvent } from '@/lib/events';
import { buildSummaries, isPrintStationOnline, SESSION_COLUMNS } from '@/lib/sessions';
import { getProvider } from '@/lib/ai/provider';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader, Stat } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/fetcher';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = createServerClient();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const since = dayStart.toISOString();
  const provider = getProvider();

  const [eventsRes, todayRes, aiRes, framesRes, recentRes, online, queuedRes] = await Promise.all([
    supabase.from('events').select(EVENT_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('sessions').select('print_count').gte('created_at', since).in('status', ['composed', 'printing', 'printed', 'completed']),
    supabase.from('ai_generations').select('id', { count: 'exact', head: true }).eq('status', 'done').gte('created_at', since),
    supabase.from('frames').select('id', { count: 'exact', head: true }),
    supabase.from('sessions').select(SESSION_COLUMNS).in('status', ['composed', 'printing', 'printed', 'completed']).order('created_at', { ascending: false }).limit(12),
    isPrintStationOnline(supabase),
    supabase.from('print_jobs').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
  ]);
  const events = (eventsRes.data ?? []).map(mapEvent);
  const codeById = new Map(events.map((e) => [e.id, e]));
  const recent = await buildSummaries(supabase, recentRes.data ?? []);
  const prints = (todayRes.data ?? []).reduce((s, r) => s + (r.print_count ?? 0), 0);

  const health = [
    { ok: !eventsRes.error, label: eventsRes.error ? `Database error: ${eventsRes.error.message}` : 'Database terhubung' },
    { ok: provider.isConfigured(), label: provider.isConfigured() ? `AI siap · ${provider.id} · ${provider.model()}` : 'AI belum dikonfigurasi (OPENROUTER_API_KEY)' },
    { ok: online, label: online ? 'Print worker online' : 'Print worker offline (opsional)' },
    { ok: (queuedRes.count ?? 0) === 0, label: `${queuedRes.count ?? 0} job dalam antrean cetak` },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Ringkasan semua event hari ini."
        actions={<Link href="/admin/events?new=1"><Button variant="primary"><Plus /> Tambah Event</Button></Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sesi hari ini" value={todayRes.data?.length ?? 0} unit="sesi" />
        <Stat label="Lembar dicetak" value={prints} unit="lembar" />
        <Stat label="Hasil AI hari ini" value={aiRes.count ?? 0} unit="gambar" />
        <Stat label="Event aktif" value={events.filter((e) => e.status === 'active').length} unit={`dari ${events.length}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel>
          <PanelHeader title="Sesi terbaru" description="Semua event" actions={<Link href="/admin/gallery" className="flex items-center gap-1 text-sm font-semibold text-brand">Galeri <ArrowRight className="size-4" /></Link>} />
          {recent.length ? (
            <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-6">
              {recent.map((s) => {
                const ev = codeById.get(s.eventId);
                return (
                  <Link key={s.id} href={ev ? `/event/${ev.code}/gallery` : '#'} className="group block">
                    <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[#EEF0F4]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {s.urls.thumb ? <img src={s.urls.thumb} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /> : null}
                    </div>
                    <p className="mt-1 truncate text-[11px] font-semibold text-ink-2">{ev?.name ?? '—'}</p>
                    <p className="text-[11px] text-muted">{timeAgo(s.createdAt)}</p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Camera className="size-6 text-faint" />
              <p className="text-sm text-muted">Belum ada sesi. Buat event, pilih frame, lalu buka booth.</p>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Status sistem" />
            <ul className="flex flex-col gap-1 p-3">
              {health.map((h) => (
                <li key={h.label} className="flex items-start gap-2.5 px-2 py-1.5 text-sm">
                  {h.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />}
                  <span className={h.ok ? 'text-ink-2' : 'font-semibold'}>{h.label}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Event" actions={<Link href="/admin/events" className="text-sm font-semibold text-brand">Semua</Link>} />
            {events.length ? (
              <ul className="divide-y divide-line">
                {events.slice(0, 6).map((e) => (
                  <li key={e.id}>
                    <Link href={`/event/${e.code}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                      <CalendarDays className="size-4 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.name}</span>
                        <span className="font-mono text-[11px] tracking-widest text-muted">{e.code}</span>
                      </span>
                      <Badge tone={e.status === 'active' ? 'ok' : e.status === 'draft' ? 'warn' : 'neutral'} dot>{e.status === 'active' ? 'Aktif' : e.status === 'draft' ? 'Draft' : 'Arsip'}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">Belum ada event.</p>
            )}
          </Panel>
          <Link href="/admin/frames" className="flex items-center justify-between rounded-panel border border-line bg-surface px-5 py-4 shadow-panel hover:border-line-strong">
            <span className="flex items-center gap-3"><Frame className="size-5 text-muted" /><span><span className="block text-sm font-bold">Frame Builder</span><span className="text-xs text-muted">{framesRes.count ?? 0} frame di library</span></span></span>
            <ArrowRight className="size-4 text-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
}
