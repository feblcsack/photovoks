'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Check, Info, Printer, RefreshCcw, RotateCcw, Zap } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { PrintDialog } from '@/components/print/PrintDialog';
import { PrintStatusBadge } from '@/components/gallery/SessionGallery';
import { api, formatDateTime, timeAgo } from '@/lib/fetcher';
import { loadPrintable, printSheet, renderSheet, sheetToJpeg } from '@/lib/print/sheet';
import { paperById } from '@/lib/print/papers';

interface Job {
  id: string;
  sessionId: string;
  sessionToken: string | null;
  frameName: string | null;
  type: 'strip' | 'ai' | 'sketch' | 'edit';
  status: string;
  copies: number;
  paper: string | null;
  source: string;
  errorReason: string | null;
  createdAt: string;
  url: string | null;
}

interface QueueData { workerOnline: boolean; printMode: string; paper: string; jobs: Job[] }

export function PrintStation({ code, defaultPaper }: { code: string; defaultPaper: string }) {
  const toast = useToast();
  const [data, setData] = useState<QueueData | null>(null);
  const [printing, setPrinting] = useState<Job | null>(null);
  const [auto, setAuto] = useState(false);
  const autoBusy = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api<QueueData>(`/api/events/${code}/print-queue`));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat antrean', 'error');
    }
  }, [code, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  const act = useCallback(
    async (job: Job, action: 'claim' | 'printed' | 'failed' | 'requeue' | 'cancel', quiet = false) => {
      try {
        await api(`/api/events/${code}/print-queue`, { method: 'PATCH', json: { jobId: job.id, action } });
        if (!quiet) toast(action === 'printed' ? 'Ditandai tercetak' : action === 'requeue' ? 'Dimasukkan ulang ke antrean' : action === 'cancel' ? 'Dibatalkan' : 'Diperbarui');
        await load();
        return true;
      } catch (e) {
        if (!quiet) toast(e instanceof Error ? e.message : 'Gagal', 'error');
        return false;
      }
    },
    [code, load, toast],
  );

  // Auto mode: print the oldest queued job directly (no preview dialog).
  // With Chrome started with --kiosk-printing this is fully silent.
  useEffect(() => {
    if (!auto || !data || autoBusy.current || data.workerOnline) return;
    const next = [...data.jobs].reverse().find((j) => j.status === 'queued' && j.url);
    if (!next) return;
    autoBusy.current = true;
    (async () => {
      try {
        if (!(await act(next, 'claim', true))) return;
        const img = await loadPrintable(next.url!);
        // The asset is already a print-ready sheet for the event paper → fit 1:1.
        const sheet = renderSheet(img, img.width, img.height, next.paper ?? defaultPaper, 'fit', 0);
        await printSheet(await sheetToJpeg(sheet.canvas), sheet.plan, next.copies);
        await act(next, 'printed', true);
        toast(`Tercetak: ${next.frameName ?? 'foto'} (${next.copies}×)`);
      } catch {
        await act(next, 'failed', true);
      } finally {
        autoBusy.current = false;
      }
    })();
  }, [auto, data, act, defaultPaper, toast]);

  const active = data?.jobs.filter((j) => ['queued', 'printing', 'failed'].includes(j.status)) ?? [];
  const done = data?.jobs.filter((j) => !['queued', 'printing', 'failed'].includes(j.status)) ?? [];

  return (
    <div>
      <PageHeader
        title="Print Station"
        description="Antrean cetak dari booth & tamu. Buka halaman ini di laptop/PC yang terhubung ke printer."
        actions={<Button variant="secondary" onClick={() => void load()}><RefreshCcw /> Refresh</Button>}
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="flex items-center justify-between rounded-panel border border-line bg-surface px-4 py-3 shadow-panel">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Print worker (pnpm print)</p>
            <p className="mt-1 text-sm font-semibold">{data?.workerOnline ? 'Online — memproses antrean otomatis' : 'Offline'}</p>
          </div>
          <Badge tone={data?.workerOnline ? 'ok' : 'neutral'} dot>{data?.workerOnline ? 'Online' : 'Offline'}</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 shadow-panel">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Cetak otomatis dari browser ini</p>
            <p className="mt-1 text-xs text-muted">{data?.workerOnline ? 'Nonaktif selama worker online' : 'Langsung cetak setiap job baru'}</p>
          </div>
          <Switch checked={auto} onChange={setAuto} disabled={data?.workerOnline} label="Cetak otomatis" />
        </div>
        <div className="flex items-center justify-between rounded-panel border border-line bg-surface px-4 py-3 shadow-panel">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Kertas event</p>
            <p className="mt-1 text-sm font-semibold">{paperById(data?.paper ?? defaultPaper).label}</p>
          </div>
          {data?.printMode !== 'station' ? <Badge tone="warn">Mode cetak: {data?.printMode ?? '…'}</Badge> : null}
        </div>
      </div>

      {auto ? (
        <p className="mb-4 flex items-start gap-2 rounded-[12px] bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          <Zap className="mt-0.5 size-4 shrink-0" />
          <span>Mode otomatis aktif. Browser tetap menampilkan dialog print kecuali Chrome dijalankan dengan flag <code className="font-mono text-xs">--kiosk-printing</code> (lihat README). Biarkan tab ini terbuka.</span>
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel>
          <PanelHeader title="Antrean" description={`${active.length} job menunggu / gagal`} />
          {!active.length ? (
            <EmptyState icon={<Printer />} title="Antrean kosong" description="Job baru muncul otomatis saat tamu menekan Cetak di booth atau di HP." />
          ) : (
            <ul className="divide-y divide-line">
              {active.map((j) => (
                <li key={j.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-canvas">
                    {j.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={j.url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold">{j.type === 'ai' ? 'Hasil AI' : j.type === 'edit' ? 'Foto berstiker (dari tamu)' : j.frameName ?? 'Foto'}</p>
                      <PrintStatusBadge status={j.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{j.copies} lembar · {paperById(j.paper).label} · dari {j.source} · {timeAgo(j.createdAt)}</p>
                    {j.errorReason ? <p className="mt-0.5 text-xs text-danger">Error: {j.errorReason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    <Button size="sm" variant="primary" disabled={!j.url} onClick={() => setPrinting(j)}><Printer /> Cetak</Button>
                    {j.status === 'failed' ? <Button size="sm" variant="secondary" onClick={() => act(j, 'requeue')}><RotateCcw /> Ulangi</Button> : null}
                    <Button size="icon-sm" variant="ghost" title="Tandai tercetak" onClick={() => act(j, 'printed')}><Check /></Button>
                    <Button size="icon-sm" variant="ghost" title="Batalkan" onClick={() => act(j, 'cancel')}><Ban /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader title="Selesai (24 jam)" />
            {!done.length ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Belum ada.</p>
            ) : (
              <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
                {done.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{j.type === 'ai' ? 'Hasil AI' : j.type === 'edit' ? 'Foto berstiker (dari tamu)' : j.frameName ?? 'Foto'} · {j.copies}×</p>
                      <p className="text-xs text-muted">{formatDateTime(j.createdAt)}</p>
                    </div>
                    <PrintStatusBadge status={j.status} />
                    <Button size="icon-sm" variant="ghost" title="Cetak ulang" onClick={() => act(j, 'requeue')}><RotateCcw /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="rounded-panel border border-line bg-surface p-4 text-xs leading-relaxed text-muted shadow-panel">
            <p className="mb-1.5 flex items-center gap-1.5 font-bold text-ink-2"><Info className="size-3.5" /> Dua cara mengoperasikan printer</p>
            <p><b>1. Halaman ini</b> — buka di PC yang terhubung printer, tekan Cetak (atau aktifkan otomatis). Paling mudah.</p>
            <p className="mt-1"><b>2. Print worker</b> — <code className="font-mono">pnpm print</code> di PC printer, mencetak senyap via driver OS (CUPS / SumatraPDF). Paling cocok untuk event ramai.</p>
            <p className="mt-1">Jangan jalankan keduanya untuk event yang sama sekaligus.</p>
          </div>
        </div>
      </div>

      <PrintDialog
        open={!!printing}
        onOpenChange={(o) => !o && setPrinting(null)}
        source={printing?.url ?? null}
        title="Cetak dari antrean"
        defaultPaper={printing?.paper ?? defaultPaper}
        defaultCopies={printing?.copies ?? 1}
        onPrinted={async () => {
          if (printing) await act(printing, 'printed');
          setPrinting(null);
        }}
      />
    </div>
  );
}
