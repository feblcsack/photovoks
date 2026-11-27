'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ADJUST_SLIDERS, isNeutral, NO_ADJUST, type Adjustments } from '@/lib/booth/grade';
import { sfx } from '@/lib/sfx';
import { cn } from '@/lib/utils';

const GROUPS = [
  { id: 'cahaya', label: 'Cahaya' },
  { id: 'warna', label: 'Warna' },
  { id: 'efek', label: 'Efek' },
] as const;

/** One-tap starting points; guests fine-tune with the sliders after. */
const QUICK: Array<{ label: string; value: Partial<Adjustments> }> = [
  { label: 'Auto cerah', value: { exposure: 18, shadows: 30, highlights: -15, vibrance: 25 } },
  { label: 'Kulit glowing', value: { exposure: 12, highlights: -20, warmth: 12, tint: 6, contrast: -8, fade: 8 } },
  { label: 'Moody', value: { exposure: -15, contrast: 30, saturation: -25, shadows: -20, vignette: 45, warmth: -10 } },
  { label: 'Tajam & pop', value: { contrast: 25, vibrance: 40, sharpness: 55, highlights: -10 } },
];

/** Full manual controls: brightness, contrast, highlights/shadows, colour, film effects. */
export function AdjustPanel({ value, onChange }: { value: Adjustments; onChange: (a: Adjustments) => void }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]['id']>('cahaya');
  const set = (k: keyof Adjustments, v: number) => onChange({ ...value, [k]: v });
  const changed = (g: string) => ADJUST_SLIDERS.some((s) => s.group === g && value[s.key]);

  return (
    <fieldset className="border-2 border-win-shadow px-2 pt-1 pb-2 [border-style:groove]">
      <legend className="px-1 font-pixel text-[13px]">Atur foto</legend>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => { sfx.tick(); onChange({ ...NO_ADJUST, ...q.value }); }}
            className="bevel-out min-h-9 bg-win px-2 font-pixel text-[12px] active:bevel-in"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div role="tablist" className="flex gap-0.5">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={cn('relative min-h-9 flex-1 px-2 font-pixel text-[13px]', group === g.id ? 'bevel-out z-10 -mb-0.5 bg-win-light font-bold' : 'bevel-out bg-win text-ink-2')}
          >
            {g.label}
            {changed(g.id) ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-cobalt" aria-label="diubah" /> : null}
          </button>
        ))}
      </div>

      <div className="bevel-in space-y-2 bg-win-light p-2">
        {ADJUST_SLIDERS.filter((s) => s.group === group).map((s) => {
          const v = value[s.key];
          const id = `adj-${s.key}`;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={id} className="font-pixel text-[13px]">{s.label}</label>
                <button
                  type="button"
                  onClick={() => set(s.key, 0)}
                  disabled={!v}
                  className={cn('bevel-in min-w-11 bg-white px-1 text-right font-pixel text-[12px] tabular-nums', !v && 'text-ink-2')}
                  aria-label={`Reset ${s.label}`}
                  title="Ketuk untuk reset"
                >
                  {v > 0 && s.min < 0 ? `+${v}` : v}
                </button>
              </div>
              <input
                id={id}
                type="range"
                min={s.min}
                max={s.max}
                step={1}
                value={v}
                onChange={(e) => set(s.key, Number(e.target.value))}
                onDoubleClick={() => set(s.key, 0)}
                className="h-8 w-full accent-[var(--color-cobalt,#2747C9)]"
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={isNeutral(value)}
        onClick={() => { sfx.tick(); onChange(NO_ADJUST); }}
        className="bevel-out mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 bg-win font-pixel text-[13px] active:bevel-in disabled:text-ink-2"
      >
        <RotateCcw className="size-3.5" /> Reset semua pengaturan
      </button>
    </fieldset>
  );
}
