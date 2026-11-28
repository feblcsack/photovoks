'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Film, ImageIcon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HillsWallpaper, PixelIcon, Taskbar, TaskItem, WinPanel, WinWindow } from '@/components/os/retro';
import { sfx } from '@/lib/sfx';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { allowedFilterList } from '@/lib/booth/media';
import { ensureMemeFonts, MEME_STYLES, styledCopy, type MemeStyle } from '@/lib/booth/meme';
import { NO_ADJUST, type Adjustments } from '@/lib/booth/grade';
import { AdjustPanel } from './AdjustPanel';
import { scaledCopy } from '@/lib/frames/render';
import { raisePhotos, type FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import { CanvasThumb, type Shot } from './CaptureStage';

export function ReviewStage({
  frame,
  shots,
  selection,
  onSelectionChange,
  filter,
  onFilterChange,
  allowedFilters,
  retakesLeft,
  onRetake,
  onRetakeAll,
  onContinue,
  tokens,
  memeEnabled = false,
  meme = 'none',
  onMemeChange,
  adjust = NO_ADJUST,
  onAdjustChange,
}: {
  frame: FrameRecord;
  shots: Shot[];
  selection: number[];
  onSelectionChange: (s: number[]) => void;
  filter: string;
  onFilterChange: (f: string) => void;
  allowedFilters: string[];
  retakesLeft: number;
  onRetake: (shotIndex: number) => void;
  onRetakeAll: () => void;
  onContinue: () => void;
  tokens: Record<string, string>;
  memeEnabled?: boolean;
  meme?: MemeStyle;
  onMemeChange?: (m: MemeStyle) => void;
  adjust?: Adjustments;
  onAdjustChange?: (a: Adjustments) => void;
}) {
  const slots = frame.slotCount;
  const [mode, setMode] = useState<'live' | 'still'>(shots.some((s) => s.burst.length) ? 'live' : 'still');
  const choosing = shots.length > slots;

  // Preview-sized copies keep filtering + rendering fast on iPad.
  const previews = useMemo(() => shots.map((s) => scaledCopy(s.still, 720)), [shots]);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    if (!memeEnabled) return;
    let alive = true;
    void ensureMemeFonts().then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [memeEnabled]);
  const look: MemeStyle = memeEnabled ? meme : 'none';
  const design = useMemo(() => (look === 'none' ? frame.design : raisePhotos(frame.design)), [look, frame.design]);
  // Sliders move fast; the heavy per-pixel grade follows a deferred copy so dragging stays smooth.
  const grade = useDeferredValue(adjust);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady re-renders the meme text once fonts load
  const filteredPreviews = useMemo(() => previews.map((p) => styledCopy(p, filter, look, grade)), [previews, filter, look, grade, fontsReady]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredBursts = useMemo(() => shots.map((s) => s.burst.map((f) => styledCopy(f, filter, look, grade))), [shots, filter, look, grade, fontsReady]);
  // Tiny thumbnails so guests can see each meme/filter on their own photo before choosing.
  const thumbSource = previews[selection[0] ?? 0];
  const thumbBase = useMemo(() => (thumbSource ? scaledCopy(thumbSource, 200) : null), [thumbSource]);
  const memeThumbs = useMemo(
    () => (memeEnabled && thumbBase ? MEME_STYLES.map((m) => styledCopy(thumbBase, filter, m.id, grade)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memeEnabled, thumbBase, filter, grade, fontsReady],
  );

  const photos = useMemo(() => Array.from({ length: slots }, (_, i) => (selection[i] !== undefined ? filteredPreviews[selection[i]] : null)), [slots, selection, filteredPreviews]);
  const live = useMemo(() => Array.from({ length: slots }, (_, i) => (selection[i] !== undefined ? filteredBursts[selection[i]] : null)), [slots, selection, filteredBursts]);

  const filters = useMemo(() => allowedFilterList(allowedFilters), [allowedFilters]);
  const filterThumbs = useMemo(() => (thumbBase && filters.length > 1 ? filters.map((f) => styledCopy(thumbBase, f.id, 'none', grade)) : []), [thumbBase, filters, grade]);

  function toggle(i: number) {
    if (!choosing) return;
    if (selection.includes(i)) onSelectionChange(selection.filter((x) => x !== i));
    else if (selection.length < slots) onSelectionChange([...selection, i]);
    else onSelectionChange([...selection.slice(0, slots - 1), i]);
  }

  const hasLive = shots.some((s) => s.burst.length);
  return (
    <div className="kiosk fixed inset-0 flex flex-col overflow-hidden text-ink">
      <HillsWallpaper />
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 sm:px-5">
        <Button variant="win" size="lg" onClick={() => { sfx.back(); onRetakeAll(); }}>
          <ArrowLeft /> <span className="hidden sm:inline">Ulangi semua</span><span className="sm:hidden">Ulang</span>
        </Button>
        <h1 className="min-w-0 truncate text-center text-[clamp(20px,3vw,32px)] text-white [text-shadow:2px_2px_0_#1A1410]">{choosing ? `Pilih ${slots} foto terbaik` : 'Cek hasilmu ✶'}</h1>
        <Button variant="win-go" size="lg" className="text-[17px]" onClick={() => { sfx.select(); onContinue(); }} disabled={selection.length < slots}>
          Lanjut <ArrowRight />
        </Button>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] md:gap-5">
        {/* Preview window */}
        <WinWindow
          title={`Pratinjau — ${frame.name}`}
          icon="tv"
          className="min-h-0"
          bodyClassName="flex min-h-0 flex-col items-center justify-center gap-3 bg-[#0C1E6E] p-3 [background-image:radial-gradient(rgb(158_216_255/0.25)_1px,transparent_1px)] [background-size:12px_12px]"
          status={<><span className="bevel-in px-1.5">{slots} slot</span><span className="bevel-in px-1.5">Filter: {filters.find((f) => f.id === filter)?.label ?? 'Asli'}</span></>}
        >
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <FrameCanvas
              design={design}
              photos={photos}
              liveFrames={mode === 'live' ? live : undefined}
              playing={mode === 'live'}
              tokens={tokens}
              maxRenderWidth={760}
              className="max-h-full w-auto bg-white shadow-[6px_6px_0_rgb(0_0_0/0.45)]"
              style={{ maxHeight: '100%', maxWidth: '100%' }}
            />
          </div>
          {hasLive ? (
            <div className="flex gap-1">
              <Button variant="win" size="sm" className={mode === 'live' ? 'bevel-in bg-win-mid' : ''} onClick={() => setMode('live')}><Film /> Live</Button>
              <Button variant="win" size="sm" className={mode === 'still' ? 'bevel-in bg-win-mid' : ''} onClick={() => setMode('still')}><ImageIcon /> Foto</Button>
            </div>
          ) : null}
        </WinWindow>

        {/* Files + filters window */}
        <WinWindow title="Foto Saya" icon="folder" menu={['File', 'Edit', 'Lihat']} className="min-h-0" bodyClassName="flex min-h-0 flex-col gap-3 overflow-y-auto p-2">
          <WinPanel>
            <p className="mb-2 flex items-center justify-between font-pixel text-[13px] text-ink-2">
              <span>{choosing ? 'Ketuk untuk memilih' : `${shots.length} objek`}</span>
              {choosing ? <span className="font-bold text-ink">{selection.length}/{slots} dipilih</span> : null}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
              {shots.map((s, i) => {
                const order = selection.indexOf(i);
                return (
                  <div key={i} className="relative flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn('block aspect-[3/4] w-full overflow-hidden border-2 bg-white p-0.5 transition', order >= 0 ? 'border-win-select' : 'border-transparent opacity-55')}
                    >
                      <CanvasThumb canvas={filteredPreviews[i]} />
                    </button>
                    <span className={cn('max-w-full truncate px-1 font-pixel text-[12px]', order >= 0 && 'win-focus win-selected')}>Foto_{String(i + 1).padStart(2, '0')}</span>
                    {order >= 0 && choosing ? <span className="absolute top-1 left-1 flex size-6 items-center justify-center border-2 border-ink bg-sun font-pixel text-xs font-bold">{order + 1}</span> : null}
                    {retakesLeft > 0 ? (
                      <button type="button" onClick={() => onRetake(i)} className="bevel-out absolute right-1 bottom-6 flex size-9 items-center justify-center bg-win active:bevel-pressed" aria-label={`Ulangi foto ${i + 1}`}>
                        <RotateCcw className="size-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
              <PixelIcon name="info" className="size-4" />
              {retakesLeft > 0 ? `Bisa ulangi ${retakesLeft} foto lagi (tombol ↺).` : 'Kesempatan ulang foto habis.'}
            </p>
          </WinPanel>

          {memeEnabled && onMemeChange ? (
            <fieldset className="border-2 border-win-shadow px-2 pt-1 pb-2 [border-style:groove]">
              <legend className="px-1 font-pixel text-[13px]">Gaya meme ✶</legend>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-3">
                {MEME_STYLES.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    title={m.hint}
                    aria-pressed={meme === m.id}
                    onClick={() => { sfx.tick(); onMemeChange(m.id); }}
                    className={cn('flex flex-col items-stretch gap-1 p-1 text-left', meme === m.id ? 'bevel-in bg-win-light' : 'bevel-out bg-win active:bevel-pressed')}
                  >
                    <span className={cn('block aspect-[3/4] w-full overflow-hidden border-2 bg-white', meme === m.id ? 'border-win-select' : 'border-transparent')}>
                      {memeThumbs[i] ? <CanvasThumb canvas={memeThumbs[i]} /> : null}
                    </span>
                    <span className={cn('block truncate font-pixel text-[12px] leading-tight', meme === m.id && 'font-bold')}>{m.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 truncate text-[11px] text-ink-2">{MEME_STYLES.find((m) => m.id === meme)?.hint}</p>
            </fieldset>
          ) : null}

          {filters.length > 1 ? (
            <fieldset className="border-2 border-win-shadow px-2 pt-1 pb-2 [border-style:groove]">
              <legend className="px-1 font-pixel text-[13px]">Filter</legend>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-3">
                {filters.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => { sfx.tick(); onFilterChange(f.id); }}
                    className={cn('flex flex-col items-stretch gap-1 p-1 text-left', filter === f.id ? 'bevel-in bg-win-light' : 'bevel-out bg-win active:bevel-pressed')}
                  >
                    <span className={cn('block aspect-square w-full overflow-hidden border-2 bg-white', filter === f.id ? 'border-win-select' : 'border-transparent')}>
                      {filterThumbs[i] ? <CanvasThumb canvas={filterThumbs[i]} /> : null}
                    </span>
                    <span className={cn('block truncate font-pixel text-[12px] leading-tight', filter === f.id && 'font-bold')}>{f.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {onAdjustChange ? <AdjustPanel value={adjust} onChange={onAdjustChange} /> : null}
        </WinWindow>
      </div>

      <Taskbar className="relative z-10">
        <TaskItem icon="camera">Kamera.exe</TaskItem>
        <TaskItem icon="tv" active>Pratinjau</TaskItem>
      </Taskbar>
    </div>
  );
}
