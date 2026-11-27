'use client';

/**
 * Guest-facing "we'll be right back" screen (maintenance mode or the site
 * can't reach its database). Retro desktop + WordArt title; retries itself.
 */
import React, { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { HillsWallpaper, PixelIcon, Taskbar, TaskItem, WinWindow } from './retro';
import { WordArt } from '@/components/brand/WordArt';
import { Button } from '@/components/ui/button';

export function MaintenanceScreen({ message, title = 'Lagi Dirawat!', autoRetrySeconds = 60, onRetry }: { message: string; title?: string; autoRetrySeconds?: number; onRetry?: () => void }) {
  const [left, setLeft] = useState(autoRetrySeconds);
  useEffect(() => {
    if (!autoRetrySeconds) return;
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [autoRetrySeconds]);
  const retry = React.useCallback(() => (onRetry ? onRetry() : window.location.reload()), [onRetry]);
  useEffect(() => {
    if (autoRetrySeconds && left <= 0) retry();
  }, [left, autoRetrySeconds, retry]);

  return (
    <main className="kiosk relative flex min-h-dvh flex-col overflow-hidden">
      <HillsWallpaper />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <WordArt variant="sunset" className="text-[clamp(44px,9vw,96px)]">{title}</WordArt>
        <WinWindow title="Photovoks 98 — Perawatan" icon="warning" className="w-full max-w-md text-left" bodyClassName="p-4">
          <div className="flex gap-3">
            <PixelIcon name="hourglass" className="size-12 shrink-0" />
            <div className="min-w-0 text-sm leading-relaxed">
              <p className="font-pixel text-[16px] font-bold">Mesinnya lagi dilap biar kinclong.</p>
              <p className="mt-1 text-ink-2">{message}</p>
              <p className="mt-2 font-pixel text-[13px] text-muted">Foto yang sudah tersimpan aman. {autoRetrySeconds ? `Coba lagi otomatis dalam ${Math.max(0, left)} detik.` : ''}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="win-primary" size="lg" onClick={retry}><RefreshCcw /> Coba sekarang</Button>
          </div>
        </WinWindow>
      </div>
      <Taskbar className="relative z-10">
        <TaskItem icon="warning" active>Perawatan</TaskItem>
      </Taskbar>
    </main>
  );
}
