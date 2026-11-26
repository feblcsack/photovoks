'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Camera } from 'lucide-react';
import { Logo, LogoBadge, Sticker, Doodle } from '@/components/brand/scrap';
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
  onZine,
  onMediaError,
  corner,
  preview = false,
}: {
  event: AttractEvent;
  frames: FrameRecord[];
  tokens: Record<string, string>;
  mediaUrl: string | null;
  onStart?: () => void;
  /** Opens minizine mode (shown only when the event allows it). */
  onZine?: () => void;
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
  const zineButton = onZine ? (
    <Button
      variant="bubble"
      size="xl"
      className="h-[72px] text-lg"
      tabIndex={preview ? -1 : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onZine();
      }}
    >
      <BookOpen className="!size-6" /> Bikin minizine
    </Button>
  ) : null;

  const topBar = (
    <div className="relative z-10 flex items-start justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
      <div className="flex items-center gap-2">
        {hasMedia ? <LogoBadge className="size-12" /> : null}
        <span className={cn('rounded-full border-2 border-ink px-3 py-1 font-type text-[12px] font-bold tracking-[0.18em] uppercase', hasMedia ? 'bg-white text-ink' : 'bg-ink text-white')}>{event.code}</span>
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
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex h-14 items-center gap-2.5 rounded-full border-2 border-ink bg-sun px-7 text-lg font-bold text-ink shadow-[3px_3px_0_var(--color-ink)]">
                <Camera className="size-5" strokeWidth={2} /> {cta}
              </span>
              {zineButton}
            </div>
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
      <Sticker id="sparkle" className="pointer-events-none absolute top-24 left-[44%] hidden w-16 animate-float md:block" style={{ ['--r' as string]: '-10deg' }} />
      <Sticker id="heart" className="pointer-events-none absolute top-20 right-10 w-20 animate-float [animation-delay:1.2s]" style={{ ['--r' as string]: '12deg' }} />
      <Doodle kind="stars" className="pointer-events-none absolute right-10 bottom-8 w-28 text-cobalt/60" />
      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center gap-8 px-6 py-6 sm:px-10 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <Logo className="mb-1 w-[min(220px,22vh,40vw)] -rotate-3" />
          <h1 className="text-[clamp(32px,min(5.5vw,7.5vh),68px)] leading-[0.98] text-ink">
            {event.welcomeTitle || (
              <>
                Foto sekarang, <span className="inline-block -rotate-2 rounded-[14px] border-2 border-ink bg-brand px-3 text-white shadow-[3px_3px_0_var(--color-ink)]">cetak</span> kemudian.
              </>
            )}
          </h1>
          <p className="mt-3 max-w-md font-type text-lg text-ink-2">{event.welcomeSubtitle || event.name}</p>
          {event.attractShowText ? (
            <ol className="mt-4 w-full max-w-md border-y-2 border-dashed border-ink/30 py-2 font-type">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-4 py-1 text-[16px] tracking-wide uppercase">
                  <span className="text-brand">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-bold">{s}</span>
                  <span className="flex-1 border-b-2 border-dotted border-ink/20" />
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Button variant="sun" size="xl" className="h-[72px] min-w-44 text-2xl" onClick={onStart} disabled={!canStart} tabIndex={preview ? -1 : undefined}>
              <Camera className="!size-7" /> Mulai
            </Button>
            {zineButton}
          </div>
          {!canStart ? <p className="mt-3 text-sm text-danger">Belum ada frame aktif untuk event ini.</p> : <p className="mt-3 font-type text-sm text-muted">{cta}</p>}
        </div>
        <div className="hidden h-full min-h-0 items-center justify-center md:flex">
          {f ? (
            <div key={f.id} className="relative flex max-h-full animate-pop items-center justify-center" style={{ height: preview ? '70%' : 'min(70vh, 640px)' }}>
              <span className="tape absolute -top-3 left-1/2 z-10 h-7 w-28 -translate-x-1/2 rotate-[-4deg]" />
              <FrameCanvas design={f.design} tokens={tokens} maxRenderWidth={520} className="h-full w-auto rotate-[2deg] border-2 border-ink bg-white shadow-[8px_8px_0_var(--color-ink)]" style={{ maxHeight: '100%' }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
