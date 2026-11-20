'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Frame, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { FrameThumb } from '@/components/event/EventFrames';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { api } from '@/lib/fetcher';
import { FRAME_TEMPLATES } from '@/lib/frames/presets';
import { defaultTokens } from '@/lib/frames/render';
import type { FrameRecord } from '@/lib/frames/types';

type Usage = Record<string, Array<{ code: string; name: string }>>;

export function FramesLibrary() {
  const router = useRouter();
  const toast = useToast();
  const [frames, setFrames] = useState<FrameRecord[] | null>(null);
  const [usage, setUsage] = useState<Usage>({});
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [del, setDel] = useState<FrameRecord | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ frames: FrameRecord[]; usage: Usage }>('/api/admin/frames');
      setFrames(res.frames);
      setUsage(res.usage);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memuat', 'error');
      setFrames([]);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  async function toggle(f: FrameRecord, v: boolean) {
    setFrames((xs) => xs?.map((x) => (x.id === f.id ? { ...x, isActive: v } : x)) ?? null);
    await api(`/api/admin/frames/${f.id}`, { method: 'PATCH', json: { isActive: v } }).catch(() => toast('Gagal menyimpan', 'error'));
  }

  async function duplicate(f: FrameRecord) {
    try {
      const res = await api<{ id: string }>(`/api/admin/frames/${f.id}`, { method: 'POST', json: { action: 'duplicate' } });
      toast('Frame diduplikasi (nonaktif)');
      router.push(`/admin/frames/${res.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  }

  async function remove() {
    if (!del) return;
    try {
      await api(`/api/admin/frames/${del.id}`, { method: 'DELETE' });
      toast('Frame dihapus');
      setDel(null);
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  }

  const list = (frames ?? []).filter((f) => (filter === 'all' ? true : filter === 'active' ? f.isActive : !f.isActive));
  const tokens = useMemo(() => defaultTokens('Nama Event', 'AB12CD'), []);

  return (
    <div onClick={() => setMenu(null)}>
      <PageHeader
        title="Frame Builder"
        description="Library frame yang bisa dipakai ulang di semua event. Desain visual, langsung dipakai booth & cetak."
        actions={<Link href="/admin/frames/new"><Button variant="primary"><Plus /> Frame baru</Button></Link>}
      />

      <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Mulai cepat dari template</p>
      <div className="no-scrollbar mb-8 flex gap-3 overflow-x-auto pb-2">
        {FRAME_TEMPLATES.map((t) => (
          <Link key={t.id} href={`/admin/frames/new?template=${t.id}`} className="flex w-36 shrink-0 flex-col overflow-hidden rounded-[12px] border border-line bg-surface hover:border-brand">
            <div className="flex h-36 items-center justify-center bg-[#EEF0F4] p-2.5"><TemplateMini build={t.build} tokens={tokens} /></div>
            <p className="truncate px-2.5 py-2 text-xs font-semibold">{t.name}</p>
          </Link>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `Semua (${frames?.length ?? 0})` }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }]} />
      </div>

      {frames === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4] rounded-[14px]" />)}</div>
      ) : !list.length ? (
        <EmptyState icon={<Frame />} title="Belum ada frame" description="Buat frame dari template atau dari nol. Frame lama (PNG + slot) otomatis bisa diedit di sini." action={<Link href="/admin/frames/new"><Button variant="primary"><Plus /> Frame baru</Button></Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {list.map((f) => (
            <div key={f.id} className="group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-panel">
              <Link href={`/admin/frames/${f.id}`} className="flex aspect-[3/4] min-h-0 items-center justify-center overflow-hidden bg-[#EEF0F4] p-4">
                <FrameThumb frame={f} className="shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)]" />
              </Link>
              <div className="flex flex-col gap-2 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    <p className="text-[11px] text-muted">{f.slotCount} pose · {f.width}×{f.height}</p>
                  </div>
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon-sm" variant="ghost" onClick={() => setMenu(menu === f.id ? null : f.id)} aria-label="Menu"><MoreHorizontal /></Button>
                    {menu === f.id ? (
                      <div className="absolute right-0 bottom-9 z-10 w-40 animate-pop overflow-hidden rounded-[10px] border border-line bg-surface py-1 shadow-pop">
                        <Link href={`/admin/frames/${f.id}`} className="flex h-9 items-center gap-2 px-3 text-sm hover:bg-canvas"><Pencil className="size-4" /> Edit</Link>
                        <button type="button" onClick={() => duplicate(f)} className="flex h-9 w-full items-center gap-2 px-3 text-sm hover:bg-canvas"><Copy className="size-4" /> Duplikat</button>
                        <button type="button" onClick={() => { setMenu(null); setDel(f); }} className="flex h-9 w-full items-center gap-2 px-3 text-sm text-danger hover:bg-danger-soft"><Trash2 className="size-4" /> Hapus</button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {(usage[f.id] ?? []).slice(0, 2).map((u) => <Badge key={u.code} tone="brand">{u.code}</Badge>)}
                    {(usage[f.id]?.length ?? 0) > 2 ? <Badge>+{usage[f.id].length - 2}</Badge> : null}
                    {!usage[f.id]?.length ? <span className="text-[11px] text-faint">Belum dipakai</span> : null}
                  </div>
                  <Switch checked={f.isActive} onChange={(v) => void toggle(f, v)} label="Aktif" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Hapus frame "${del?.name}"?`}
        description={del && usage[del.id]?.length ? <>Frame ini dipakai di {usage[del.id].length} event dan akan hilang dari booth-nya. Foto sesi lama tidak terpengaruh.</> : 'Foto sesi lama tidak terpengaruh.'}
        confirmLabel="Hapus frame"
        onConfirm={remove}
      />
    </div>
  );
}

function TemplateMini({ build, tokens }: { build: () => import('@/lib/frames/types').FrameDesign; tokens: Record<string, string> }) {
  const [design] = useState(build);
  return <FrameCanvas design={design} tokens={tokens} maxRenderWidth={160} className="max-h-full w-auto" style={{ maxHeight: '100%' }} />;
}
