'use client';

import React, { useMemo } from 'react';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { defaultTokens } from '@/lib/frames/render';
import type { FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import { variant } from '@/lib/media-variant';

/** Stored thumbnail when available, otherwise a live render of the design. */
export function FrameThumb({ frame, className }: { frame: FrameRecord; className?: string }) {
  const tokens = useMemo(() => defaultTokens('Nama Event', 'KODE'), []);
  return frame.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={variant(frame.thumbnailUrl, { w: 480 })} alt={frame.name} loading="lazy" className={cn('max-h-full max-w-full object-contain', className)} />
  ) : (
    <FrameCanvas design={frame.design} tokens={tokens} maxRenderWidth={260} className={cn('max-h-full w-auto', className)} style={{ maxHeight: '100%' }} />
  );
}
