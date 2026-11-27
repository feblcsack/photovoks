'use client';

/**
 * Progress bar where the yellow campus bus (bikun) drives from halte to halte
 * until it reaches the Rektorat. `value` 0–100, or null for "on its way"
 * (indeterminate loop). With `durationMs` the bus glides to the new value.
 */
import React from 'react';
import { Bikun } from './campus';
import { cn } from '@/lib/utils';

const DEFAULT_STOPS = ['Stasiun UI', 'FIB', 'FT', 'Rektorat'];

export function BikunProgress({
  value,
  label,
  stops = DEFAULT_STOPS,
  durationMs = 400,
  className,
  done,
}: {
  value: number | null;
  label?: React.ReactNode;
  stops?: string[];
  durationMs?: number;
  className?: string;
  /** Text shown when the bus has arrived (value ≥ 100). */
  done?: React.ReactNode;
}) {
  const v = value === null ? null : Math.max(0, Math.min(100, value));
  const arrived = v !== null && v >= 100;
  const moving = !arrived;
  return (
    <div className={cn('w-full', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? undefined} aria-label={typeof label === 'string' ? label : 'Progres'}>
      <div className="bevel-in relative h-[74px] overflow-hidden bg-[linear-gradient(#9ED8FF_0%,#CFEFFF_58%,#7CC46A_58%,#5FA94F_66%,#5B5E66_66%)]">
        {/* halte signs */}
        {stops.map((s, i) => {
          const x = stops.length === 1 ? 100 : (i / (stops.length - 1)) * 100;
          const reached = v !== null && v >= x - 0.5;
          return (
            <span
              key={s}
              className={cn('absolute top-1.5 flex flex-col', i === 0 ? 'items-start' : i === stops.length - 1 ? '-translate-x-full items-end' : '-translate-x-1/2 items-center')}
              style={{ left: `calc(6px + (100% - 12px) * ${x / 100})` }}
            >
              <span className={cn('border-2 border-ink px-1 font-pixel text-[9px] leading-[13px] whitespace-nowrap', reached ? 'bg-sun text-ink' : 'bg-cobalt text-white')}>{s}</span>
              <span className="h-5 w-[3px] bg-ink" />
            </span>
          );
        })}
        {/* road markings */}
        <span className="absolute inset-x-0 bottom-[11px] h-[3px] [background-image:repeating-linear-gradient(90deg,#FFF6C4_0_14px,transparent_14px_30px)]" />
        {/* the bus */}
        <span
          className={cn('absolute bottom-[3px] h-[34px] w-[92px]', v === null && 'bikun-loop')}
          style={v === null ? undefined : { left: `calc((100% - 92px) * ${v / 100})`, transition: `left ${durationMs}ms linear` }}
        >
          {moving ? <span className="bikun-puff absolute bottom-1 -left-2 size-3 rounded-full bg-white/80" /> : null}
          <span className={cn('block size-full', moving && 'bikun-bounce')}>
            <Bikun moving={moving} className="size-full" />
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-pixel text-[13px] text-ink-2">
        <span className="min-w-0 truncate">{arrived && done ? done : label}</span>
        {v !== null ? <span className="shrink-0 font-bold tabular-nums">{Math.round(v)}%</span> : null}
      </div>
    </div>
  );
}
