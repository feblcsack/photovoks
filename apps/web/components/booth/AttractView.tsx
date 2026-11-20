'use client';

import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import type { EventConfig } from '@/lib/events';
import type { FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';

type AttractEvent = Pick<
  EventConfig,
  'code' | 'name' | 'status' | 'welcomeTitle' | 'welcomeSubtitle' | 'printMode' | 'attractMediaType' | 'attractCta' | 'attractShowText'
>;

/**
 * The booth home screen. Rendered full-screen in the booth and scaled down
 * (`preview`) in Pengaturan Booth, so owners see exactly what guests see.
 *
 * Two looks:
 *  - default: title + steps + rotating frame showcase,
 *  - media:   the owner's own video / image full-bleed, tap anywhere to start.
 */
export function AttractView({
  event,
  frames,
  tokens,
  mediaUrl,
  onStart,
  onMediaError,
  corner,
  preview = false,
}: {
  event: AttractEvent;
  frames: FrameRecord[];
  tokens: Record<string, string>;
  mediaUrl: string | null;
  onStart?: () => void;
  onMediaError?: () => void;
  /** Top-right slot (operator settings button). */
  corner?: React.ReactNode;
  preview?: boolean;
}) {
  const [showcase, setShowcase] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setShowcase((i) => (i + 1) % frames.length), 3500);
    return () => clearInterval(t);
  }, [frames.length]);
  const f = frames[showcase % Math.max(1, frames.length)];
  const canStart = frames.length > 0;
  const cta = event.attractCta || 'Ketuk layar untuk mulai';
  const hasMedia = !!mediaUrl && !!event.attractMediaType;

  const topBar = (
    <div className="relative z-10 flex items-start justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-[0.18em] uppercase', hasMedia ? 'bg-black/55 text-white' : 'bg-ink text-white')}>{event.code}</span>
        {event.status !== 'active' ? <span className="rounded-full bg-warn-soft px-3 py-1 text-[11px] font-bold text-warn">Mode uji · event belum aktif</span> : null}
      </div>
      {corner}
    </div>
  );

  const root = cn(
    'kiosk flex flex-col overflow-hidden',
    preview ? 'absolute inset-0' : 'fixed inset-0',
    canStart && onStart ? 'cursor-pointer' : '',
  );

  // ── Own media ──────────────────────────────────────────────────────────────
  if (hasMedia) {
    return (
      <div className={cn(root, 'bg-black text-white')} onClick={canStart ? onStart : undefined}>
        {event.attractMediaType === 'video' ? (
          <video key={mediaUrl} src={mediaUrl!} className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline preload="auto" onError={onMediaError} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={mediaUrl} src={mediaUrl!} alt="" className="absolute inset-0 size-full object-cover" onError={onMediaError} />
        )}
        {topBar}
        <div className="relative z-10 mt-auto flex flex-col items-center gap-4 px-6 pb-[max(28px,env(safe-area-inset-bottom))]">
          {event.attractShowText && (event.welcomeTitle || event.welcomeSubtitle) ? (
            <div className="max-w-2xl rounded-[18px] bg-black/55 px-6 py-4 text-center backdrop-blur-sm">
              {event.welcomeTitle ? <p className="text-[clamp(24px,4vw,44px)] leading-tight font-extrabold tracking-tight">{event.welcomeTitle}</p> : null}
              {event.welcomeSubtitle ? <p className="mt-1 text-[clamp(14px,1.8vw,18px)] text-white/80">{event.welcomeSubtitle}</p> : null}
            </div>
          ) : null}
          {canStart ? (
            <span className="inline-flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-lg font-bold text-ink shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
              <Camera className="size-5" strokeWidth={2} /> {cta}
            </span>
          ) : (
            <span className="rounded-full bg-danger px-4 py-2 text-sm font-semibold">Belum ada frame aktif untuk event ini</span>
          )}
        </div>
      </div>
    );
  }

  // ── Default look ───────────────────────────────────────────────────────────
  const steps = ['Pilih frame', 'Bergaya', event.printMode === 'off' ? 'Simpan foto' : 'Cetak', 'Scan softfile'];
  return (
    <div className={cn(root, 'booth-paper')} onClick={canStart ? onStart : undefined}>
      {topBar}
      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center gap-8 px-6 py-6 sm:px-10 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <h1 className="text-[clamp(40px,7vw,84px)] leading-[0.95] font-extrabold tracking-tight text-ink">
            {event.welcomeTitle || (
              <>
                Foto sekarang, <span className="rounded-[10px] bg-sun px-2">cetak</span> kemudian.
              </>
            )}
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink-2">{event.welcomeSubtitle || event.name}</p>
          {event.attractShowText ? (
            <ol className="mt-8 w-full max-w-md border-y-2 border-dashed border-ink/25 py-3 font-mono">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-4 py-1.5 text-[17px] tracking-wide uppercase">
                  <span className="text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-bold">{s}</span>
                  <span className="flex-1 border-b-2 border-dotted border-ink/20" />
                </li>
              ))}
            </ol>
          ) : null}
          <Button variant="sun" size="xl" className="mt-8 h-20 min-w-72 text-2xl" onClick={onStart} disabled={!canStart} tabIndex={preview ? -1 : undefined}>
            <Camera className="!size-7" /> Mulai
          </Button>
          {!canStart ? <p className="mt-3 text-sm text-danger">Belum ada frame aktif untuk event ini.</p> : <p className="mt-3 text-sm text-muted">{cta}</p>}
        </div>
        <div className="hidden h-full min-h-0 items-center justify-center md:flex">
          {f ? (
            <div key={f.id} className="flex max-h-full animate-pop items-center justify-center" style={{ height: preview ? '70%' : 'min(70vh, 640px)' }}>
              <FrameCanvas design={f.design} tokens={tokens} maxRenderWidth={520} className="h-full w-auto rotate-[2deg] rounded-[4px] shadow-[0_30px_60px_-20px_rgba(14,20,36,0.45)]" style={{ maxHeight: '100%' }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
