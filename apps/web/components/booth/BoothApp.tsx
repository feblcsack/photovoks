'use client';

/**
 * Booth kiosk state machine:
 *   attract → frames → capture → review (→ capture for retakes) → finish → attract
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Expand, LayoutGrid, Lock, LogOut, RefreshCcw, Settings2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Segmented } from '@/components/ui/segmented';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { api } from '@/lib/fetcher';
import { defaultTokens } from '@/lib/frames/render';
import { aspectOfSlot, type FrameRecord } from '@/lib/frames/types';
import type { EventConfig } from '@/lib/events';
import { cn } from '@/lib/utils';
import { useCamera } from './useCamera';
import { CaptureStage, type Shot } from './CaptureStage';
import { ReviewStage } from './ReviewStage';
import { FinishStage } from './FinishStage';
import { OfflineIndicator } from './OfflineIndicator';
import { AttractView } from './AttractView';

interface BoothConfig {
  event: EventConfig;
  role: 'admin' | 'event';
  frames: FrameRecord[];
  aiConfigured: boolean;
  printStationOnline: boolean;
  media: { attractUrl: string | null };
}

type Step = 'attract' | 'frames' | 'capture' | 'review' | 'finish';
const IDLE_MS = 90_000;
const NEVER = 2_000_000_000;

export function BoothApp({ code }: { code: string }) {
  const router = useRouter();
  const [config, setConfig] = useState<BoothConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('attract');
  const [frame, setFrame] = useState<FrameRecord | null>(null);
  const [shots, setShots] = useState<(Shot | null)[]>([]);
  const [queue, setQueue] = useState<number[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [filter, setFilter] = useState('original');
  const [retakesUsed, setRetakesUsed] = useState(0);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [mirrorOverride, setMirrorOverride] = useState<boolean | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const camera = useCamera();
  // Keep the first signed URL per media path so the home-screen video stays
  // cached between guests (a new URL would re-download it every reset).
  const [media, setMedia] = useState<{ path: string | null; url: string | null }>({ path: null, url: null });
  const [mediaFresh, setMediaFresh] = useState(false);
  const latestPath = config?.event.attractMediaPath ?? null;
  const latestUrl = config?.media?.attractUrl ?? null;
  if (config && (media.path !== latestPath || (mediaFresh && media.url !== latestUrl))) {
    setMedia({ path: latestPath, url: latestUrl });
    if (mediaFresh) setMediaFresh(false);
  }
  const attractUrl = media.url;

  const load = useCallback(async () => {
    try {
      const cfg = await api<BoothConfig>(`/api/events/${code}/booth`);
      setConfig(cfg);
      setLoadError(null);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) router.refresh();
      else setLoadError(e instanceof Error ? e.message : 'Gagal memuat booth');
    }
  }, [code, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  useWakeLock();

  const reset = useCallback(() => {
    setStep('attract');
    setFrame(null);
    setShots([]);
    setQueue([]);
    setSelection([]);
    setFilter('original');
    setRetakesUsed(0);
    setSessionKey((k) => k + 1);
    void load(); // pick up frame/setting changes between guests
  }, [load]);

  const idleEnabled = step === 'frames' || step === 'review';
  useIdleTimer(idleEnabled ? IDLE_MS : NEVER, () => {
    if (idleEnabled) reset();
  });

  const event = config?.event;
  const mirror = mirrorOverride ?? event?.mirrorPreview ?? true;
  const tokens = useMemo(() => defaultTokens(event?.name ?? '', event?.code ?? ''), [event?.name, event?.code, sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shotCount = frame && event ? Math.max(frame.slotCount, event.shotCount) : 0;

  const chooseFrame = (f: FrameRecord) => {
    if (!event) return;
    const n = Math.max(f.slotCount, event.shotCount);
    setFrame(f);
    setShots(Array(n).fill(null));
    setQueue(Array.from({ length: n }, (_, i) => i));
    setSelection([]);
    setStep('capture');
  };

  const aspectFor = useCallback((shotIndex: number) => (frame ? aspectOfSlot(frame.design, shotIndex % Math.max(1, frame.slotCount)) : 3 / 4), [frame]);

  const onShot = useCallback((i: number, shot: Shot) => {
    setShots((prev) => {
      const next = [...prev];
      next[i] = shot;
      return next;
    });
  }, []);

  const onCaptureDone = useCallback(() => {
    setSelection((sel) => {
      if (!frame) return sel;
      // Keep existing picks (retake replaces in place); fill up to slot count.
      const valid = sel.filter((i) => i < shotCount);
      const fill = Array.from({ length: shotCount }, (_, i) => i).filter((i) => !valid.includes(i));
      return [...valid, ...fill].slice(0, frame.slotCount);
    });
    setStep('review');
  }, [frame, shotCount]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="kiosk flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0B0F1A] px-6 text-center text-white">
        <p className="text-lg font-bold">Booth tidak bisa dimuat</p>
        <p className="text-sm text-white/60">{loadError}</p>
        <Button variant="sun" size="lg" onClick={() => void load()}><RefreshCcw /> Coba lagi</Button>
      </div>
    );
  }
  if (!config || !event) {
    return (
      <div className="kiosk flex min-h-dvh items-center justify-center bg-[#0B0F1A]">
        <Spinner className="size-8 text-white/70" />
      </div>
    );
  }

  const retakesLeft = event.allowRetake ? Math.max(0, event.maxRetakes - retakesUsed) : 0;
  const filledShots = shots.filter((s): s is Shot => !!s);

  return (
    <>
      <OfflineIndicator />
      {step === 'attract' ? (
        <AttractView
          event={event}
          frames={config.frames}
          tokens={tokens}
          mediaUrl={attractUrl}
          onMediaError={() => setMediaFresh(true)}
          onStart={() => (config.frames.length === 1 ? chooseFrame(config.frames[0]) : setStep('frames'))}
          corner={<HoldButton onHold={() => setOperatorOpen(true)} />}
        />
      ) : null}

      {step === 'frames' ? <FramePicker frames={config.frames} tokens={tokens} onPick={chooseFrame} onBack={reset} /> : null}

      {step === 'capture' && frame ? (
        <CaptureStage
          key={`${sessionKey}-${queue.join(',')}`}
          camera={camera}
          queue={queue}
          totalShots={shotCount}
          aspectFor={aspectFor}
          countdown={event.countdownSeconds}
          mode={event.captureMode}
          mirror={mirror}
          live={event.livePhoto}
          existing={shots}
          onShot={onShot}
          onDone={onCaptureDone}
          onCancel={() => (filledShots.length === shotCount ? setStep('review') : config.frames.length > 1 ? setStep('frames') : reset())}
        />
      ) : null}

      {step === 'review' && frame && filledShots.length === shotCount ? (
        <ReviewStage
          frame={frame}
          shots={filledShots}
          selection={selection}
          onSelectionChange={setSelection}
          filter={filter}
          onFilterChange={setFilter}
          allowedFilters={event.filters}
          retakesLeft={retakesLeft}
          onRetake={(i) => {
            setRetakesUsed((n) => n + 1);
            setQueue([i]);
            setStep('capture');
          }}
          onRetakeAll={() => {
            setShots(Array(shotCount).fill(null));
            setQueue(Array.from({ length: shotCount }, (_, i) => i));
            setSelection([]);
            setStep('capture');
          }}
          onContinue={() => setStep('finish')}
          tokens={tokens}
        />
      ) : null}

      {step === 'finish' && frame ? (
        <FinishStage
          code={code}
          event={event}
          frame={frame}
          shots={filledShots}
          selection={selection}
          filter={filter}
          tokens={tokens}
          printStationOnline={config.printStationOnline}
          aiConfigured={config.aiConfigured}
          onDone={reset}
        />
      ) : null}

      <OperatorSheet
        open={operatorOpen}
        onOpenChange={setOperatorOpen}
        event={event}
        role={config.role}
        camera={camera}
        mirror={mirror}
        onMirror={setMirrorOverride}
        onReload={() => {
          void load();
          setOperatorOpen(false);
        }}
        onLock={async () => {
          await api(`/api/events/${code}/unlock`, { method: 'DELETE' }).catch(() => {});
          camera.stop();
          router.refresh();
        }}
      />
    </>
  );
}

const HOLD_MS = 1000;

/**
 * Press-and-hold to open operator settings — guests won't trigger it by
 * accident. A short tap shows a hint; while held a ring fills up.
 */
