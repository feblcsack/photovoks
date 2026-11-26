'use client';

/**
 * "Where" postcard for the fixed event location (UI Depok): a live, pannable
 * OpenStreetMap preview on the left, a handwritten note + stamp + postmark on
 * the right, and buttons to open the map / get directions.
 *
 * The map only captures touch after a tap ("Ketuk untuk geser peta") so it
 * never hijacks page scrolling on phones.
 */
import React, { useState } from 'react';
import { ExternalLink, Navigation } from 'lucide-react';
import { Logo } from '@/components/brand/scrap';
import { PixelIcon } from '@/components/os/retro';
import { LOCATION, directionsUrl, googleMapsUrl, osmEmbedUrl, osmUrl } from '@/lib/location';
import { cn } from '@/lib/utils';

export function LocationCard({ eventName, dateLabel, note, className }: { eventName?: string; dateLabel?: string; note?: string; className?: string }) {
  const [active, setActive] = useState(false);
  return (
    <div className={cn('paper-card relative grid gap-4 rounded-[6px] p-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:p-5', className)}>
      {/* Left: "WHEN / WHERE" cards */}
      <div className="flex min-w-0 flex-col gap-3">
        {dateLabel ? (
          <div className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-white px-3 py-2 shadow-[3px_3px_0_var(--color-ink)]">
            <div className="min-w-0">
              <p className="font-type text-[10px] tracking-[0.25em] text-brand uppercase">When</p>
              <p className="truncate font-display text-lg leading-tight">{dateLabel}</p>
            </div>
            <PixelIcon name="hourglass" className="size-8" />
          </div>
        ) : null}
        <div className="overflow-hidden rounded-[10px] border-2 border-ink bg-white shadow-[3px_3px_0_var(--color-ink)]">
          <div className="relative aspect-[4/3] w-full bg-sky">
            <iframe
              title={`Peta ${LOCATION.name}`}
              src={osmEmbedUrl()}
              loading="lazy"
              className={cn('absolute inset-0 size-full border-0', !active && 'pointer-events-none')}
            />
            {!active ? (
              <button type="button" onClick={() => setActive(true)} className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-ink/35 to-transparent pb-3">
                <span className="bevel-out bg-win px-2.5 py-1 font-pixel text-[13px] font-semibold text-ink">Ketuk untuk geser peta</span>
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-3 border-t-2 border-ink px-3 py-2.5">
            <PixelIcon name="pin" className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="font-type text-[10px] tracking-[0.25em] text-brand uppercase">Where</p>
              <p className="truncate font-display text-lg leading-tight">{LOCATION.name}</p>
              <p className="truncate text-[12px] text-muted">{LOCATION.area}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={googleMapsUrl()} target="_blank" rel="noreferrer" className="bevel-out flex h-11 items-center justify-center gap-1.5 bg-win px-2 font-pixel text-[14px] font-semibold active:bevel-in">
            <ExternalLink className="size-4" /> Buka peta
          </a>
          <a href={directionsUrl()} target="_blank" rel="noreferrer" className="bevel-out flex h-11 items-center justify-center gap-1.5 bg-sun px-2 font-pixel text-[14px] font-semibold active:bevel-in">
            <Navigation className="size-4" /> Rute ke sini
          </a>
        </div>
      </div>

      {/* Right: postcard back */}
      <div className="relative flex min-w-0 flex-col sm:border-l-2 sm:border-dashed sm:border-ink/25 sm:pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-type text-[10px] tracking-[0.25em] text-muted uppercase">Kartu pos dari</p>
            <p className="truncate font-display text-xl leading-tight">{eventName ?? 'Photovoks'}</p>
          </div>
          {/* Stamp + postmark */}
          <div className="relative shrink-0">
            <div className="flex h-20 w-16 rotate-3 items-center justify-center border-[3px] border-dotted border-line-strong bg-white p-1 shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
              <div className="flex size-full flex-col items-center justify-center bg-sky">
                <Logo size="sm" className="w-11" alt="" />
                <span className="font-pixel text-[9px] font-bold">UI · 2026</span>
              </div>
            </div>
            <span className="absolute -bottom-3 -left-8 flex size-16 -rotate-12 flex-col items-center justify-center rounded-full border-[3px] border-double border-brand/80 font-type text-[8px] leading-tight text-brand/90 uppercase mix-blend-multiply">
              <span>Depok</span>
              <span className="font-bold">16424</span>
              <span>✶ ✶ ✶</span>
            </span>
          </div>
        </div>
        <div className="mt-4 flex-1 font-hand text-[22px] leading-[34px] text-ink-2 [background-image:repeating-linear-gradient(transparent_0_33px,rgb(26_20_16/0.18)_33px_34px)]">
          {note ?? 'hai! kita foto-foto di kampus UI Depok ✶ cari booth merah bertuliskan photovoks, ya. sampai ketemu!'}
          <p className="mt-1 text-right">— photovoks</p>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug text-muted">
          <PixelIcon name="info" className="mt-0.5 size-3.5" />
          <span>
            {LOCATION.address} ·{' '}
            <a href={osmUrl()} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              © OpenStreetMap
            </a>
          </span>
        </p>
      </div>
    </div>
  );
}
