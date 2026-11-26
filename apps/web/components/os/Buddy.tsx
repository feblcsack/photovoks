'use client';

/**
 * The guest's chosen buddy as an on-screen guide (think desktop assistant):
 * a small live 3D character in a corner with a help balloon that explains the
 * current step in its own voice. Tap it for the next tip; × hides the
 * balloon; the chevron tucks the buddy away.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Mascot3D } from '@/components/mascot/Mascot3D';
import { MASCOTS, mascotLine, type GuideMoment, type MascotId } from '@/lib/mascots';
import { cn } from '@/lib/utils';
import { Balloon } from './retro';

export function Buddy({
  id,
  moment,
  message,
  emote = 0,
  side = 'left',
  className,
  onChangeBuddy,
}: {
  id: MascotId;
  moment: GuideMoment;
  /** Overrides the scripted line (e.g. live countdown). */
  message?: string | null;
  emote?: number;
  side?: 'left' | 'right';
  className?: string;
  /** Shows a "ganti" link in the balloon. */
  onChangeBuddy?: () => void;
}) {
  const [n, setN] = useState(0);
  const [tap, setTap] = useState(0);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [tucked, setTucked] = useState(false);
  // New moment → start from its first line and show the balloon again.
  const [lastMoment, setLastMoment] = useState(moment);
  if (lastMoment !== moment) {
    setLastMoment(moment);
    setN(0);
  }
  const m = MASCOTS[id];
  const text = message ?? mascotLine(id, moment, n);
  const balloonOpen = hiddenFor !== moment || !!message;

  if (tucked) {
    return (
      <button
        type="button"
        onClick={() => setTucked(false)}
        className={cn('bevel-out fixed bottom-[calc(env(safe-area-inset-bottom)+60px)] z-40 flex h-9 items-center gap-1.5 bg-win px-2.5 font-pixel text-[13px] font-semibold', side === 'left' ? 'left-2' : 'right-2', className)}
      >
        <ChevronUp className="size-4" /> {m.name}
      </button>
    );
  }

  return (
    <div className={cn('pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+52px)] z-40 flex flex-col', side === 'left' ? 'left-1 items-start' : 'right-1 items-end', className)}>
      {balloonOpen ? (
        <Balloon
          key={`${moment}-${n}-${message ? 'm' : ''}`}
          tail={side === 'left' ? 'bottom-left' : 'bottom-right'}
          title={
            <>
              <span className="size-2.5 rounded-full border border-ink" style={{ background: m.color }} />
              {m.name}
            </>
          }
          onClose={() => setHiddenFor(moment)}
          className="pointer-events-auto mb-1 max-w-[min(260px,62vw)]"
        >
          <p>{text}</p>
          {onChangeBuddy ? (
            <button type="button" onClick={onChangeBuddy} className="mt-1 font-pixel text-[12px] text-cobalt underline underline-offset-2">
              Ganti karakter
            </button>
          ) : null}
        </Balloon>
      ) : null}
      <div className="pointer-events-auto relative">
        <button
          type="button"
          aria-label={`${m.name}: tips berikutnya`}
          onClick={() => {
            setN((x) => x + 1);
            setTap((x) => x + 1);
            setHiddenFor(null);
          }}
          className="block"
        >
          <Mascot3D id={id} framing="bust" emote={emote + tap} className="size-[clamp(84px,14vmin,128px)]" label={m.name} />
        </button>
        <button
          type="button"
          aria-label="Sembunyikan pemandu"
          onClick={() => setTucked(true)}
          className={cn('bevel-out absolute bottom-1 flex size-6 items-center justify-center bg-win', side === 'left' ? '-right-1' : '-left-1')}
        >
          <ChevronDown className="size-3.5" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
