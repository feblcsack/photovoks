'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, QrCode, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { FrameThumb } from '@/components/frames/FrameThumb';
import { samplePhotos } from '@/components/frame-builder/useEditor';
import { defaultTokens } from '@/lib/frames/render';
import type { FrameRecord, QrCorner, QrPlacement } from '@/lib/frames/types';
import { applyQrPlacement, aspectOfSlot, hasQr, qrOverlaps } from '@/lib/frames/types';
import { cn } from '@/lib/utils';

export interface FramesState {
  selected: string[];
  qr: Record<string, QrPlacement>;
}

const CORNERS: Array<{ id: QrCorner; label: string }> = [
  { id: 'tl', label: 'Kiri atas' },
  { id: 'tr', label: 'Kanan atas' },
  { id: 'bl', label: 'Kiri bawah' },
  { id: 'br', label: 'Kanan bawah' },
];

/** Frame list for the booth + per-frame session-QR placement. */
export function FramesSection({
  code,
  library,
  loading,
  value,
  onChange,
  isAdmin,
}: {
  code: string;
  library: FrameRecord[];
  loading: boolean;
  value: FramesState;
  onChange: (v: FramesState) => void;
  isAdmin: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const byId = useMemo(() => new Map(library.map((f) => [f.id, f])), [library]);
  const { selected, qr } = value;

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= selected.length) return;
    const next = [...selected];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...value, selected: next });
  };
  const remove = (id: string) => onChange({ ...value, selected: selected.filter((x) => x !== id) });
  const toggle = (id: string) =>
    onChange({ ...value, selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] });
  const setQr = (id: string, p: QrPlacement) => onChange({ ...value, qr: { ...qr, [id]: p } });

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-72 rounded-[14px]" />)}</div>
      ) : !selected.length ? (
        <EmptyState
          icon={<QrCode />}
          title="Belum ada frame di booth"
          description="Tamu memilih dari frame yang Anda tambahkan di sini."
          action={<Button variant="primary" onClick={() => setPickerOpen(true)}><Plus /> Tambah frame</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {selected.map((id, i) => {
            const f = byId.get(id);
            if (!f) return null;
            return (
              <FrameCard
                key={id}
                frame={f}
                index={i}
                count={selected.length}
                placement={qr[id] ?? null}
                onPlacement={(p) => setQr(id, p)}
                onMove={(d) => move(i, d)}
                onRemove={() => remove(id)}
                editHref={isAdmin ? `/admin/frames/${f.id}?event=${code}` : null}
              />
            );
          })}
        </ul>
      )}
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPickerOpen(true)}><Plus /> Tambah frame</Button>
          {isAdmin ? <Link href={`/admin/frames/new?event=${code}`}><Button variant="ghost"><Pencil /> Buat frame baru</Button></Link> : null}
        </div>
      ) : null}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen} size="xl" title="Library frame" description="Klik untuk menambah atau melepas dari booth. Perubahan tersimpan saat Anda menekan Simpan.">
        {!library.length ? (
          <EmptyState title="Library kosong" description={isAdmin ? 'Buat frame pertama di Frame Builder.' : 'Minta pemilik membuat frame di Frame Builder.'} action={isAdmin ? <Link href={`/admin/frames/new?event=${code}`}><Button variant="primary"><Plus /> Buat frame</Button></Link> : undefined} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {library.map((f) => {
              const on = selected.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  className={cn('relative flex flex-col overflow-hidden rounded-[12px] border text-left transition', on ? 'border-brand ring-2 ring-brand/20' : 'border-line hover:border-line-strong')}
                >
                  <span className="flex aspect-[3/4] min-h-0 items-center justify-center overflow-hidden bg-canvas p-3"><FrameThumb frame={f} /></span>
                  <span className="px-3 py-2">
                    <span className="block truncate text-[13px] font-semibold">{f.name}</span>
                    <span className="block text-[11px] text-muted">{f.slotCount} foto{hasQr(f.design) ? ' · ada QR' : ''}{!f.isActive ? ' · nonaktif' : ''}</span>
                  </span>
                  {on ? <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-brand text-white"><Check className="size-3.5" /></span> : null}
                </button>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}

function FrameCard({
  frame,
  index,
  count,
  placement,
  onPlacement,
  onMove,
  onRemove,
  editHref,
}: {
  frame: FrameRecord;
  index: number;
  count: number;
  placement: QrPlacement;
  onPlacement: (p: QrPlacement) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  editHref: string | null;
}) {
  const designHasQr = hasQr(frame.design);
  const design = useMemo(() => applyQrPlacement(frame.design, placement), [frame.design, placement]);
  const photos = useMemo(() => samplePhotos(Math.max(1, frame.slotCount), aspectOfSlot(frame.design, 0)), [frame.slotCount, frame.design]);
  const tokens = useMemo(() => defaultTokens('Nama Event', 'KODE'), []);
  const covers = useMemo(() => qrOverlaps(design), [design]);
  const mode: 'design' | 'corner' | 'off' = !placement ? (designHasQr ? 'design' : 'off') : placement.mode;
  const corner = placement?.mode === 'corner' ? placement : { mode: 'corner' as const, corner: 'br' as QrCorner, size: 0.32 };
  // Physical size at 300 DPI (designs are authored at print resolution).
  const qrEl = design.elements.find((e) => e.type === 'qr' && !e.hidden);
  const qrCm = qrEl ? (qrEl.w / 300) * 2.54 : 0;

  const options = designHasQr
    ? [{ value: 'design' as const, label: 'Sesuai desain' }, { value: 'corner' as const, label: 'Pojok' }, { value: 'off' as const, label: 'Tanpa QR' }]
    : [{ value: 'off' as const, label: 'Tanpa QR' }, { value: 'corner' as const, label: 'Tambah QR' }];

  return (
    <li className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-ink/[0.06] text-xs font-bold text-ink-2">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{frame.name}</p>
          <p className="text-[11px] text-muted">{frame.slotCount} foto{!frame.isActive ? ' · nonaktif (tidak tampil)' : ''}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Naikkan"><ArrowUp /></Button>
        <Button size="icon-sm" variant="ghost" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Turunkan"><ArrowDown /></Button>
        {editHref ? <Link href={editHref} aria-label="Edit di Frame Builder" className="flex size-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-ink/5"><Pencil className="size-4" /></Link> : null}
        <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Lepas dari booth"><X /></Button>
      </div>

      <div className="flex h-60 items-center justify-center bg-canvas p-4">
        <FrameCanvas design={design} photos={photos} tokens={tokens} placeholders={false} maxRenderWidth={360} className="max-h-full w-auto shadow-[0_8px_24px_-12px_rgba(14,20,36,0.45)]" style={{ maxHeight: '100%' }} />
      </div>

      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><QrCode className="size-4" /> QR softfile</span>
          <Segmented
            size="sm"
            value={mode}
            onChange={(m) => onPlacement(m === 'design' ? null : m === 'off' ? (designHasQr ? { mode: 'off' } : null) : corner)}
            options={options}
          />
        </div>
        {mode === 'corner' ? (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-4 gap-1.5">
              {CORNERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPlacement({ ...corner, corner: c.id })}
                  className={cn('flex h-9 items-center justify-center rounded-[8px] border text-[11px] font-semibold', corner.corner === c.id ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line text-ink-2 hover:border-line-strong')}
                  aria-label={c.label}
                  title={c.label}
                >
                  <CornerGlyph corner={c.id} />
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 text-[12px] text-ink-2">
              Ukuran
              <input type="range" min={10} max={50} value={Math.round(corner.size * 100)} onChange={(e) => onPlacement({ ...corner, size: Number(e.target.value) / 100 })} className="flex-1 accent-brand" />
              <span className="w-14 text-right tabular-nums text-muted">≈ {qrCm.toFixed(1).replace('.', ',')} cm</span>
            </label>
          </div>
        ) : mode === 'design' ? (
          <p className="text-[12px] text-muted">Posisi QR mengikuti desain frame. Ubah di Frame Builder untuk mengatur letak bebas.</p>
        ) : null}
        {qrEl && qrCm < 1.8 ? (
          <p className="flex items-start gap-1.5 rounded-[8px] bg-warn-soft px-2.5 py-2 text-[12px] font-medium text-warn">
            <TriangleAlert className="mt-px size-3.5 shrink-0" /> QR ±{qrCm.toFixed(1).replace('.', ',')} cm di cetakan — terlalu kecil untuk discan dengan mudah. Disarankan minimal 2 cm.
          </p>
        ) : null}
        {covers.length ? (
          <p className="flex items-start gap-1.5 rounded-[8px] bg-warn-soft px-2.5 py-2 text-[12px] font-medium text-warn">
            <TriangleAlert className="mt-px size-3.5 shrink-0" /> QR menutupi foto {covers.join(', ')}. Pilih pojok lain, perkecil, atau atur di Frame Builder.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function CornerGlyph({ corner }: { corner: QrCorner }) {
  return (
    <span className="relative block h-5 w-4 rounded-[3px] border border-current opacity-80">
      <span className={cn('absolute size-1.5 rounded-[1px] bg-current', corner.startsWith('t') ? 'top-0.5' : 'bottom-0.5', corner.endsWith('l') ? 'left-0.5' : 'right-0.5')} />
    </span>
  );
}
