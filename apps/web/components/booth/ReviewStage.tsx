'use client';

import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Film, ImageIcon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { allowedFilterList, filteredCopy } from '@/lib/booth/media';
import { scaledCopy } from '@/lib/frames/render';
import type { FrameRecord } from '@/lib/frames/types';
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
}) {
  const slots = frame.slotCount;
  const [mode, setMode] = useState<'live' | 'still'>(shots.some((s) => s.burst.length) ? 'live' : 'still');
  const choosing = shots.length > slots;

  // Preview-sized copies keep filtering + rendering fast on iPad.
  const previews = useMemo(() => shots.map((s) => scaledCopy(s.still, 720)), [shots]);
  const filteredPreviews = useMemo(() => previews.map((p) => filteredCopy(p, filter)), [previews, filter]);
  const filteredBursts = useMemo(() => shots.map((s) => s.burst.map((f) => filteredCopy(f, filter))), [shots, filter]);

  const photos = useMemo(() => Array.from({ length: slots }, (_, i) => (selection[i] !== undefined ? filteredPreviews[selection[i]] : null)), [slots, selection, filteredPreviews]);
  const live = useMemo(() => Array.from({ length: slots }, (_, i) => (selection[i] !== undefined ? filteredBursts[selection[i]] : null)), [slots, selection, filteredBursts]);

  const filters = allowedFilterList(allowedFilters);

  function toggle(i: number) {
    if (!choosing) return;
    if (selection.includes(i)) onSelectionChange(selection.filter((x) => x !== i));
    else if (selection.length < slots) onSelectionChange([...selection, i]);
    else onSelectionChange([...selection.slice(0, slots - 1), i]);
  }

  return (
    <div className="kiosk booth-paper fixed inset-0 flex flex-col text-ink">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 sm:px-6">
        <Button variant="secondary" size="lg" onClick={onRetakeAll}>
          <ArrowLeft /> Ulangi semua
        </Button>
        <h1 className="text-center text-lg font-extrabold sm:text-xl">{choosing ? `Pilih ${slots} foto terbaik` : 'Cek hasilmu'}</h1>
        <Button variant="sun" size="lg" onClick={onContinue} disabled={selection.length < slots}>
          Lanjut <ArrowRight />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] md:gap-6">
        {/* Preview */}
        <div className="flex min-h-0 flex-col items-center justify-center gap-3">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <FrameCanvas
              design={frame.design}
              photos={photos}
              liveFrames={mode === 'live' ? live : undefined}
              playing={mode === 'live'}
              tokens={tokens}
              maxRenderWidth={760}
              className="max-h-full w-auto rounded-[6px] shadow-[0_18px_40px_-16px_rgba(14,20,36,0.45)]"
              style={{ maxHeight: '100%', maxWidth: '100%' }}
            />
          </div>
          {shots.some((s) => s.burst.length) ? (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'live', label: <><Film className="size-3.5" /> Live</> },
                { value: 'still', label: <><ImageIcon className="size-3.5" /> Foto</> },
              ]}
            />
          ) : null}
        </div>

        {/* Controls */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-[20px] bg-white/85 p-4 shadow-[0_1px_0_rgba(14,20,36,0.06)] backdrop-blur">
          <div>
            <p className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-muted uppercase">
              <span>{choosing ? 'Ketuk untuk memilih' : 'Foto kamu'}</span>
              {choosing ? <span className="text-ink">{selection.length}/{slots}</span> : null}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
              {shots.map((s, i) => {
                const order = selection.indexOf(i);
                return (
                  <div key={i} className="relative">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn('block aspect-[3/4] w-full overflow-hidden rounded-[12px] border-[3px] transition', order >= 0 ? 'border-ink' : 'border-transparent opacity-60')}
                    >
                      <CanvasThumb canvas={filteredPreviews[i]} />
                    </button>
                    {order >= 0 ? <span className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{order + 1}</span> : null}
                    {retakesLeft > 0 ? (
                      <button type="button" onClick={() => onRetake(i)} className="absolute right-1.5 bottom-1.5 flex size-9 items-center justify-center rounded-full bg-white/95 text-ink shadow" aria-label={`Ulangi foto ${i + 1}`}>
                        <RotateCcw className="size-4" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{retakesLeft > 0 ? `Bisa ulangi ${retakesLeft} foto lagi (ikon ↺).` : 'Kesempatan ulang foto habis.'}</p>
          </div>

          {filters.length > 1 ? (
            <div>
              <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Filter</p>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onFilterChange(f.id)}
                    className={cn('h-11 shrink-0 rounded-full border-2 px-4 text-sm font-bold transition', filter === f.id ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
