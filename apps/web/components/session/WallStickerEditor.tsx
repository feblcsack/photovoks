'use client';

/**
 * Lets a guest pin Y2K stickers onto their photo for the fridge live wall.
 * Stores only sticker ids + positions (fractions) — the wall draws them as
 * overlays, so nothing is re-uploaded.
 */
import React, { useRef, useState } from 'react';
import { Check, RotateCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Sticker } from '@/components/brand/scrap';
import { api } from '@/lib/fetcher';
import { MAX_WALL_STICKERS, Y2K_STICKERS, type WallSticker } from '@/lib/y2k-stickers';
import { cn } from '@/lib/utils';

export function WallStickerEditor({ open, onOpenChange, token, imageUrl, aspect, initial, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; imageUrl: string; aspect: number; initial: WallSticker[]; onSaved: (s: WallSticker[]) => void }) {
  const toast = useToast();
  const [items, setItems] = useState<WallSticker[]>(initial);
  const [sel, setSel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { i: number; sx: number; sy: number; ox: number; oy: number }>(null);

  function add(id: string) {
    if (items.length >= MAX_WALL_STICKERS) return toast(`Maksimal ${MAX_WALL_STICKERS} stiker`, 'info');
    const n = items.length;
    setItems([...items, { id, x: 0.25 + (n % 3) * 0.25, y: 0.15 + ((n * 0.27) % 0.7), s: 0.28, r: (n % 2 ? 1 : -1) * 12 }]);
    setSel(n);
  }
  const patch = (i: number, p: Partial<WallSticker>) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ stickers: WallSticker[] }>(`/api/s/${token}/wall`, { method: 'POST', json: { stickers: items } });
      onSaved(res.stickers);
      toast('Tertempel di live wall! ✶');
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  const selected = sel !== null ? items[sel] : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Tempel stiker untuk live wall"
      description="Stikermu ikut tampil saat fotomu muncul di layar kulkas event."
      footer={
        <>
          <Button variant="ghost" onClick={() => setItems([])} disabled={!items.length}><Trash2 /> Hapus semua</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}><Check /> Tempel</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex items-center justify-center rounded-[14px] bg-[#c9cbcf] p-4 fridge-silver">
          <div
            ref={box}
            className="relative w-full max-w-[300px] touch-none bg-white p-1.5 shadow-[0_12px_24px_-10px_rgba(0,0,0,0.6)]"
            style={{ aspectRatio: String(aspect) }}
            onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Fotomu" className="pointer-events-none size-full object-cover" draggable={false} />
            {items.map((s, i) => (
              <div
                key={i}
                className={cn('absolute cursor-grab', sel === i && 'z-10')}
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%`, transform: 'translate(-50%,-50%)' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setSel(i);
                  drag.current = { i, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  const r = box.current?.getBoundingClientRect();
                  if (!d || !r) return;
                  patch(d.i, { x: Math.min(1.1, Math.max(-0.1, d.ox + (e.clientX - d.sx) / r.width)), y: Math.min(1.1, Math.max(-0.1, d.oy + (e.clientY - d.sy) / r.height)) });
                }}
                onPointerUp={() => (drag.current = null)}
              >
                <Sticker id={s.id} rotate={s.r} className={cn('w-full', sel === i && 'drop-shadow-[0_0_0_2px_#2747C9] outline-2 outline-cobalt outline-dashed')} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-5 gap-1 sm:grid-cols-4">
            {Y2K_STICKERS.map((s) => (
              <button key={s.id} type="button" onClick={() => add(s.id)} title={s.label} className="aspect-square rounded-[10px] p-0.5 hover:bg-ink/5 active:scale-95">
                <Sticker id={s.id} className="size-full" />
              </button>
            ))}
          </div>
          {selected && sel !== null ? (
            <div className="rounded-[12px] border-2 border-ink/15 p-3">
              <label className="flex items-center gap-2 text-xs font-semibold">Ukuran<input type="range" min={0.1} max={0.6} step={0.01} value={selected.s} onChange={(e) => patch(sel, { s: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" /></label>
              <label className="mt-2 flex items-center gap-2 text-xs font-semibold"><RotateCw className="size-3.5 shrink-0" /><input type="range" min={-180} max={180} value={selected.r} onChange={(e) => patch(sel, { r: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" /></label>
              <Button size="xs" variant="danger-ghost" className="mt-2" onClick={() => { setItems(items.filter((_, k) => k !== sel)); setSel(null); }}><Trash2 /> Hapus</Button>
            </div>
          ) : (
            <p className="text-xs text-muted">Ketuk stiker untuk menempel, lalu seret di foto. Maks {MAX_WALL_STICKERS}.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
