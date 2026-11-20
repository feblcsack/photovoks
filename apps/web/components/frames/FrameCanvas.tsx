'use client';

/**
 * Renders a frame design into a <canvas> using the shared renderer.
 * - `photos`: one drawable per slot (null → placeholder when `placeholders`)
 * - `liveFrames`: optional per-slot burst frames → animates like a live photo
 */
import React, { useEffect, useRef, useState } from 'react';
import { prepareDesign, renderDesign, type Drawable } from '@/lib/frames/render';
import type { FrameDesign } from '@/lib/frames/types';
import { boomerang } from '@/lib/booth/media';
import { cn } from '@/lib/utils';

export interface FrameCanvasProps {
  design: FrameDesign;
  photos?: (Drawable | null)[];
  liveFrames?: (Drawable[] | null)[];
  playing?: boolean;
  fps?: number;
  placeholders?: boolean;
  tokens?: Record<string, string>;
  /** Max rendered pixel width (device pixels) — keeps previews cheap. */
  maxRenderWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
}

export function FrameCanvas({ design, photos, liveFrames, playing = false, fps = 10, placeholders = true, tokens, maxRenderWidth = 900, className, style, onReady }: FrameCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [assets, setAssets] = useState<Map<string, Drawable> | null>(null);

  useEffect(() => {
    let cancelled = false;
    prepareDesign(design).then((m) => {
      if (!cancelled) setAssets(m);
    });
    return () => {
      cancelled = true;
    };
  }, [design]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !assets) return;
    const scale = Math.min(1, maxRenderWidth / design.width);
    canvas.width = Math.round(design.width * scale);
    canvas.height = Math.round(design.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (frameIdx: number | null) => {
      const ph = photos?.map((p, slot) => {
        const live = liveFrames?.[slot];
        if (frameIdx !== null && live && live.length) {
          const seq = boomerang(live);
          return seq[frameIdx % seq.length];
        }
        return p;
      });
      renderDesign(ctx, design, { photos: ph, assets, placeholders, tokens, scale });
    };

    draw(null);
    onReady?.();
    const hasLive = playing && liveFrames?.some((l) => l && l.length > 1);
    if (!hasLive) return;
    let i = 0;
    const timer = setInterval(() => draw(i++), 1000 / fps);
    return () => clearInterval(timer);
  }, [assets, design, photos, liveFrames, playing, fps, placeholders, tokens, maxRenderWidth, onReady]);

  return (
    <canvas
      ref={ref}
      className={cn('block h-auto max-w-full', !assets && 'skeleton', className)}
      style={{ aspectRatio: `${design.width} / ${design.height}`, ...style }}
    />
  );
}
