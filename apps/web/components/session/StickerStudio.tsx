'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpToLine, Download, Printer, RotateCw, Trash2, Type, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { canvasToBlob, createCanvas, loadBitmap } from '@/lib/frames/render';
import { canvasFont, ensureFonts, FONTS } from '@/lib/frames/fonts';
import type { FontKey } from '@/lib/frames/types';
import { BUILTIN_STICKERS, STICKER_EMOJI, stickerDataUrl, TEXT_COLORS } from '@/lib/stickers';
import { cn } from '@/lib/utils';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Item =
  | { id: string; kind: 'image'; src: string; aspect: number; x: number; y: number; size: number; rot: number }
  | { id: string; kind: 'emoji'; text: string; x: number; y: number; size: number; rot: number }
  | { id: string; kind: 'text'; text: string; font: FontKey; color: string; pill: boolean; x: number; y: number; size: number; rot: number };

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const TEXT_FONTS: FontKey[] = ['bubble', 'typewriter', 'scribble', 'sans', 'display', 'marker', 'script', 'serif'];
const uid = () => Math.random().toString(36).slice(2, 9);

function textMetrics(it: Extract<Item, { kind: 'text' }>) {
  const padX = it.pill ? it.size * 0.45 : 0;
  const padY = it.pill ? it.size * 0.25 : 0;
  return { padX, padY };
}

/**
 * Guest sticker editor. Works in base-image pixels; the on-screen overlay is
 * a scaled view of the same numbers, and export redraws them on a canvas at
 * full resolution — so what the guest sees is what prints.
 */
