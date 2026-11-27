'use client';

/**
 * Frame picker styled like a game-console home menu: drifting ribbons on deep
 * blue, a horizontal row of categories and a vertical list of frames where the
 * focused one grows. Swipe/scroll/arrow keys move, tap the focused frame (or
 * "Pilih") to start.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, LayoutGrid, RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { XmbBackdrop, useClock } from '@/components/os/retro';
import type { FrameRecord } from '@/lib/frames/types';
import { sfx } from '@/lib/sfx';
import { cn } from '@/lib/utils';
import { variant } from '@/lib/media-variant';

type Item = { kind: 'frame'; frame: FrameRecord } | { kind: 'zine' };
type CatId = 'all' | 'strip' | 'portrait' | 'landscape' | 'zine';

const CATS: Record<CatId, { label: string; icon: React.ReactNode }> = {
  all: { label: 'Semua frame', icon: <LayoutGrid /> },
  strip: { label: 'Strip', icon: <RectangleVertical /> },
  portrait: { label: 'Potret', icon: <Square /> },
  landscape: { label: 'Lanskap', icon: <RectangleHorizontal /> },
  zine: { label: 'Minizine', icon: <BookOpen /> },
};

export function frameCategory(f: Pick<FrameRecord, 'design'>): Exclude<CatId, 'all' | 'zine'> {
  const { width, height } = f.design;
  if (height / width >= 2) return 'strip';
  return width > height ? 'landscape' : 'portrait';
}

function shapeLabel(f: FrameRecord) {
  const c = frameCategory(f);
  return c === 'strip' ? 'Strip' : c === 'landscape' ? 'Lanskap' : 'Potret';
}

export function XmbFramePicker({ frames, tokens, eventName, onPick, onZine, onBack }: {
  frames: FrameRecord[];
  tokens: Record<string, string>;
  eventName: string;
  onPick: (f: FrameRecord) => void;
  onZine?: () => void;
  onBack: () => void;
}) {
  const clock = useClock();
  const cats = useMemo(() => {
    const list: CatId[] = ['all'];
    for (const c of ['strip', 'portrait', 'landscape'] as const) if (frames.some((f) => frameCategory(f) === c)) list.push(c);
    // Only one shape → the "all" column already says everything.
    if (list.length === 2) list.splice(1, 1);
    if (onZine) list.push('zine');
    return list;
  }, [frames, onZine]);
  const [cat, setCat] = useState<CatId>('all');
  const [selBy, setSelBy] = useState<Partial<Record<CatId, number>>>({});
  const items = useMemo<Item[]>(() => {
    if (cat === 'zine') return [{ kind: 'zine' }];
    return frames.filter((f) => cat === 'all' || frameCategory(f) === cat).map((frame) => ({ kind: 'frame', frame }));
  }, [cat, frames]);
  const sel = Math.min(selBy[cat] ?? 0, Math.max(0, items.length - 1));
  const setSel = (i: number) => {
    const n = Math.max(0, Math.min(items.length - 1, i));
    if (n !== sel) sfx.tick();
    setSelBy((s) => ({ ...s, [cat]: n }));
  };
  const moveCat = (d: number) => {
    const i = cats.indexOf(cat);
    const n = Math.max(0, Math.min(cats.length - 1, i + d));
    if (n !== i) {
      sfx.tick();
      setCat(cats[n]);
    }
  };
  const pick = (it: Item | undefined) => {
    if (!it) return;
    sfx.select();
    if (it.kind === 'zine') onZine?.();
    else onPick(it.frame);
  };

  // Measure the list area to size the focused item.
  const listRef = useRef<HTMLDivElement>(null);
  const [{ h, w }, setSize] = useState({ h: 600, w: 1000 });
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setSize({ h: el.clientHeight, w: el.clientWidth });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  // Focused thumbnail: tall, but never wider than ~40% of the screen (phones).
  const big = Math.round(Math.max(150, Math.min(h * 0.62, 380, (w * 0.4) / 0.78)));
  const small = 78;
  const gap = 18;
  const anchor = Math.round(h * 0.08);

  // Keyboard + wheel + swipe
  const st = useRef({ sel, setSel, moveCat, pick, items, onBack });
  useEffect(() => {
    st.current = { sel, setSel, moveCat, pick, items, onBack };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = st.current;
      if (e.key === 'ArrowDown') s.setSel(s.sel + 1);
      else if (e.key === 'ArrowUp') s.setSel(s.sel - 1);
      else if (e.key === 'ArrowRight') s.moveCat(1);
      else if (e.key === 'ArrowLeft') s.moveCat(-1);
      else if (e.key === 'Enter') s.pick(s.items[s.sel]);
      else if (e.key === 'Escape' || e.key === 'Backspace') s.onBack();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const wheelLock = useRef(0);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipedAt = useRef(0);

  const today = new Date();
  return (
    <div
      className="kiosk fixed inset-0 overflow-hidden text-white"
      onWheel={(e) => {
        const now = Date.now();
        if (now - wheelLock.current < 160) return;
        wheelLock.current = now;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) moveCat(e.deltaX > 0 ? 1 : -1);
        else setSel(sel + (e.deltaY > 0 ? 1 : -1));
      }}
      onClickCapture={(e) => {
        // A swipe that ends on a frame must not also pick it.
        if (Date.now() - swipedAt.current < 300) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
        swipedAt.current = Date.now();
        if (Math.abs(dx) > Math.abs(dy)) moveCat(dx < 0 ? 1 : -1);
        else setSel(sel + (dy < 0 ? 1 : -1) * Math.max(1, Math.round(Math.abs(dy) / 120)));
      }}
    >
      <XmbBackdrop />

      {/* Status: event + clock, top right like a console home screen */}
      <div className="absolute top-[max(14px,env(safe-area-inset-top))] right-4 z-10 text-right sm:right-8">
        <p className="text-[clamp(18px,2.4vw,26px)] font-light tabular-nums" suppressHydrationWarning>
          {today.getDate()}/{today.getMonth() + 1} <span className="font-semibold">{clock}</span>
        </p>
        <p className="max-w-[46vw] truncate text-[12px] tracking-wider text-white/70 uppercase">{eventName}</p>
      </div>
      <div className="absolute top-[max(14px,env(safe-area-inset-top))] left-4 z-10 sm:left-8">
        <Button variant="win" size="md" onClick={() => { sfx.back(); onBack(); }}><ArrowLeft /> Kembali</Button>
      </div>

      {/* Category row */}
      <nav className="absolute inset-x-0 top-[clamp(70px,14vh,130px)] z-10">
        <div className="no-scrollbar flex items-end gap-[clamp(18px,4vw,56px)] overflow-x-auto px-[clamp(20px,16vw,240px)]">
          {cats.map((c) => {
            const on = c === cat;
            return (
              <button
                key={c}
                type="button"
                onClick={() => { if (!on) { sfx.tick(); setCat(c); } }}
                className={cn('flex shrink-0 flex-col items-center gap-1.5 transition-all duration-300', on ? 'opacity-100' : 'opacity-55 hover:opacity-80')}
              >
                <span className={cn('flex items-center justify-center transition-all duration-300 [&_svg]:size-full [&_svg]:drop-shadow-[0_0_10px_rgba(255,255,255,0.55)]', on ? 'size-[clamp(46px,6vw,64px)]' : 'size-[clamp(32px,4vw,42px)]')} style={{ strokeWidth: 1.4 }}>
                  {CATS[c].icon}
                </span>
                <span className={cn('text-[clamp(12px,1.4vw,16px)] whitespace-nowrap [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]', on ? 'font-semibold' : 'invisible')}>{CATS[c].label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Item column */}
      <div ref={listRef} className="absolute inset-x-0 top-[calc(clamp(70px,14vh,130px)+96px)] bottom-[64px] z-10 overflow-hidden">
        {items.length === 0 ? <p className="px-[clamp(20px,16vw,240px)] pt-10 text-white/70">Tidak ada frame di kategori ini.</p> : null}
        {items.map((it, i) => {
          const d = i - sel;
          const on = d === 0;
          const y = d === 0 ? anchor : d < 0 ? anchor + d * (small + gap) - 24 : anchor + big + gap + (d - 1) * (small + gap);
          const hidden = y < -small * 2 || y > h + small;
          if (hidden) return null;
          return (
            <button
              key={it.kind === 'zine' ? 'zine' : it.frame.id}
              type="button"
              onClick={() => (on ? pick(it) : setSel(i))}
              className="absolute left-[clamp(16px,16vw,240px)] flex max-w-[calc(100vw-32px)] items-center gap-[clamp(14px,2vw,28px)] text-left transition-[transform,opacity] duration-300 ease-out"
              style={{ transform: `translateY(${y}px)`, opacity: on ? 1 : d < 0 ? 0.45 : 0.75 }}
            >
              <span
                className={cn('flex shrink-0 items-center justify-center transition-all duration-300', on ? 'select-glow rounded-[6px] bg-white/10' : '')}
                style={{ height: on ? big : small, width: on ? Math.round(big * 0.78) : Math.round(small * 0.78) }}
              >
                {it.kind === 'zine' ? (
                  <span className="flex size-[86%] flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-lime text-ink shadow-[4px_4px_0_var(--color-ink)]">
                    <BookOpen className="size-1/3" strokeWidth={1.5} />
                    {on ? <span className="font-display text-xl">Zine</span> : null}
                  </span>
                ) : it.frame.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={variant(it.frame.thumbnailUrl, { w: 720 })} alt="" className="max-h-full max-w-full bg-white object-contain shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]" draggable={false} />
                ) : (
                  <FrameCanvas design={it.frame.design} tokens={tokens} maxRenderWidth={on ? 420 : 160} className="max-h-full w-auto bg-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]" style={{ maxHeight: '100%', maxWidth: '100%' }} />
                )}
              </span>
              <span className="min-w-0">
                <span className={cn('block truncate leading-tight [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]', on ? 'text-[clamp(22px,3vw,36px)] font-semibold' : 'text-[clamp(15px,1.8vw,19px)]')}>
                  {it.kind === 'zine' ? 'Bikin minizine' : it.frame.name}
                </span>
                {on ? (
                  <>
                    <span className="mt-1 block text-[clamp(13px,1.5vw,16px)] text-white/75">
                      {it.kind === 'zine' ? '8 halaman dari 1 lembar kertas · ada panduan lipat' : `${it.frame.slotCount} pose · ${shapeLabel(it.frame)}`}
                    </span>
                    <span className="mt-4 inline-flex">
                      <span className="bevel-out flex h-12 items-center gap-2 bg-sun px-4 font-pixel text-[clamp(15px,1.8vw,18px)] font-bold whitespace-nowrap text-ink sm:px-5">
                        <Check className="size-5" /> {it.kind === 'zine' ? 'Mulai zine' : 'Pakai'}<span className="hidden sm:inline">{it.kind === 'zine' ? '' : ' frame ini'}</span>
                      </span>
                    </span>
                  </>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Button hints */}
      <footer className="absolute inset-x-0 bottom-0 z-10 flex h-[64px] items-center justify-end gap-5 px-6 pb-[env(safe-area-inset-bottom)] text-[14px] text-white/85">
        <span className="hidden items-center gap-1.5 sm:flex"><Hint>↕</Hint> Geser frame</span>
        <span className="hidden items-center gap-1.5 sm:flex"><Hint>↔</Hint> Kategori</span>
        <span className="flex items-center gap-1.5"><Hint>✕</Hint> Ketuk untuk pilih</span>
        <button type="button" onClick={() => { sfx.back(); onBack(); }} className="flex items-center gap-1.5"><Hint>○</Hint> Kembali</button>
      </footer>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="flex size-6 items-center justify-center rounded-full border border-white/70 text-[12px] leading-none">{children}</span>;
}
