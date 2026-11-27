'use client';

/**
 * Booth kiosk state machine:
 *   attract → character → [pay] → frames → capture → review (→ capture for retakes) → finish → attract
 * (attract → character → [pay] → zine for minizine mode)
 * [pay] only when the event charges per session (QRIS via Aulaa or cash
 * approved by the operator). A paid-but-unused payment survives a reset.
 *
 * The chosen character ("buddy") floats in a corner as a guide and reacts to
 * the countdown / flash.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Expand, Gift, LayoutGrid, Lock, LogOut, RefreshCcw, Settings2, Printer, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Buddy } from '@/components/os/Buddy';
import { CharacterSelect } from '@/components/os/CharacterSelect';
import { BootScreen } from '@/components/os/screens';
import { HillsWallpaper } from '@/components/os/retro';
import { PaymentPanel } from '@/components/payments/PaymentPanel';
import type { PaymentMethod, PaymentRequirement, PaymentView } from '@/lib/payments/types';
import { formatRupiah } from '@/lib/settings-shared';
import type { LibrarySticker } from '@/lib/session-types';
import type { MemeStyle } from '@/lib/booth/meme';
import { NO_ADJUST, type Adjustments } from '@/lib/booth/grade';
import { mascotLine, type GuideMoment, type MascotId } from '@/lib/mascots';
import { setSfxEnabled, sfx, sfxEnabled } from '@/lib/sfx';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { api } from '@/lib/fetcher';
import { defaultTokens } from '@/lib/frames/render';
import { aspectOfSlot, type FrameRecord } from '@/lib/frames/types';
import type { EventConfig } from '@/lib/events';
import { cn } from '@/lib/utils';
import { useCamera } from './useCamera';
import { CaptureStage, type CaptureEvent, type Shot } from './CaptureStage';
import { ReviewStage } from './ReviewStage';
import { FinishStage } from './FinishStage';
import { OfflineIndicator } from './OfflineIndicator';
import { AttractView } from './AttractView';
import { BoothZine } from './BoothZine';
import { XmbFramePicker } from './XmbFramePicker';

interface BoothConfig {
  event: EventConfig;
  role: 'admin' | 'event';
  frames: FrameRecord[];
  aiConfigured: boolean;
  printStationOnline: boolean;
  media: { attractUrl: string | null };
  payment?: PaymentRequirement;
  libraryStickers?: LibrarySticker[];
  fun?: { lowPoly: boolean; meme: boolean };
}

type Step = 'attract' | 'character' | 'pay' | 'frames' | 'capture' | 'review' | 'finish' | 'zine';
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
  // Buddy (guide character) + what it is saying right now
  const [buddy, setBuddy] = useState<MascotId | null>(null);
  const [route, setRoute] = useState<'photo' | 'zine'>('photo');
  const [buddyMsg, setBuddyMsg] = useState<string | null>(null);
  const [buddyEmote, setBuddyEmote] = useState(0);
  const [finishPhase, setFinishPhase] = useState<'processing' | 'done' | 'error'>('processing');
  // Paid (or operator free pass) session ticket, consumed by POST /api/sessions.
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [meme, setMeme] = useState<MemeStyle>('none');
  const [adjust, setAdjust] = useState<Adjustments>(NO_ADJUST);
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
    setMeme('none');
    setAdjust(NO_ADJUST);
    setRetakesUsed(0);
    setBuddy(null);
    setBuddyMsg(null);
    setRoute('photo');
    setFinishPhase('processing');
    setSessionKey((k) => k + 1);
    void load(); // pick up frame/setting changes between guests
  }, [load]);

  const idleEnabled = step === 'frames' || step === 'review' || step === 'character' || (step === 'pay' && !paymentToken);
  // (zine mode has its own close button; guests can take their time designing)
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

  const onCaptureEvent = useCallback(
    (e: CaptureEvent) => {
      if (!buddy) return;
      if (e.type === 'countdown') setBuddyMsg(`${e.n}… ${mascotLine(buddy, 'countdown', e.n)}`);
      else if (e.type === 'flash') setBuddyEmote((n) => n + 1);
      else if (e.type === 'saved') setBuddyMsg(mascotLine(buddy, 'saved', e.index));
      else setBuddyMsg(null);
    },
    [buddy],
  );

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
  if (!config || !event) return <BootScreen />;

  const retakesLeft = event.allowRetake ? Math.max(0, event.maxRetakes - retakesUsed) : 0;
  const filledShots = shots.filter((s): s is Shot => !!s);

  const startFlow = (to: 'photo' | 'zine') => {
    sfx.unlock();
    sfx.select();
    setRoute(to);
    setStep('character');
  };
  const needsPayment = !!config.payment?.required && !paymentToken;
  const afterCharacter = (id: MascotId) => {
    setBuddy(id);
    if (needsPayment) setStep('pay');
    else proceedAfterPay();
  };
  const proceedAfterPay = () => {
    if (route === 'zine') setStep('zine');
    else if (config.frames.length === 1 && !event.zineEnabled) chooseFrame(config.frames[0]);
    else setStep('frames');
  };
  const createSessionPayment = async (method: PaymentMethod) =>
    (await api<{ payment: PaymentView }>('/api/payments', { method: 'POST', json: { purpose: 'session', eventCode: code, method } })).payment;

  const moment: GuideMoment | null =
    step === 'frames' ? 'frames' : step === 'capture' ? 'ready' : step === 'review' ? 'review' : step === 'finish' ? finishPhase : null;

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
          onStart={() => startFlow('photo')}
          onZine={event.zineEnabled ? () => startFlow('zine') : undefined}
          corner={<HoldButton onHold={() => setOperatorOpen(true)} />}
        />
      ) : null}

      {step === 'character' ? <CharacterSelect key={sessionKey} initial={buddy ?? undefined} onPick={afterCharacter} onBack={reset} /> : null}

      {step === 'pay' && config.payment ? (
        <div className="kiosk fixed inset-0 z-30 flex items-center justify-center overflow-y-auto px-4 py-8">
          <HillsWallpaper />
          <PaymentPanel
            kiosk
            className="relative"
            what={route === 'zine' ? '1 sesi minizine' : `1 sesi foto · ${event.name}`}
            requirement={config.payment}
            create={createSessionPayment}
            onPaid={(p) => {
              setPaymentToken(p.token);
              proceedAfterPay();
            }}
            onCancel={reset}
          />
        </div>
      ) : null}

      {step === 'frames' ? (
        <XmbFramePicker
          frames={config.frames}
          tokens={tokens}
          eventName={event.name}
          onPick={chooseFrame}
          onZine={event.zineEnabled ? () => setStep('zine') : undefined}
          onBack={() => setStep('character')}
        />
      ) : null}

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
          onEvent={onCaptureEvent}
          pals={!!config.fun?.lowPoly}
          onDone={onCaptureDone}
          onCancel={() => (filledShots.length === shotCount ? setStep('review') : config.frames.length > 1 || event.zineEnabled ? setStep('frames') : reset())}
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
          memeEnabled={!!config.fun?.meme}
          meme={meme}
          onMemeChange={setMeme}
          adjust={adjust}
          onAdjustChange={setAdjust}
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
          paymentToken={paymentToken}
          onPaymentUsed={() => setPaymentToken(null)}
          meme={config.fun?.meme ? meme : 'none'}
          adjust={adjust}
          buddy={buddy}
          onPhase={setFinishPhase}
          onDone={reset}
        />
      ) : null}

      {step === 'zine' ? <BoothZine key={sessionKey} code={code} event={event} camera={camera} mirror={mirror} buddy={buddy} paymentToken={paymentToken} onPaymentUsed={() => setPaymentToken(null)} libraryStickers={config.libraryStickers} onDone={reset} /> : null}

      {buddy && moment ? (
        <Buddy key={`${sessionKey}-${buddy}`} id={buddy} moment={moment} message={step === 'capture' ? buddyMsg : null} emote={buddyEmote} side={step === 'frames' ? 'right' : 'left'} />
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
        payment={config.payment}
        hasTicket={!!paymentToken}
        onFreePass={async () => {
          const res = await api<{ payment: PaymentView }>('/api/payments', { method: 'POST', json: { purpose: 'session', eventCode: code, free: true } });
          setPaymentToken(res.payment.token);
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

// ── Operator sheet ───────────────────────────────────────────────────────────

function OperatorSheet({ open, onOpenChange, event, role, camera, mirror, onMirror, onReload, onLock, payment, hasTicket, onFreePass }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: EventConfig;
  role: 'admin' | 'event';
  camera: ReturnType<typeof useCamera>;
  mirror: boolean;
  onMirror: (m: boolean) => void;
  onReload: () => void;
  onLock: () => void;
  payment?: PaymentRequirement;
  hasTicket: boolean;
  onFreePass: () => Promise<void>;
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
        <SoundToggle />
        {payment?.required ? (
          <div className="rounded-ctl border border-line px-3 py-2.5">
            <p className="text-sm font-semibold">Pembayaran sesi · {formatRupiah(payment.amount)}</p>
            <p className="mt-0.5 text-xs text-muted">{hasTicket ? 'Sesi berikutnya sudah dibayar / gratis ✓' : 'Tamu membayar setelah memilih karakter.'}</p>
            {!hasTicket ? (
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void onFreePass().catch(() => {})}><Gift /> Gratiskan sesi berikutnya</Button>
            ) : null}
          </div>
        ) : null}
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

function SoundToggle() {
  const [on, setOn] = useState(sfxEnabled);
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-semibold">{on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} Efek suara</span>
      <Segmented
        size="sm"
        value={on ? 'on' : 'off'}
        onChange={(v) => {
          setSfxEnabled(v === 'on');
          setOn(v === 'on');
          if (v === 'on') sfx.select();
        }}
        options={[{ value: 'on', label: 'Nyala' }, { value: 'off', label: 'Mati' }]}
      />
    </div>
  );
}
