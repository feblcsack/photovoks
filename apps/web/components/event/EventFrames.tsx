'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Frame, Pencil, Plus, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { api } from '@/lib/fetcher';
import { defaultTokens } from '@/lib/frames/render';
import type { FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';

export function FrameThumb({ frame, className }: { frame: FrameRecord; className?: string }) {
  const tokens = useMemo(() => defaultTokens('Nama Event', 'KODE'), []);
  return frame.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={frame.thumbnailUrl} alt={frame.name} loading="lazy" className={cn('max-h-full max-w-full object-contain', className)} />
  ) : (
    <FrameCanvas design={frame.design} tokens={tokens} maxRenderWidth={260} className={cn('max-h-full w-auto', className)} style={{ maxHeight: '100%' }} />
  );
}

export function EventFrames({ code, eventName, isAdmin }: { code: string; eventName: string; isAdmin: boolean }) {
  const toast = useToast();
  const [library, setLibrary] = useState<FrameRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ assigned: FrameRecord[]; library: FrameRecord[] }>(`/api/events/${code}/frames`);
      setLibrary(res.library);
      const ids = res.assigned.map((f) => f.id);
      setSelected(ids);
      setSaved(ids);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat frame', 'error');
    } finally {
      setLoading(false);
    }
  }, [code, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const dirty = selected.join() !== saved.join();

  function move(i: number, d: -1 | 1) {
    setSelected((xs) => {
      const next = [...xs];
      const j = i + d;
      if (j < 0 || j >= next.length) return xs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api(`/api/events/${code}/frames`, { method: 'PUT', json: { frameIds: selected } });
      setSaved(selected);
      toast('Frame booth disimpan');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Frame"
        description={`Pilih frame dari library yang tampil di booth ${eventName}, dan atur urutannya.`}
        actions={
          <>
            {isAdmin ? <Link href={`/admin/frames/new?event=${code}`}><Button variant="secondary"><Plus /> Buat frame baru</Button></Link> : null}
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}><Save /> Simpan</Button>
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Panel className="self-start">
          <PanelHeader title="Tampil di booth" description={`${selected.length} frame · urutan = urutan di layar tamu`} />
          {!selected.length ? (
            <EmptyState icon={<Frame />} title="Belum ada frame" description="Tambahkan dari library di sebelah kanan." />
          ) : (
            <ul className="divide-y divide-line">
              {selected.map((id, i) => {
                const f = byId.get(id);
                if (!f) return null;
                return (
                  <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                    <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-canvas"><FrameThumb frame={f} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <p className="text-xs text-muted">{f.slotCount} pose{!f.isActive ? ' · nonaktif' : ''}</p>
                    </div>
                    <div className="flex">
                      <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naik"><ArrowUp /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label="Turun"><ArrowDown /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setSelected((xs) => xs.filter((x) => x !== id))} aria-label="Hapus dari booth"><X /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Library frame" description="Frame bisa dipakai ulang di banyak event." />
          {loading ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-[12px]" />)}</div>
          ) : !library.length ? (
            <EmptyState icon={<Frame />} title="Library kosong" description={isAdmin ? 'Buat frame pertama di Frame Builder.' : 'Minta pemilik membuat frame di Frame Builder.'} />
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
              {library.map((f) => {
                const on = selected.includes(f.id);
                return (
                  <div key={f.id} className={cn('group relative flex flex-col overflow-hidden rounded-[12px] border transition', on ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:border-line-strong')}>
                    <button type="button" onClick={() => setSelected((xs) => (on ? xs.filter((x) => x !== f.id) : [...xs, f.id]))} className="flex aspect-[3/4] min-h-0 items-center justify-center overflow-hidden bg-[#EEF0F4] p-3">
                      <FrameThumb frame={f} className="shadow-[0_6px_16px_-8px_rgba(0,0,0,0.4)]" />
                    </button>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{f.name}</p>
                        <p className="text-[11px] text-muted">{f.slotCount} pose · {f.width}×{f.height}</p>
                      </div>
                      {isAdmin ? <Link href={`/admin/frames/${f.id}`} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-ink/5" aria-label="Edit"><Pencil className="size-3.5" /></Link> : null}
                    </div>
                    {on ? <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-brand text-white"><Check className="size-3.5" /></span> : null}
                    {!f.isActive ? <Badge tone="neutral" className="absolute top-2 left-2">Nonaktif</Badge> : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
