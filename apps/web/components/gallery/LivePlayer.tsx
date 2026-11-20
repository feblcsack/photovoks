'use client';

/**
 * Plays the live-photo sprite of a session (rows = shots, cols = burst frames)
 * as a smooth boomerang loop. One image download, drawn on a canvas; pauses
 * when scrolled out of view to save battery.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { boomerang } from '@/lib/booth/media';

const SPEEDS = [
  { label: '0.5×', fps: 6 },
  { label: '1×', fps: 12 },
  { label: '2×', fps: 22 },
];

export function LivePlayer({ spriteUrl, frames, shots, className, controls = true }: { spriteUrl: string; frames: number; shots: number; className?: string; controls?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shot, setShot] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => setImg(el);
    el.src = spriteUrl;
  }, [spriteUrl]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(c);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !img || !frames) return;
    const cellW = img.naturalWidth / frames;
    const cellH = img.naturalHeight / Math.max(1, shots);
    c.width = Math.round(cellW);
    c.height = Math.round(cellH);
    const ctx = c.getContext('2d')!;
    const seq = boomerang(Array.from({ length: frames }, (_, i) => i));
    let i = 0;
    const draw = () => ctx.drawImage(img, seq[i % seq.length] * cellW, shot * cellH, cellW, cellH, 0, 0, c.width, c.height);
    draw();
    if (!playing || !visible) return;
    let raf = 0;
    let last = 0;
    const interval = 1000 / SPEEDS[speed].fps;
    const loop = (t: number) => {
      if (t - last >= interval) {
        last = t;
        i++;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [img, frames, shots, shot, speed, playing, visible]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="relative overflow-hidden rounded-[12px] bg-black">
        <canvas ref={canvasRef} className={cn('block h-auto w-full', !img && 'skeleton aspect-[3/4]')} />
        {controls ? (
          <button type="button" onClick={() => setPlaying((p) => !p)} className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur" aria-label={playing ? 'Jeda' : 'Putar'}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
        ) : null}
      </div>
      {controls ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {Array.from({ length: shots }).map((_, i) => (
              <button key={i} type="button" onClick={() => setShot(i)} className={cn('h-7 min-w-7 rounded-[8px] px-2 text-xs font-bold', shot === i ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink-2')}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-[9px] bg-ink/[0.06] p-0.5">
            {SPEEDS.map((s, i) => (
              <button key={s.label} type="button" onClick={() => setSpeed(i)} className={cn('h-6 rounded-[7px] px-2 text-[11px] font-bold', speed === i ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
