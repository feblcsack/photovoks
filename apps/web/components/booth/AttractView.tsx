'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Camera } from 'lucide-react';
import { Logo, LogoBadge } from '@/components/brand/scrap';
import { Bubbles, CrtTv, DesktopIcon, Goldfish, HillsWallpaper, PixelIcon, Taskbar, TaskItem, WinPanel, WinWindow } from '@/components/os/retro';
import { Button } from '@/components/ui/button';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import type { EventConfig } from '@/lib/events';
import type { FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import { WordArt } from '@/components/brand/WordArt';

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
      variant="win"
      size="xl"
      className="h-[64px] text-lg"
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
        <span className="bevel-out bg-win px-3 py-1 font-pixel text-[14px] font-bold tracking-[0.12em] text-ink uppercase">{event.code}</span>
        {event.status !== 'active' ? <span className="bevel-out bg-tip px-3 py-1 font-pixel text-[12px] font-bold text-warn">Mode uji · event belum aktif</span> : null}
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
              <span className="bevel-out inline-flex h-14 items-center gap-2.5 bg-sun px-7 font-pixel text-lg font-bold text-ink">
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

  // ── Default look: the retro desktop ───────────────────────────────────────
  const steps = ['Pilih karakter', 'Pilih frame', 'Bergaya', event.printMode === 'off' ? 'Simpan foto' : 'Cetak', 'Scan softfile'];
  const tab = preview ? -1 : undefined;
  return (
    <div className={cn(root, 'text-ink')} onClick={canStart ? onStart : undefined}>
      <HillsWallpaper />
      <Goldfish className="pointer-events-none absolute top-[14%] right-[38%] hidden w-[clamp(60px,7vw,110px)] animate-float lg:block" style={{ ['--r' as string]: '-6deg' }} />
      <Bubbles className="pointer-events-none absolute top-[8%] right-[30%] hidden w-[clamp(50px,6vw,90px)] animate-float [animation-delay:1s] md:block" />
      {topBar}

      <div className="relative z-10 flex min-h-0 flex-1 gap-4 px-3 py-3 sm:px-6">
        {/* Desktop icons */}
        <div className="hidden flex-col gap-3 md:flex" onClick={(e) => e.stopPropagation()}>
          <DesktopIcon icon="camera" label="Mulai Foto.exe" onClick={canStart ? onStart : undefined} />
          {onZine ? <DesktopIcon icon="book" label="Minizine.exe" onClick={onZine} /> : null}
          <DesktopIcon icon="folder" label="Foto Saya" />
          <DesktopIcon icon="recycle" label="Recycle Bin" />
        </div>

        <div className="grid min-h-0 flex-1 items-center gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <WinWindow title={`Selamat datang — ${event.name}`} icon="computer" className="mx-auto w-full max-w-xl" bodyClassName="flex flex-col items-center gap-3 p-4 text-center sm:p-6 md:items-start md:text-left">
            <div className="flex items-center gap-3">
              <Logo className="w-[min(110px,16vh,26vw)] -rotate-3" />
              <p className="font-display text-[clamp(26px,3.6vw,42px)] leading-none">
                Photovoks<span className="ml-1 align-top font-pixel text-[0.5em] text-brand">98</span>
              </p>
            </div>
            <h1 className="text-[clamp(26px,min(4.4vw,6vh),52px)] leading-[1.02] text-ink">
              {event.welcomeTitle || (
                <>
                  Foto sekarang, <WordArt variant="rainbow" className="mx-0.5 align-[-0.06em]">cetak</WordArt> kemudian.
                </>
              )}
            </h1>
            <p className="max-w-md font-type text-[clamp(14px,1.6vw,18px)] text-ink-2">{event.welcomeSubtitle || event.name}</p>
            {event.attractShowText ? (
              <WinPanel className="w-full max-w-md py-1.5">
                <ol className="font-pixel">
                  {steps.map((st, i) => (
                    <li key={st} className="flex items-center gap-3 py-0.5 text-[15px]">
                      <span className="text-brand tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      <span className="font-semibold">{st}</span>
                      <span className="flex-1 border-b-2 border-dotted border-ink/20" />
                    </li>
                  ))}
                </ol>
              </WinPanel>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Button variant="win-go" size="xl" className="h-[68px] min-w-44 text-2xl" onClick={onStart} disabled={!canStart} tabIndex={tab}>
                <Camera className="!size-7" /> Mulai
              </Button>
              {zineButton}
            </div>
            {!canStart ? <p className="text-sm text-danger">Belum ada frame aktif untuk event ini.</p> : <p className="font-pixel text-[14px] text-ink-2">{cta}</p>}
            {canStart ? (
              <p className="flex max-w-md items-center gap-2 border-2 border-ink bg-[#F3F1EA] px-3 py-2 text-left shadow-[3px_3px_0_var(--color-ink)]">
                <span className="shrink-0 rotate-[-6deg] bg-sun px-1.5 py-0.5 font-techno text-[11px] font-black">★ BARU</span>
                <span className="text-[13px] leading-snug">Habis foto, bikin <b className="font-[family-name:var(--font-gothic)] text-[15px]">SKCK — Surat Keterangan Cukup Kalcer</b>: photozine lipat dari fotomu sendiri.</span>
              </p>
            ) : null}
          </WinWindow>

          <div className="hidden h-full min-h-0 items-center justify-center md:flex">
            {f ? (
              <div className="relative flex max-h-full items-center justify-center" style={{ height: preview ? '72%' : 'min(66vh, 600px)' }}>
                <CrtTv className="h-full" screenClassName="h-full flex items-center justify-center bg-[#0C1E6E] p-[6%] [background-image:radial-gradient(rgb(158_216_255/0.25)_1px,transparent_1px)] [background-size:10px_10px]" label="FRAME TV">
                  <FrameCanvas key={f.id} design={f.design} tokens={tokens} maxRenderWidth={520} className="h-full w-auto animate-pop bg-white shadow-[6px_6px_0_rgb(0_0_0/0.5)]" style={{ maxHeight: '100%' }} />
                </CrtTv>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Taskbar className="relative z-10" tray={<PixelIcon name="camera" className="size-4" />}>
        <TaskItem icon="computer" active>{event.code}</TaskItem>
        {frames.length ? <TaskItem icon="folder">{frames.length} frame</TaskItem> : null}
      </Taskbar>
    </div>
  );
}