function HoldButton({ onHold }: { onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Keep receiving pointerup even if the finger drifts off the button.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    fired.current = false;
    setHint(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      fired.current = true;
      setHolding(false);
      onHold();
    }, HOLD_MS);
  };
  const end = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (holding && !fired.current) {
      setHint(true);
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 2200);
    }
    setHolding(false);
  };

  return (
    <div className="relative flex items-center">
      <span
        aria-hidden={!hint}
        className={cn(
          'pointer-events-none absolute top-1/2 right-[calc(100%+8px)] -translate-y-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white transition-opacity',
          hint ? 'opacity-100' : 'opacity-0',
        )}
      >
        Tahan 1 detik untuk pengaturan
      </span>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Pengaturan operator (tahan 1 detik)"
        className={cn(
          'relative flex size-11 items-center justify-center rounded-full bg-white/80 text-ink/50 shadow-[0_1px_0_rgba(14,20,36,0.08)] transition',
          holding && 'scale-110 text-ink',
        )}
      >
        <Settings2 className="size-5" />
        <svg viewBox="0 0 44 44" className="pointer-events-none absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle
            cx="22"
            cy="22"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={holding ? 0 : 100}
            style={{ transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'none', opacity: holding ? 1 : 0 }}
          />
        </svg>
      </button>
    </div>
  );
}

