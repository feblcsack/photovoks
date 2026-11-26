'use client';

/**
 * React wrapper around the lazily loaded three.js buddy stage. Falls back to a
 * flat badge when WebGL is unavailable (old devices, blocked GPU).
 */
import React, { useEffect, useRef, useState } from 'react';
import { MASCOTS, MASCOT_IDS, type MascotId } from '@/lib/mascots';
import { cn } from '@/lib/utils';
import type { Stage, StageOptions } from './scene';

export function Mascot3D({
  id,
  emote = 0,
  spin = false,
  pedestal = false,
  framing = 'full',
  draggable = false,
  className,
  label,
}: {
  id: MascotId;
  /** Change this number to play the character's emote. */
  emote?: number;
  spin?: boolean;
  pedestal?: boolean;
  framing?: StageOptions['framing'];
  draggable?: boolean;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ id, spin });
  useEffect(() => {
    latest.current = { id, spin };
  }, [id, spin]);

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    import('./scene')
      .then(({ createStage }) => {
        if (!alive) return;
        try {
          stage.current = createStage(canvas, latest.current.id, { spin: latest.current.spin, pedestal, framing, draggable });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      stage.current?.dispose();
      stage.current = null;
    };
  }, [pedestal, framing, draggable]);

  useEffect(() => {
    stage.current?.setCharacter(id);
  }, [id]);
  useEffect(() => {
    stage.current?.setSpin(spin);
  }, [spin]);
  useEffect(() => {
    if (emote) stage.current?.emote();
  }, [emote]);

  const m = MASCOTS[id];
  if (failed) {
    return (
      <div role="img" aria-label={label ?? m.name} className={cn('flex items-center justify-center', className)}>
        <span className="flex aspect-square w-[70%] max-w-40 items-center justify-center rounded-full border-2 border-ink font-display text-[min(48px,40%)] text-white shadow-[3px_3px_0_var(--color-ink)]" style={{ background: m.color }}>
          {m.name.replace('Si ', '').slice(0, 1)}
        </span>
      </div>
    );
  }
  return <canvas ref={canvasRef} role="img" aria-label={label ?? m.name} className={cn('block touch-none', className)} />;
}

let portraitCache: Record<string, string> | null = null;
let portraitPromise: Promise<Record<string, string>> | null = null;

/** Head-and-shoulders snapshots of every buddy (rendered once, cached). */
export function useMascotPortraits(): Record<string, string> | null {
  const [p, setP] = useState(portraitCache);
  useEffect(() => {
    if (portraitCache) return;
    portraitPromise ??= import('./scene').then(({ renderPortraits }) => {
      try {
        portraitCache = renderPortraits(MASCOT_IDS, 256);
      } catch {
        portraitCache = {};
      }
      return portraitCache;
    });
    let alive = true;
    void portraitPromise.then((r) => alive && setP(r));
    return () => {
      alive = false;
    };
  }, []);
  return p;
}
