'use client';

import React, { useState } from 'react';
import { Download, ExternalLink, ImageIcon, RefreshCcw } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, Stat } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import { PrintStatusBadge, SessionLightbox } from '@/components/gallery/SessionGallery';
import { formatDateTime } from '@/lib/fetcher';
import type { SessionSummary } from '@/lib/session-types';
import { useEventSessions, type Range } from './useEventSessions';
import { variant } from '@/lib/media-variant';

function toCsv(rows: SessionSummary[]): string {
  const head = ['waktu', 'frame', 'foto', 'status', 'dicetak', 'hasil_ai', 'live', 'disembunyikan'];
  const lines = rows.map((s) => [formatDateTime(s.createdAt), s.frameName ?? '', s.shotCount, s.status, s.printCount, s.ai.filter((a) => a.status === 'done').length, s.urls.gif ? 'ya' : 'tidak', s.isHidden ? 'ya' : 'tidak'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [head.join(','), ...lines].join('\n');
}

export function SessionHistory({ code, printPaper }: { code: string; printPaper: string }) {
  const [range, setRange] = useState<Range>('today');
  const [status, setStatus] = useState('');
  const { sessions, stats, total, loading, loadingMore, nextOffset, reload, loadMore, error } = useEventSessions(code, range, status, 30);
  const [open, setOpen] = useState<SessionSummary | null>(null);

  function exportCsv() {
    const blob = new Blob(['﻿' + toCsv(sessions)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sesi-${code}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <PageHeader
        title="Riwayat Sesi"
        description="Setiap sesi foto di booth — status, cetak, dan hasil AI."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!sessions.length}><Download /> Export CSV</Button>
            <Button variant="secondary" onClick={() => void reload()} loading={loading}><RefreshCcw /> Refresh</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented<Range> value={range} onChange={setRange} options={[{ value: 'all', label: 'Semua' }, { value: 'today', label: 'Hari ini' }, { value: 'week', label: '7 hari' }, { value: 'month', label: '30 hari' }]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-44">
          <option value="">Semua status</option>
          <option value="composed">Belum dicetak</option>
          <option value="printing">Dalam antrean</option>
          <option value="printed">Sudah dicetak</option>
        </Select>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total sesi" value={stats?.sessions ?? '–'} unit="sesi" />
        <Stat label="Sesi dicetak" value={stats?.printedSessions ?? '–'} unit="sesi" />
        <Stat label="Total cetak" value={stats?.prints ?? '–'} unit="lembar" />
        <Stat label="Hasil AI" value={stats?.ai ?? '–'} unit="gambar" />
      </div>

      <Panel className="overflow-hidden">
        {error ? <p className="px-5 py-10 text-center text-sm text-danger">{error}</p> : null}
        {!loading && !sessions.length && !error ? <EmptyState icon={<ImageIcon />} title="Belum ada sesi" description="Sesi muncul di sini setelah tamu menyelesaikan foto di booth." /> : null}
        {sessions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold tracking-wider text-muted uppercase">
                  <th className="px-5 py-3">Hasil</th>
                  <th className="px-3 py-3">Waktu</th>
                  <th className="px-3 py-3">Frame</th>
                  <th className="px-3 py-3">Status cetak</th>
                  <th className="px-3 py-3">Cetak</th>
                  <th className="px-3 py-3">Extra</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s) => {
                  const lastJob = s.printJobs[0];
                  return (
                    <tr key={s.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => setOpen(s)}>
                      <td className="px-5 py-2.5">
                        <div className="flex h-14 w-11 items-center justify-center overflow-hidden rounded-[6px] bg-canvas">
                          {s.urls.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={variant(s.urls.thumb, { w: 160 })} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
                          ) : <ImageIcon className="size-4 text-faint" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                      <td className="px-3 py-2.5 font-semibold">{s.frameName ?? '—'}<span className="block text-xs font-normal text-muted">{s.shotCount} foto</span></td>
                      <td className="px-3 py-2.5">{lastJob ? <PrintStatusBadge status={lastJob.status} /> : <span className="text-xs text-muted">Belum dicetak</span>}</td>
                      <td className="px-3 py-2.5 tabular-nums">{s.printCount ? `${s.printCount} lembar` : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {s.urls.gif ? <Badge>Live</Badge> : null}
                          {s.ai.some((a) => a.status === 'done') ? <Badge tone="ai">AI {s.ai.filter((a) => a.status === 'done').length}</Badge> : null}
                          {s.isHidden ? <Badge tone="neutral">Disembunyikan</Badge> : null}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {s.token ? (
                          <a href={`/s/${s.token}`} target="_blank" rel="noreferrer" className="inline-flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-ink/5" aria-label="Halaman tamu"><ExternalLink className="size-4" /></a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {nextOffset !== null ? (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => void loadMore()} loading={loadingMore}>Muat lagi ({sessions.length}/{total})</Button>
          </div>
        ) : null}
      </Panel>
      <SessionLightbox session={open} onClose={() => setOpen(null)} manage={{ code, onChanged: () => { setOpen(null); void reload(); } }} printPaper={printPaper} />
    </div>
  );
}