// ── Frame picker ─────────────────────────────────────────────────────────────

function FramePicker({ frames, tokens, onPick, onBack }: { frames: FrameRecord[]; tokens: Record<string, string>; onPick: (f: FrameRecord) => void; onBack: () => void }) {
  return (
    <div className="kiosk booth-paper fixed inset-0 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 sm:px-6">
        <Button variant="secondary" size="lg" onClick={onBack}><ArrowLeft /> Kembali</Button>
        <h1 className="text-xl font-extrabold sm:text-2xl">Pilih frame</h1>
        <span className="w-28" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {frames.map((f) => (
            <button key={f.id} type="button" onClick={() => onPick(f)} className="group flex flex-col items-center gap-2.5 rounded-[18px] bg-white/70 p-3 text-left shadow-[0_1px_0_rgba(14,20,36,0.06)] transition active:scale-[0.98]">
              <div className="flex h-[min(42vh,340px)] w-full items-center justify-center">
                {f.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.thumbnailUrl} alt={f.name} className="max-h-full max-w-full rounded-[4px] object-contain shadow-[0_10px_24px_-12px_rgba(14,20,36,0.5)]" />
                ) : (
                  <FrameCanvas design={f.design} tokens={tokens} maxRenderWidth={360} className="max-h-full w-auto rounded-[4px] shadow-[0_10px_24px_-12px_rgba(14,20,36,0.5)]" style={{ maxHeight: '100%' }} />
                )}
              </div>
              <div className="flex w-full items-center justify-between gap-2 px-1">
                <span className="truncate text-[15px] font-bold">{f.name}</span>
                <span className="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{f.slotCount} pose</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Operator sheet ───────────────────────────────────────────────────────────

function OperatorSheet({ open, onOpenChange, event, role, camera, mirror, onMirror, onReload, onLock }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: EventConfig;
  role: 'admin' | 'event';
  camera: ReturnType<typeof useCamera>;
  mirror: boolean;
  onMirror: (m: boolean) => void;
  onReload: () => void;
  onLock: () => void;
}) {
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title="Operator" description={`${event.name} · ${event.code}`}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">Kamera</p>
          {camera.devices.length ? (
            <div className="flex flex-col gap-1.5">
              {camera.devices.map((d, i) => (
                <button key={d.deviceId} type="button" onClick={() => void camera.start(d.deviceId)} className={cn('flex h-11 items-center justify-between rounded-ctl border px-3 text-left text-sm', d.deviceId === camera.deviceId ? 'border-brand bg-brand-soft font-semibold text-brand-ink' : 'border-line')}>
                  <span className="truncate">{d.label || `Kamera ${i + 1}`}</span>
                  {d.deviceId === camera.deviceId ? <span className="text-xs">aktif</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => void camera.start()} loading={camera.starting}><Camera /> Aktifkan kamera</Button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Mode cermin</span>
          <Segmented size="sm" value={mirror ? 'on' : 'off'} onChange={(v) => onMirror(v === 'on')} options={[{ value: 'on', label: 'Cermin' }, { value: 'off', label: 'Asli' }]} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {canFullscreen ? (
            <Button variant="secondary" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
              <Expand /> Layar penuh
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onReload}><RefreshCcw /> Muat ulang</Button>
          <a href={`/event/${event.code}`} target="_blank" rel="noreferrer" className="contents">
            <Button variant="secondary" className="w-full"><LayoutGrid /> Portal event</Button>
          </a>
          <a href={`/event/${event.code}/print`} target="_blank" rel="noreferrer" className="contents">
            <Button variant="secondary" className="w-full"><Printer /> Print station</Button>
          </a>
        </div>
        {!canFullscreen ? <p className="text-xs leading-relaxed text-muted">iPad: Share › <b>Add to Home Screen</b> untuk mode layar penuh, lalu aktifkan Guided Access agar tamu tidak keluar dari booth.</p> : null}
        <div className="flex gap-2 border-t border-line pt-4">
          <Button variant="danger-ghost" className="flex-1" onClick={onLock}><Lock /> Kunci booth</Button>
          {role === 'admin' ? (
            <a href="/admin" className="contents"><Button variant="ghost" className="flex-1"><LogOut /> Portal</Button></a>
          ) : (
            <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}><X /> Tutup</Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
