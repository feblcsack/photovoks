'use client';

/**
 * Booth kiosk state machine:
 *   attract → frames → capture → review (→ capture for retakes) → finish → attract
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Expand, LayoutGrid, Lock, LogOut, RefreshCcw, Settings2, Sparkles, X } from 'lucide-react';
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

interface BoothConfig {
  event: EventConfig;
  role: 'admin' | 'event';
  frames: FrameRecord[];
  aiConfigured: boolean;
  printStationOnline: boolean;
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
        <AttractScreen event={event} frames={config.frames} tokens={tokens} onStart={() => (config.frames.length === 1 ? chooseFrame(config.frames[0]) : setStep('frames'))} onHoldSettings={() => setOperatorOpen(true)} />
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

// ── Attract ──────────────────────────────────────────────────────────────────

function AttractScreen({ event, frames, tokens, onStart, onHoldSettings }: { event: EventConfig; frames: FrameRecord[]; tokens: Record<string, string>; onStart: () => void; onHoldSettings: () => void }) {
  const [showcase, setShowcase] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setShowcase((i) => (i + 1) % frames.length), 3500);
    return () => clearInterval(t);
  }, [frames.length]);
  const f = frames[showcase];
  const steps = ['Pilih frame', 'Bergaya', event.printMode === 'off' ? 'Simpan foto' : 'Cetak', 'Scan softfile'];

  return (
    <div className="kiosk booth-paper fixed inset-0 flex flex-col overflow-hidden" onClick={frames.length ? onStart : undefined}>
      <div className="flex items-start justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] sm:px-8">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-white uppercase">{event.code}</span>
          {event.status !== 'active' ? <span className="rounded-full bg-warn-soft px-3 py-1 text-[11px] font-bold text-warn">Mode uji · event belum aktif</span> : null}
        </div>
        <HoldButton onHold={onHoldSettings} />
      </div>

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
          <ol className="mt-8 w-full max-w-md border-y-2 border-dashed border-ink/25 py-3 font-mono">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-4 py-1.5 text-[17px] tracking-wide uppercase">
                <span className="text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-bold">{s}</span>
                <span className="flex-1 border-b-2 border-dotted border-ink/20" />
              </li>
            ))}
          </ol>
          <Button variant="sun" size="xl" className="mt-8 h-20 min-w-72 text-2xl" onClick={onStart} disabled={!frames.length}>
            <Camera className="!size-7" /> Mulai
          </Button>
          {!frames.length ? <p className="mt-3 text-sm text-danger">Belum ada frame aktif untuk event ini. Tambahkan di portal.</p> : <p className="mt-3 text-sm text-muted">Ketuk di mana saja untuk mulai</p>}
        </div>
        <div className="hidden h-full min-h-0 items-center justify-center md:flex">
          {f ? (
            <div key={f.id} className="flex max-h-full animate-pop items-center justify-center" style={{ height: 'min(70vh, 640px)' }}>
              <FrameCanvas design={f.design} tokens={tokens} maxRenderWidth={520} className="h-full w-auto rotate-[2deg] rounded-[4px] shadow-[0_30px_60px_-20px_rgba(14,20,36,0.45)]" style={{ maxHeight: '100%' }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Press-and-hold (1.2 s) to open operator settings — guests won't trigger it. */
function HoldButton({ onHold }: { onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const start = (e: React.PointerEvent) => {
    e.stopPropagation();
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onHold();
    }, 1200);
  };
  const end = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onClick={(e) => e.stopPropagation()}
      aria-label="Pengaturan operator (tahan)"
      className={cn('relative flex size-11 items-center justify-center rounded-full bg-white/80 text-ink/50 shadow-[0_1px_0_rgba(14,20,36,0.08)] transition', holding && 'scale-110 text-ink')}
    >
      <Settings2 className="size-5" />
      {holding ? <span className="absolute inset-0 animate-ping rounded-full border-2 border-ink/40" /> : null}
    </button>
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
            <Button variant="secondary" className="w-full"><Sparkles /> Print station</Button>
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
