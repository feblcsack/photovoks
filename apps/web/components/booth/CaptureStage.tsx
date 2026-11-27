'use client';

/**
 * Capture stage: live preview cropped to the exact slot aspect (what you see
 * is what you get), countdown, flash, and a short burst around the shutter
 * for the live-photo / GIF effect.
 *
 * UI Depok campus backdrop (Rektorat, trees, a passing bikun) and optional
 * low-poly pals: a faceted animal hops into each shot and is baked into the
 * photo exactly where the preview shows it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, RefreshCcw, SwitchCamera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BikunDrive, PlanePath, Rektorat, Trees } from '@/components/brand/campus';
import { bakePal, palFor, PAL_LABELS, type PalId } from '@/lib/booth/pals';
import { Bubbles, CrtTv, DesktopIcon, HillsWallpaper, PixelIcon, ProgressBlocks, SwearBubble, Taskbar, TaskItem, WinWindow } from '@/components/os/retro';
import { sfx } from '@/lib/sfx';
import { CAMERA_ERROR_TEXT } from '@/lib/camera';
import { LIVE_CELL_WIDTH, grabFrame, normalizeBurst } from '@/lib/booth/media';
import { cn } from '@/lib/utils';
import type { CameraController } from './useCamera';

/** Moments the on-screen buddy reacts to. */
export type CaptureEvent = { type: 'countdown'; n: number } | { type: 'flash' } | { type: 'saved'; index: number } | { type: 'idle' };

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
  onEvent,
  pals = false,
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
  onEvent?: (e: CaptureEvent) => void;
  /** Low-poly pals feature enabled (developer panel / dashboard switch). */
  pals?: boolean;
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

  // ── Low-poly pals ────────────────────────────────────────────────────────
  const [palsOn, setPalsOn] = useState(pals);
  const [sprites, setSprites] = useState<Record<PalId, HTMLCanvasElement> | null>(null);
  const [palSeed] = useState(() => Math.random());
  useEffect(() => {
    if (!pals) return;
    let alive = true;
    import('@/components/lowpoly/pals')
      .then((m) => m.palSprites())
      .then((r) => alive && setSprites(r))
      .catch(() => alive && setPalsOn(false)); // no WebGL → quietly skip
    return () => {
      alive = false;
    };
  }, [pals]);
  const spriteUrls = useMemo(() => (sprites ? (Object.fromEntries(Object.entries(sprites).map(([k, c]) => [k, c.toDataURL('image/png')])) as Record<PalId, string>) : null), [sprites]);
  const palsActive = pals && palsOn && !!sprites;

  const current = queue[Math.min(pos, queue.length - 1)];
  const pal = palFor(palSeed, current);
  // Same size rule as bakePal(): width fraction, height capped at 45 % of the photo.
  const palPreviewWidth = (() => {
    const sp = sprites?.[pal.id];
    if (!sp || !box.w) return `${pal.w * 100}%`;
    let w = box.w * pal.w;
    const h = (w * sp.height) / sp.width;
    if (h > box.h * 0.45) w *= (box.h * 0.45) / h;
    return `${w}px`;
  })();
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
      // Leave room for the TV bezel around the preview.
      const bezel = 2 * (Math.min(22, Math.max(12, 0.024 * Math.min(window.innerWidth, window.innerHeight))) + 6);
      const availW = Math.max(80, r.width - bezel);
      const availH = Math.max(80, r.height - bezel);
      let w = availW;
      let h = w / aspect;
      if (h > availH) {
        h = availH;
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
        sfx.beep(false);
        onEvent?.({ type: 'countdown', n: s });
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
      const placement = palsActive && sprites ? palFor(palSeed, shotIndex) : null;
      if (placement && sprites) {
        bakePal(still, sprites[placement.id], placement);
        ring.forEach((f) => bakePal(f, sprites[placement.id], placement));
      }
      sfx.shutter();
      onEvent?.({ type: 'flash' });
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      const after: HTMLCanvasElement[] = [];
      if (live) {
        for (let k = 0; k < 4; k++) {
          await sleep(100);
          try {
            const f = grabFrame(v, a, mirror, LIVE_CELL_WIDTH);
            if (placement && sprites) bakePal(f, sprites[placement.id], placement);
            after.push(f);
          } catch {
            /* ignore */
          }
        }
      }
      const burst = live ? normalizeBurst([...ring, grabSmall(still), ...after]) : [];
      onShot(shotIndex, { still, burst });
      onEvent?.({ type: 'saved', index: shotIndex });
      setCount(null);
      setJustTaken(scaledPreview(still));
      await sleep(1400);
      setJustTaken(null);
    },
    [aspectFor, countdown, live, mirror, onShot, onEvent, palsActive, sprites, palSeed],
  );

  async function run() {
    if (running || !ready) return;
    sfx.unlock();
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
      onEvent?.({ type: 'idle' });
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

  const fileName = (i: number) => `Foto_${String(i + 1).padStart(2, '0')}.jpg`;
  const switchCamera = () => {
    const i = camera.devices.findIndex((d) => d.deviceId === camera.deviceId);
    const next = camera.devices[(i + 1) % camera.devices.length];
    setReady(false);
    void camera.start(next.deviceId);
  };

  return (
    <div className="kiosk fixed inset-0 flex flex-col overflow-hidden text-ink">
      <HillsWallpaper />
      {/* Desktop decorations */}
      {/* UI Depok campus: Rektorat on the hill, trees, plane path, a passing bikun */}
      <PlanePath className="pointer-events-none absolute top-[7%] left-[2%] hidden w-[clamp(260px,30vw,460px)] md:block" label="Universitas Indonesia" />
      <div className="pointer-events-none absolute bottom-[64px] left-[1%] hidden w-[clamp(150px,17vw,260px)] lg:block" aria-hidden>
        <Rektorat className="w-full drop-shadow-[4px_6px_0_rgba(26,20,16,0.25)]" />
        <Trees count={4} className="-mt-[22%] w-[115%] -translate-x-[6%]" />
      </div>
      <div className="pointer-events-none absolute right-[1%] bottom-[64px] hidden w-[clamp(140px,15vw,230px)] xl:block" aria-hidden>
        <Trees count={3} className="w-full" />
      </div>
      <Bubbles className="absolute top-[6%] right-[4%] w-[clamp(60px,9vw,130px)] animate-float [animation-delay:.6s]" />
      <BikunDrive className="bottom-[48px] h-[clamp(48px,7vh,72px)]" speed={26} />

      {/* Top: recycle bin = cancel, shot counter, switch camera */}
      <div className="relative z-10 flex items-start justify-between gap-3 px-2 pt-[max(8px,env(safe-area-inset-top))] sm:px-4">
        <DesktopIcon icon="recycle" label={running ? 'Tunggu…' : 'Batal'} onClick={running ? undefined : onCancel} className={running ? 'opacity-60' : ''} />
        <div className="bevel-out mt-2 flex items-center gap-2 bg-win px-3 py-1.5 font-pixel">
          <PixelIcon name="camera" className="size-5" />
          <span className="text-[15px]">Kamera.exe</span>
          <span className="bevel-in bg-win-light px-2 text-[17px] font-bold tabular-nums">
            {current + 1}<span className="text-muted">/{totalShots}</span>
          </span>
        </div>
        {camera.devices.length > 1 ? (
          <button type="button" disabled={running} onClick={switchCamera} aria-label="Ganti kamera" className="flex w-24 flex-col items-center gap-1 p-1 disabled:opacity-50">
            <span className="bevel-out flex size-12 items-center justify-center bg-win"><SwitchCamera className="size-6" /></span>
            <span className="font-pixel text-[13px] text-white [text-shadow:1px_1px_0_#1A1410]">Ganti kamera</span>
          </button>
        ) : (
          <span className="w-24" />
        )}
      </div>

      {/* Stage: the camera lives inside a retro TV */}
      <div ref={stageRef} className="relative z-10 mx-2 flex min-h-0 flex-1 items-center justify-center sm:mx-6">
        {camErr ? (
          <WinWindow title="Kamera.exe — Kesalahan" icon="warning" className="w-full max-w-sm" bodyClassName="p-4" onClose={onCancel}>
            <div className="flex gap-3">
              <PixelIcon name="warning" className="size-10" />
              <div>
                <p className="font-pixel text-[16px] font-bold">{camErr.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{camErr.body}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="win" onClick={onCancel}>Batal</Button>
              <Button variant="win-primary" onClick={() => camera.start()}><RefreshCcw /> Coba lagi</Button>
            </div>
          </WinWindow>
        ) : (
          <div className="relative">
            <CrtTv>
              <div className="relative overflow-hidden bg-black" style={{ width: box.w, height: box.h }}>
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0C1E6E] text-white">
                    <PixelIcon name="hourglass" className="size-10 animate-wiggle" />
                    <p className="font-pixel text-[15px]">Menyalakan kamera…</p>
                  </div>
                ) : null}
                {/* rule-of-thirds guide */}
                <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,transparent_33.2%,white_33.3%,transparent_33.4%,transparent_66.5%,white_66.6%,transparent_66.7%),linear-gradient(to_bottom,transparent_33.2%,white_33.3%,transparent_33.4%,transparent_66.5%,white_66.6%,transparent_66.7%)]" />
                {palsActive && spriteUrls && !justTaken ? (
                  <span
                    key={`${current}-${pal.id}`}
                    className="pal-in pointer-events-none absolute"
                    style={{ left: `${pal.x * 100}%`, top: `${pal.y * 100}%`, width: palPreviewWidth, translate: '-50% -50%' }}
                  >
                    <span className="pal-bob block" style={{ ['--r' as string]: `${pal.rot}deg` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={spriteUrls[pal.id]} alt={PAL_LABELS[pal.id]} className="block w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.35)]" style={{ transform: pal.flip ? 'scaleX(-1)' : undefined }} draggable={false} />
                    </span>
                  </span>
                ) : null}
                {count !== null ? (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/10" aria-live="assertive">
                    <span key={count} className="animate-pop font-display text-[clamp(96px,22vmin,220px)] leading-none text-white [text-shadow:5px_5px_0_#C4201A,9px_9px_0_#1A1410]">
                      {count > 0 ? count : ''}
                    </span>
                    {count > 0 ? (
                      <div className="absolute inset-x-[12%] bottom-[8%]">
                        <ProgressBlocks value={((countdown - count + 1) / countdown) * 100} />
                        <p className="mt-1 text-center font-pixel text-[13px] text-white [text-shadow:1px_1px_0_#1A1410]">Memuat senyum… {count}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {justTaken ? (
                  <div className="pointer-events-none absolute inset-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={justTaken} alt="" className="size-full object-cover" />
                    <span className="bevel-out absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 bg-win px-2.5 py-1 font-pixel text-[14px] whitespace-nowrap">
                      <PixelIcon name="floppy" className="size-4" /> {fileName(current)} tersimpan
                    </span>
                  </div>
                ) : null}
                <div className={cn('pointer-events-none absolute inset-0 bg-white transition-opacity duration-200', flash ? 'opacity-90' : 'opacity-0')} />
              </div>
            </CrtTv>
            <SwearBubble className={cn('absolute -top-3 -right-1 transition-transform sm:-right-4', flash ? 'scale-125' : 'animate-wiggle')} text={flash ? 'CEKREK!' : '#@%&!'} />
          </div>
        )}
      </div>

      {/* Shutter */}
      <div className="relative z-10 flex flex-col items-end gap-1.5 px-3 pt-3 pb-2 pl-[clamp(96px,26vw,140px)] sm:items-center sm:pl-3">
        <Button variant="win-go" size="xl" className="min-w-0 text-[20px] sm:min-w-72" onClick={run} disabled={running || !ready || !!camErr}>
          {running ? (count !== null && count > 0 ? 'Siap-siap…' : 'Senyum!') : (<><Camera /> {nextLabel}</>)}
        </Button>
        <div className="flex max-w-full items-center gap-2">
          {pals ? (
            <button
              type="button"
              onClick={() => setPalsOn((v) => !v)}
              disabled={running}
              aria-pressed={palsOn}
              className={cn('bevel-out flex h-8 shrink-0 items-center gap-1.5 px-2 font-pixel text-[13px] active:bevel-in disabled:opacity-60', palsOn ? 'bg-sun' : 'bg-win')}
            >
              <PixelIcon name="star" className="size-4" /> Teman 3D: {palsOn ? (sprites ? PAL_LABELS[pal.id] : '…') : 'Mati'}
            </button>
          ) : null}
          <p className="h-5 min-w-0 truncate font-pixel text-[13px] text-white [text-shadow:1px_1px_0_#1A1410]">{helper}</p>
        </div>
      </div>

      {/* Taskbar: every shot is a "file" */}
      <Taskbar className="relative z-10">
        {Array.from({ length: totalShots }).map((_, i) => {
          const shot = existing[i];
          return (
            <TaskItem key={i} active={i === current} className="gap-1.5 pl-1">
              <span className="relative block h-7 w-5 shrink-0 overflow-hidden bg-ink/15">
                {shot ? <CanvasThumb canvas={shot.still} /> : <span className="flex size-full items-center justify-center text-[11px] font-bold text-ink/40">{i + 1}</span>}
              </span>
              <span className="hidden sm:inline">{fileName(i)}</span>
            </TaskItem>
          );
        })}
      </Taskbar>
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