export function StickerStudio({
  imageUrl,
  eventStickers,
  canPrint,
  printHint,
  token,
  onClose,
  onQueued,
}: {
  imageUrl: string;
  eventStickers: string[];
  canPrint: boolean;
  printHint: string;
  token: string;
  onClose: () => void;
  onQueued: () => void;
}) {
  const toast = useToast();
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'stiker' | 'emoji' | 'teks'>('stiker');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'save' | 'print' | null>(null);
  const [printedPath, setPrintedPath] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const drag = useRef<null | { id: string; mode: 'move' | 'transform'; sx: number; sy: number; ox: number; oy: number; size: number; rot: number; cx: number; cy: number; dist: number; ang: number }>(null);

  // Natural size of the photo.
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => alive && setBase({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
    void ensureFonts(TEXT_FONTS.map((f) => ({ font: f, weight: 700 })));
    return () => {
      alive = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const fit = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  // Fit the photo into the available area (explicit size keeps x/y scaling equal).
  const k = base && area.w && area.h ? Math.min(area.w / base.w, area.h / base.h) : 0; // screen px per image px
  const sel = items.find((i) => i.id === selected) ?? null;
  const update = useCallback((id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? ({ ...x, ...patch } as Item) : x))), []);

  function add(item: DistributiveOmit<Item, 'id' | 'x' | 'y' | 'rot'>) {
    if (!base) return;
    const id = uid();
    // Stagger new items a bit so they don't stack exactly.
    const n = items.length % 5;
    const it = { ...item, id, x: base.w / 2 + (n - 2) * base.w * 0.06, y: base.h * 0.45 + (n - 2) * base.w * 0.06, rot: 0 } as Item;
    setItems((xs) => [...xs, it]);
    setSelected(id);
    setPrintedPath(null);
  }

  async function addImage(src: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode().catch(() => undefined);
    const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    add({ kind: 'image', src, aspect, size: (base?.w ?? 1000) * 0.3 });
  }

  // ── Pointer interaction (move / scale+rotate handle) ──────────────────────
  function screenCenter(it: Item) {
    const r = stageRef.current!.getBoundingClientRect();
    return { cx: r.left + it.x * k, cy: r.top + it.y * k };
  }
  function start(e: React.PointerEvent, it: Item, mode: 'move' | 'transform') {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelected(it.id);
    const { cx, cy } = screenCenter(it);
    drag.current = { id: it.id, mode, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, size: it.size, rot: it.rot, cx, cy, dist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, ang: Math.atan2(e.clientY - cy, e.clientX - cx) };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !base) return;
    if (d.mode === 'move') {
      const x = Math.min(base.w, Math.max(0, d.ox + (e.clientX - d.sx) / k));
      const y = Math.min(base.h, Math.max(0, d.oy + (e.clientY - d.sy) / k));
      update(d.id, { x, y });
    } else {
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      update(d.id, { size: Math.max(base.w * 0.03, Math.min(base.w * 1.5, (d.size * dist) / d.dist)), rot: d.rot + ang - d.ang });
    }
  }
  function end() {
    if (drag.current) setPrintedPath(null);
    drag.current = null;
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function render(): Promise<Blob> {
    if (!base) throw new Error('Foto belum siap');
    const photo = await loadBitmap(imageUrl);
    if (!photo) throw new Error('Gagal memuat foto');
    const c = createCanvas(base.w, base.h);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(photo, 0, 0, base.w, base.h);
    for (const it of items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      if (it.kind === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = it.src;
        await img.decode();
        const w = it.size;
        const h = w / it.aspect;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else if (it.kind === 'emoji') {
        ctx.font = `${it.size}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.text, 0, it.size * 0.06);
      } else {
        ctx.font = canvasFont(it.font, 700, it.size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const { padX, padY } = textMetrics(it);
        if (it.pill) {
          const w = ctx.measureText(it.text).width + padX * 2;
          const h = it.size * 1.2 + padY * 2;
          ctx.fillStyle = it.color === '#FFFFFF' ? '#1B1B1F' : '#FFFFFF';
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
          ctx.fill();
        } else {
          ctx.lineWidth = Math.max(2, it.size * 0.12);
          ctx.lineJoin = 'round';
          ctx.strokeStyle = it.color === '#FFFFFF' ? '#1B1B1F' : '#FFFFFF';
          ctx.strokeText(it.text, 0, 0);
        }
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, 0, 0);
      }
      ctx.restore();
    }
    return canvasToBlob(c, 'image/jpeg', 0.92);
  }

  async function save() {
    setBusy('save');
    try {
      const blob = await render();
      const file = new File([blob], 'photovoks-stiker.jpg', { type: 'image/jpeg' });
      const download = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      };
      // Phones: share sheet → "Simpan Gambar". Falls back to a download unless
      // the guest cancelled the sheet themselves.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          if ((err as DOMException)?.name !== 'AbortError') download();
        }
      } else {
        download();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function sendToPrinter() {
    setBusy('print');
    try {
      const blob = await render();
      const slot = await api<{ path: string; uploadUrl: string }>(`/api/s/${token}/edit`, { method: 'POST' });
      await uploadToSignedUrl(slot.uploadUrl, blob, 'image/jpeg');
      await api(`/api/s/${token}/print`, { method: 'POST', json: { mode: 'queue', type: 'edit', editPath: slot.path, copies: 1 } });
      setPrintedPath(slot.path);
      toast('Terkirim ke printer penyelenggara');
      onQueued();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mengirim', 'error');
    } finally {
      setBusy(null);
    }
  }

  const builtins = useMemo(() => BUILTIN_STICKERS.map((s) => ({ ...s, url: stickerDataUrl(s) })), []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E1015] text-white">
      <header className="flex items-center justify-between gap-2 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <Button variant="ink" size="icon" className="bg-white/10" onClick={onClose} aria-label="Tutup"><X /></Button>
        <p className="text-sm font-bold">Hias foto</p>
        <span className="w-10" />
      </header>

      {/* Stage */}
      <div ref={areaRef} className="mx-3 flex min-h-0 flex-1 items-center justify-center" onPointerDown={() => setSelected(null)}>
        {base && k ? (
          <div
            ref={stageRef}
            className="relative touch-none select-none"
            style={{ width: base.w * k, height: base.h * k }}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="pointer-events-none absolute inset-0 size-full rounded-[4px] object-contain" draggable={false} />
            {items.map((it) => {
              const isSel = it.id === selected;
              const common: React.CSSProperties = { left: it.x * k, top: it.y * k, transform: `translate(-50%,-50%) rotate(${it.rot}rad)` };
              let content: React.ReactNode;
              if (it.kind === 'image') {
                // eslint-disable-next-line @next/next/no-img-element
                content = <img src={it.src} alt="" draggable={false} style={{ width: it.size * k, height: (it.size / it.aspect) * k }} className="pointer-events-none block" />;
              } else if (it.kind === 'emoji') {
                content = <span style={{ fontSize: it.size * k, lineHeight: 1, fontFamily: EMOJI_FONT }} className="block">{it.text}</span>;
              } else {
                const { padX, padY } = textMetrics(it);
                const contrast = it.color === '#FFFFFF' ? '#1B1B1F' : '#FFFFFF';
                content = (
                  <span
                    className="block whitespace-pre"
                    style={{
                      fontFamily: FONTS[it.font].family,
                      fontWeight: 700,
                      fontSize: it.size * k,
                      lineHeight: 1.2,
                      color: it.color,
                      padding: `${padY * k}px ${padX * k}px`,
                      borderRadius: 9999,
                      background: it.pill ? contrast : undefined,
                      WebkitTextStroke: it.pill ? undefined : `${Math.max(1, it.size * 0.12 * k)}px ${contrast}`,
                      paintOrder: 'stroke fill',
                    }}
                  >
                    {it.text}
                  </span>
                );
              }
              return (
                <div key={it.id} className="absolute" style={common} onPointerDown={(e) => start(e, it, 'move')}>
                  <div className={cn('relative', isSel && 'outline-2 outline-offset-4 outline-white/90 outline-dashed')}>
                    {content}
                    {isSel ? (
                      <button
                        type="button"
                        aria-label="Ubah ukuran & putar"
                        onPointerDown={(e) => start(e, it, 'transform')}
                        className="absolute -right-5 -bottom-5 flex size-8 items-center justify-center rounded-full bg-white text-ink shadow"
                        style={{ transform: `rotate(${-it.rot}rad)` }}
                      >
                        <RotateCw className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Spinner className="size-8 text-white/70" />
        )}
      </div>

      {/* Selected item actions */}
      <div className="flex h-11 items-center justify-center gap-2 px-3">
        {sel ? (
          <>
            <Button size="sm" variant="ink" className="bg-white/10" onClick={() => setItems((xs) => [...xs.filter((x) => x.id !== sel.id), sel])}><ArrowUpToLine /> Depan</Button>
            <Button size="sm" variant="ink" className="bg-white/10" onClick={() => { setItems((xs) => xs.filter((x) => x.id !== sel.id)); setSelected(null); }}><Trash2 /> Hapus</Button>
          </>
        ) : (
          <p className="text-xs text-white/50">{items.length ? 'Ketuk stiker untuk memilih · seret untuk memindah · tarik ↻ untuk ukuran & putar' : 'Pilih stiker di bawah'}</p>
        )}
      </div>

      {/* Palette */}
      <div className="rounded-t-[20px] bg-[#181B22] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Segmented
          size="sm"
          className="mb-3 w-full [&>button]:flex-1"
          value={tab}
          onChange={setTab}
          options={[{ value: 'stiker', label: 'Stiker' }, { value: 'emoji', label: 'Emoji' }, { value: 'teks', label: 'Teks' }]}
        />
        <div className="h-[118px] overflow-y-auto">
          {tab === 'stiker' ? (
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {eventStickers.map((url) => (
                <button key={url} type="button" onClick={() => void addImage(url)} className="flex aspect-square items-center justify-center rounded-[10px] bg-white/[0.06] p-1.5 active:scale-95">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-full max-w-full object-contain" />
                </button>
              ))}
              {builtins.map((s) => (
                <button key={s.id} type="button" onClick={() => void addImage(s.url)} aria-label={s.label} className="flex aspect-square items-center justify-center rounded-[10px] bg-white/[0.06] p-1.5 active:scale-95">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" className="max-h-full max-w-full" />
                </button>
              ))}
            </div>
          ) : tab === 'emoji' ? (
            <div className="grid grid-cols-8 gap-1.5">
              {STICKER_EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => add({ kind: 'emoji', text: e, size: (base?.w ?? 1000) * 0.16 })} className="flex aspect-square items-center justify-center rounded-[10px] bg-white/[0.06] text-2xl active:scale-95" style={{ fontFamily: EMOJI_FONT }}>
                  {e}
                </button>
              ))}
            </div>
          ) : (
            <TextTab
              draft={draft}
              setDraft={setDraft}
              selected={sel?.kind === 'text' ? sel : null}
              onAdd={(t) => add({ kind: 'text', text: t, font: 'display', color: '#FFFFFF', pill: false, size: (base?.w ?? 1000) * 0.09 })}
              onUpdate={(patch) => sel && update(sel.id, patch)}
            />
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="ink" size="lg" className="bg-white/10" onClick={() => void save()} loading={busy === 'save'} disabled={!base || !!busy}>
            <Download /> Simpan
          </Button>
          {canPrint ? (
            <Button variant="sun" size="lg" onClick={() => void sendToPrinter()} loading={busy === 'print'} disabled={!base || !!busy || !!printedPath}>
              <Printer /> {printedPath ? 'Terkirim' : 'Kirim ke printer'}
            </Button>
          ) : (
            <p className="flex items-center justify-center text-center text-[11px] text-white/45">{printHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TextTab({ draft, setDraft, selected, onAdd, onUpdate }: { draft: string; setDraft: (v: string) => void; selected: Extract<Item, { kind: 'text' }> | null; onAdd: (t: string) => void; onUpdate: (p: Partial<Item>) => void }) {
  return (
    <div className="flex flex-col gap-2.5">
      {selected ? (
        <>
          <Input value={selected.text} maxLength={40} onChange={(e) => onUpdate({ text: e.target.value })} className="border-white/15 bg-white/[0.06] text-white" aria-label="Ubah teks" />
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {TEXT_FONTS.map((f) => (
              <button key={f} type="button" onClick={() => onUpdate({ font: f })} className={cn('h-8 shrink-0 rounded-full px-3 text-sm', selected.font === f ? 'bg-white text-ink' : 'bg-white/[0.08]')} style={{ fontFamily: FONTS[f].family }}>
                Aa
              </button>
            ))}
            <button type="button" onClick={() => onUpdate({ pill: !selected.pill })} className={cn('h-8 shrink-0 rounded-full px-3 text-xs font-semibold', selected.pill ? 'bg-white text-ink' : 'bg-white/[0.08]')}>Label</button>
          </div>
          <div className="flex gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => onUpdate({ color: c })} aria-label={`Warna ${c}`} className={cn('size-7 rounded-full border-2', selected.color === c ? 'border-white' : 'border-white/20')} style={{ background: c }} />
            ))}
          </div>
        </>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            onAdd(t);
            setDraft('');
          }}
        >
          <Input value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} placeholder="Tulis sesuatu…" className="flex-1 border-white/15 bg-white/[0.06] text-white placeholder:text-white/40" aria-label="Teks baru" />
          <Button type="submit" variant="sun"><Type /> Tambah</Button>
        </form>
      )}
      <p className="text-[11px] text-white/45">{selected ? 'Mengedit teks terpilih. Ketuk area kosong untuk menambah teks baru.' : 'Teks muncul di tengah foto; seret untuk memindah.'}</p>
    </div>
  );
}
