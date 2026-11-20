'use client';

/**
 * Capture stage: live preview cropped to the exact slot aspect (what you see
 * is what you get), countdown, flash, and a short burst around the shutter
 * for the live-photo / GIF effect.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, SwitchCamera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CAMERA_ERROR_TEXT } from '@/lib/camera';
import { LIVE_CELL_WIDTH, grabFrame, normalizeBurst } from '@/lib/booth/media';
import { cn } from '@/lib/utils';
import type { CameraController } from './useCamera';

export interface Shot {
  still: HTMLCanvasElement;
  burst: HTMLCanvasElement[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STILL_MAX_WIDTH = 2000;

export function CaptureStage({
  camera,
  queue,
  totalShots,
  aspectFor,
  countdown,
  mode,
  mirror,
  live,
  existing,
  onShot,
  onDone,
  onCancel,
}: {
  camera: CameraController;
  /** Shot indices to capture, in order. */
  queue: number[];
  totalShots: number;
  aspectFor: (shotIndex: number) => number;
  countdown: number;
  mode: 'auto' | 'manual';
  mirror: boolean;
  live: boolean;
  existing: (Shot | null)[];
  onShot: (index: number, shot: Shot) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState(0); // position in queue
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  /** Freeze-frame of the photo just taken (shown briefly before the next pose). */
  const [justTaken, setJustTaken] = useState<string | null>(null);
  const cancelled = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const current = queue[Math.min(pos, queue.length - 1)];
  const aspect = aspectFor(current);

  // Attach the shared stream.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !camera.stream) return;
    v.srcObject = camera.stream;
    v.play().catch(() => {});
  }, [camera.stream]);

  useEffect(() => {
    if (!camera.stream && !camera.starting && !camera.error) void camera.start();
  }, [camera]);

  // Reset on (re)mount: React StrictMode runs mount → cleanup → mount in dev,
  // so the flag must be cleared again or every capture aborts immediately.
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Fit the preview box (exact slot aspect) into the stage.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = w / aspect;
      if (h > r.height) {
        h = r.height;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const takeOne = useCallback(
    async (shotIndex: number) => {
      const v = videoRef.current;
      if (!v) return;
      const a = aspectFor(shotIndex);
      const ring: HTMLCanvasElement[] = [];
      let sampler: ReturnType<typeof setInterval> | null = null;
      for (let s = countdown; s >= 1; s--) {
        if (cancelled.current) return;
        setCount(s);
        if (s === 1 && live) {
          sampler = setInterval(() => {
            try {
              ring.push(grabFrame(v, a, mirror, LIVE_CELL_WIDTH));
              if (ring.length > 6) ring.shift();
            } catch {
              /* frame not ready */
            }
          }, 100);
        }
        await sleep(1000);
      }
      if (sampler) clearInterval(sampler);
      if (cancelled.current) return;
      setCount(0);
      const still = grabFrame(v, a, mirror, STILL_MAX_WIDTH);
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      const after: HTMLCanvasElement[] = [];
      if (live) {
        for (let k = 0; k < 4; k++) {
          await sleep(100);
          try {
            after.push(grabFrame(v, a, mirror, LIVE_CELL_WIDTH));
          } catch {
            /* ignore */
          }
        }
      }
      const burst = live ? normalizeBurst([...ring, grabSmall(still), ...after]) : [];
      onShot(shotIndex, { still, burst });
      setCount(null);
      setJustTaken(scaledPreview(still));
      await sleep(1400);
      setJustTaken(null);
    },
    [aspectFor, countdown, live, mirror, onShot],
  );

  async function run() {
    if (running || !ready) return;
    setRunning(true);
    try {
      if (mode === 'auto') {
        for (let i = pos; i < queue.length; i++) {
          setPos(i);
          await takeOne(queue[i]);
          if (cancelled.current) return;
          await sleep(i < queue.length - 1 ? 900 : 500);
        }
        if (!cancelled.current) onDone();
      } else {
        await takeOne(queue[pos]);
        if (cancelled.current) return;
        if (pos + 1 >= queue.length) {
          onDone();
        } else {
          setPos(pos + 1);
        }
      }
    } catch {
      setCount(null);
    } finally {
      setRunning(false);
    }
  }

  const camErr = camera.error ? CAMERA_ERROR_TEXT[camera.error] : null;
  const nextLabel = queue.length === 1 ? 'Ambil foto' : pos === 0 ? 'Mulai foto' : `Ambil foto ${current + 1}`;
  const helper = running
    ? ''
    : mode === 'auto'
      ? `${queue.length} foto akan diambil berurutan, hitung mundur ${countdown} detik`
      : pos > 0
        ? `Foto ${queue[pos - 1] + 1} tersimpan. Atur pose, lalu tekan saat siap.`
        : queue.length > 1
          ? `${queue.length} foto · tekan tombol untuk setiap foto`
          : `Hitung mundur ${countdown} detik`;

  return (
    <div className="kiosk fixed inset-0 flex flex-col bg-[#07090F] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:px-6">
        <Button variant="ink" size="icon-lg" className="bg-white/10 hover:bg-white/15" onClick={onCancel} aria-label="Batal" disabled={running}>
          <X />
        </Button>
        <div className="flex flex-col items-center">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">Foto</p>
          <p className="text-xl font-extrabold tabular-nums">
            {current + 1} <span className="text-white/40">/ {totalShots}</span>
          </p>
        </div>
        {camera.devices.length > 1 ? (
          <Button
            variant="ink"
            size="icon-lg"
            className="bg-white/10 hover:bg-white/15"
            disabled={running}
            aria-label="Ganti kamera"
            onClick={() => {
              const i = camera.devices.findIndex((d) => d.deviceId === camera.deviceId);
              const next = camera.devices[(i + 1) % camera.devices.length];
              setReady(false);
              void camera.start(next.deviceId);
            }}
          >
            <SwitchCamera />
          </Button>
        ) : (
          <span className="size-12" />
        )}
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative mx-4 flex min-h-0 flex-1 items-center justify-center sm:mx-6">
        {camErr ? (
          <div className="max-w-sm text-center">
            <p className="text-lg font-bold">{camErr.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{camErr.body}</p>
            <Button variant="sun" size="lg" className="mt-5" onClick={() => camera.start()}>
              <RefreshCcw /> Coba lagi
            </Button>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[18px] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" style={{ width: box.w, height: box.h }}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              onLoadedData={() => setReady(true)}
              className="absolute inset-0 size-full object-cover"
              style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
            />
            {!ready ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="size-8 text-white/70" />
              </div>
            ) : null}
            {/* rule-of-thirds guide */}
            <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,transparent_33.2%,white_33.3%,transparent_33.4%,transparent_66.5%,white_66.6%,transparent_66.7%),linear-gradient(to_bottom,transparent_33.2%,white_33.3%,transparent_33.4%,transparent_66.5%,white_66.6%,transparent_66.7%)]" />
            {count !== null ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10" aria-live="assertive">
                <span key={count} className="animate-pop text-[clamp(96px,22vmin,220px)] leading-none font-extrabold text-white [text-shadow:0_6px_30px_rgba(0,0,0,0.45)]">
                  {count > 0 ? count : ''}
                </span>
              </div>
            ) : null}
            {justTaken ? (
              <div className="pointer-events-none absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={justTaken} alt="" className="size-full object-cover" />
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">Tersimpan</span>
              </div>
            ) : null}
            <div className={cn('pointer-events-none absolute inset-0 bg-white transition-opacity duration-200', flash ? 'opacity-90' : 'opacity-0')} />
          </div>
        )}
      </div>

      {/* Bottom: tray + shutter */}
      <div className="flex flex-col items-center gap-4 px-4 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="no-scrollbar flex max-w-full gap-2 overflow-x-auto">
          {Array.from({ length: totalShots }).map((_, i) => {
            const shot = existing[i];
            return (
              <div key={i} className={cn('relative h-16 w-12 shrink-0 overflow-hidden rounded-[8px] border-2', i === current ? 'border-sun' : 'border-white/15')}>
                {shot ? <CanvasThumb canvas={shot.still} /> : <span className="flex size-full items-center justify-center text-sm font-bold text-white/35">{i + 1}</span>}
              </div>
            );
          })}
        </div>
        <Button variant="sun" size="xl" className="min-w-64" onClick={run} disabled={running || !ready || !!camErr}>
          {running ? (count !== null && count > 0 ? 'Siap-siap…' : 'Senyum!') : (<><Camera /> {nextLabel}</>)}
        </Button>
        <p className="h-5 text-sm text-white/60">{helper}</p>
      </div>
    </div>
  );
}

function scaledPreview(still: HTMLCanvasElement): string {
  const s = Math.min(1, 900 / still.width);
  const c = document.createElement('canvas');
  c.width = Math.round(still.width * s);
  c.height = Math.round(still.height * s);
  c.getContext('2d')!.drawImage(still, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function grabSmall(still: HTMLCanvasElement): HTMLCanvasElement {
  const s = LIVE_CELL_WIDTH / still.width;
  const c = document.createElement('canvas');
  c.width = LIVE_CELL_WIDTH;
  c.height = Math.round(still.height * s);
  c.getContext('2d')!.drawImage(still, 0, 0, c.width, c.height);
  return c;
}

export function CanvasThumb({ canvas, className }: { canvas: HTMLCanvasElement; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let alive = true;
    const small = document.createElement('canvas');
    const s = Math.min(1, 240 / canvas.width);
    small.width = Math.round(canvas.width * s);
    small.height = Math.round(canvas.height * s);
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
    small.toBlob((b) => {
      if (!b || !alive) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    }, 'image/jpeg', 0.8);
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [canvas]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className={cn('size-full object-cover', className)} /> : <span className="skeleton block size-full" />;
}
