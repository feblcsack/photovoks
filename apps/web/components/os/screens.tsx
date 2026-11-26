'use client';

/** Full-screen gimmick screens: boot splash and the "safe to leave" shutdown. */
import React, { useEffect } from 'react';
import { Logo } from '@/components/brand/scrap';
import { cn } from '@/lib/utils';
import { HillsWallpaper, ProgressBlocks } from './retro';

export function BootScreen({ label = 'Memulai Photovoks 98…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('kiosk fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden', className)}>
      <HillsWallpaper />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <Logo className="w-[min(240px,46vw)] drop-shadow-[4px_6px_0_rgb(26_20_16/0.35)]" />
        <p className="font-display text-[clamp(34px,7vw,64px)] leading-none text-white [text-shadow:3px_3px_0_#1A1410]">
          Photovoks<span className="ml-2 align-top font-pixel text-[0.45em] text-sun">98</span>
        </p>
        <ProgressBlocks className="mt-3 w-[min(320px,70vw)]" />
        <p className="font-pixel text-[15px] text-white [text-shadow:1px_1px_0_#1A1410]">{label}</p>
      </div>
      <p className="absolute bottom-[max(14px,env(safe-area-inset-bottom))] font-pixel text-[12px] text-white/80">Hak cipta © senyum kamu sendiri</p>
    </div>
  );
}

/** "It's now safe to…" parody shown when a guest taps Selesai. */
export function ShutdownScreen({ onDone, ms = 2600 }: { onDone: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [onDone, ms]);
  return (
    <button
      type="button"
      onClick={onDone}
      className="kiosk fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink px-8 text-center"
      style={{ animation: `shutdown-fade ${ms}ms ease both` }}
    >
      <p className="font-pixel text-[clamp(22px,4.2vw,44px)] leading-snug text-[#FF9A3C]">Sekarang aman untuk meninggalkan booth.</p>
      <p className="mt-4 font-pixel text-[clamp(14px,2vw,18px)] text-white/60">Terima kasih sudah mampir ✶ jangan lupa scan QR-nya</p>
    </button>
  );
}
