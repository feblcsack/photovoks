'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Clock, Film, Home, ImageIcon, Palette, Printer, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { HillsWallpaper, PixelIcon, Taskbar, TaskItem, WinPanel, WinWindow } from '@/components/os/retro';
import { ShutdownScreen } from '@/components/os/screens';
import type { MascotId } from '@/lib/mascots';
import { sfx } from '@/lib/sfx';
import { useToast } from '@/components/ui/toast';
import { PrintDialog } from '@/components/print/PrintDialog';
import { AiStudio } from '@/components/session/AiStudio';
import { useGuestSession } from '@/components/session/useGuestSession';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { createCanvas, prepareDesign, renderDesign, scaledCopy } from '@/lib/frames/render';
import { boomerang, buildSprite, encodeGif, LIVE_CELL_WIDTH, LIVE_FRAMES, toJpeg } from '@/lib/booth/media';
import { ensureMemeFonts, styledCopy, type MemeStyle } from '@/lib/booth/meme';
import { BikunProgress } from '@/components/brand/BikunProgress';
import { SimStudio } from '@/components/sim/SimStudio';
import { SimMock } from '@/components/sim/SimPromo';
import { IdCard } from 'lucide-react';
import { printSheet, renderSheet, sheetToJpeg } from '@/lib/print/sheet';
import type { SheetPlan } from '@/lib/print/papers';
import type { EventConfig } from '@/lib/events';
import type { FrameRecord } from '@/lib/frames/types';
import { primarySlotAspect } from '@/lib/frames/types';
import type { AiGenerationView } from '@/lib/session-types';
import { cn } from '@/lib/utils';
import type { Shot } from './CaptureStage';
import { PhotoMachineSlot } from '@/components/brand/scrap';
import { WordArt } from '@/components/brand/WordArt';

type Phase = 'compose' | 'animate' | 'upload' | 'save' | 'done' | 'error';
const PHASES: Array<{ id: Phase; label: string; joke: string }> = [
  { id: 'compose', label: 'Menyusun foto ke frame', joke: 'Merapikan rambut digital…' },
  { id: 'animate', label: 'Membuat foto bergerak', joke: 'Mengajari foto cara berkedip…' },
  { id: 'upload', label: 'Mengunggah', joke: 'Mengirim senyum ke awan…' },
  { id: 'save', label: 'Menyimpan ke galeri event', joke: 'Menempel di dinding galeri…' },
];
const PHASE_BASE: Record<Phase, number> = { compose: 8, animate: 28, upload: 40, save: 94, done: 100, error: 0 };
const AUTO_RETURN_S = 120;
const STRIP_JPEG_QUALITY = 0.9;
const SHOT_MAX_SIDE = 1200;
const SHOT_JPEG_QUALITY = 0.85;

interface Result {
  sessionId: string;
  token: string;
  stripUrl: string;
  gifUrl: string | null;
  stripBlob: Blob;
  sheetBlob: Blob;
  sheetPlan: SheetPlan;
}

export function FinishStage({ code, event, frame, shots, selection, filter, tokens, printStationOnline, aiConfigured, buddy, onPhase, onDone, paymentToken = null, onPaymentUsed, meme = 'none' }: {
  code: string;
  event: EventConfig;
  frame: FrameRecord;
  shots: Shot[];
  selection: number[];
  filter: string;
  tokens: Record<string, string>;
  printStationOnline: boolean;
  aiConfigured: boolean;
  /** Carried to the QR page so the same buddy greets the guest. */
  buddy?: MascotId | null;
  onPhase?: (p: 'processing' | 'done' | 'error') => void;
  onDone: () => void;
  /** Paid session ticket (events that charge per session). */
  paymentToken?: string | null;
  onPaymentUsed?: () => void;
  /** Meme look chosen in review. */
  meme?: MemeStyle;
}) {
  const toast = useToast();
  const [phase, setPhaseState] = useState<Phase>('compose');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<'strip' | 'live'>('strip');
  const [printOpen, setPrintOpen] = useState<{ url: string | Blob; type: 'strip' | 'ai'; aiId?: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  // SIM photos: the same filtered/meme'd stills as the strip (computed once per opening).
  const simPhotos = useMemo(() => (simOpen ? shots.map((s, i) => ({ key: `shot-${i}`, src: styledCopy(s.still, filter, meme) })) : []), [simOpen, shots, filter, meme]);
  const [remaining, setRemaining] = useState(AUTO_RETURN_S);
  const started = useRef(false);
  const createdRef = useRef<{ sessionId: string; sessionToken: string; uploadUrls: Record<string, string> } | null>(null);
  const lastPhase = useRef<Phase>('compose');
  const [failedAt, setFailedAt] = useState<Phase>('compose');
  const { data: guest, refresh } = useGuestSession(result?.token ?? null);

  const run = useCallback(async () => {
    setError(null);
    setProgress(0);
    onPhase?.('processing');
    const setPhase = (p: Phase) => {
      lastPhase.current = p;
      setPhaseState(p);
    };
    try {
      // 1 · Reserve the session first so the frame's QR can carry the real
      //     softfile link. Reused on retry (no orphan sessions).
      setPhase('compose');
      const hasLiveShots = event.livePhoto && shots.every((s) => s.burst.length === LIVE_FRAMES);
      const created =
        createdRef.current ??
        (await api<{ sessionId: string; sessionToken: string; uploadUrls: Record<string, string> }>('/api/sessions', {
          method: 'POST',
          json: { eventCode: code, frameId: frame.id, shotCount: shots.length, live: hasLiveShots, gif: hasLiveShots, paymentToken },
        }));
      if (!createdRef.current) onPaymentUsed?.();
      createdRef.current = created;
      const qrValue = `${window.location.origin}/s/${created.sessionToken}`;

      // 2 · Compose full-resolution strip with filtered stills.
      const assets = await prepareDesign(frame.design);
      // Filter each shot once (slots may repeat the same shot).
      if (meme !== 'none') await ensureMemeFonts();
      const filteredStills = shots.map((s) => styledCopy(s.still, filter, meme));
      const fullPhotos = Array.from({ length: frame.slotCount }, (_, i) => filteredStills[selection[i]]);
      const strip = createCanvas(frame.design.width, frame.design.height);
      renderDesign(strip.getContext('2d')!, frame.design, { photos: fullPhotos, assets, tokens, qrValue });
      // Egress: a high-quality JPEG is ~5–10× smaller than PNG and still
      // prints cleanly at 300 DPI. Raw shots are only for softfile/AI → ≤1200px.
      const stripBlob = await toJpeg(strip, STRIP_JPEG_QUALITY);
      const thumbBlob = await toJpeg(scaledCopy(strip, 480), 0.8);
      const sheet = renderSheet(strip, strip.width, strip.height, event.printPaper, 'auto', 0);
      const sheetBlob = await sheetToJpeg(sheet.canvas);
      const shotBlobs = await Promise.all(filteredStills.map((c) => toJpeg(scaledCopy(c, SHOT_MAX_SIDE, SHOT_MAX_SIDE), SHOT_JPEG_QUALITY)));

      // 3 · Live photo: sprite (all shots) + animated GIF of the whole frame.
      let spriteBlob: Blob | null = null;
      let gifBlob: Blob | null = null;
      if (hasLiveShots) {
        setPhase('animate');
        const filteredBursts = shots.map((s) => s.burst.map((f) => styledCopy(f, filter, meme)));
        const cellW = LIVE_CELL_WIDTH;
        const cellH = Math.round(cellW / primarySlotAspect(frame.design));
        spriteBlob = await toJpeg(buildSprite(filteredBursts, cellW, cellH), 0.8);
        const scale = Math.min(1, 540 / Math.max(frame.design.width, frame.design.height));
        const frames: HTMLCanvasElement[] = [];
        for (const k of boomerang(Array.from({ length: LIVE_FRAMES }, (_, i) => i))) {
          const c = createCanvas(frame.design.width * scale, frame.design.height * scale);
          renderDesign(c.getContext('2d')!, frame.design, {
            photos: Array.from({ length: frame.slotCount }, (_, i) => filteredBursts[selection[i]][k]),
            assets,
            tokens,
            scale,
            qrValue,
          });
          frames.push(c);
        }
        gifBlob = await encodeGif(frames, 90, 540);
      }

      // 4 · Upload everything straight to storage.
      setPhase('upload');
      const uploads: Array<[string, Blob, string]> = [
        ['strip.jpg', stripBlob, 'image/jpeg'],
        ['thumb.jpg', thumbBlob, 'image/jpeg'],
        ['sheet.jpg', sheetBlob, 'image/jpeg'],
        ...shotBlobs.map((b, i): [string, Blob, string] => [`photo_${i}.jpg`, b, 'image/jpeg']),
        ...(spriteBlob ? [['live.jpg', spriteBlob, 'image/jpeg'] as [string, Blob, string]] : []),
        ...(gifBlob ? [['anim.gif', gifBlob, 'image/gif'] as [string, Blob, string]] : []),
      ];
      const total = uploads.reduce((s, u) => s + u[1].size, 0);
      let sent = 0;
      // Upload 3 at a time.
      const queue = [...uploads];
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (queue.length) {
            const [name, blob, type] = queue.shift()!;
            await uploadToSignedUrl(created.uploadUrls[name], blob, type);
            sent += blob.size;
            setProgress(Math.round((sent / total) * 100));
          }
        }),
      );

      // 5 · Confirm (+ auto print when the event uses a print station).
      setPhase('save');
      await api(`/api/sessions/${created.sessionId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${created.sessionToken}` },
        json: {
          slotMap: selection,
          filter,
          stripWidth: strip.width,
          stripHeight: strip.height,
          liveFrames: spriteBlob ? LIVE_FRAMES : 0,
          autoPrint: event.printMode === 'station',
        },
      });

      setResult({
        sessionId: created.sessionId,
        token: created.sessionToken,
        stripBlob,
        sheetBlob,
        sheetPlan: sheet.plan,
        stripUrl: URL.createObjectURL(stripBlob),
        gifUrl: gifBlob ? URL.createObjectURL(gifBlob) : null,
      });
      setView(gifBlob ? 'live' : 'strip');
      setPhaseState('done');
      sfx.tada();
      onPhase?.('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
      setFailedAt(lastPhase.current);
      setPhaseState('error');
      sfx.error();
      onPhase?.('error');
    }
  }, [code, event, filter, frame, selection, shots, tokens, onPhase, paymentToken, onPaymentUsed, meme]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  useEffect(
    () => () => {
      if (result) {
        URL.revokeObjectURL(result.stripUrl);
        if (result.gifUrl) URL.revokeObjectURL(result.gifUrl);
      }
    },
    [result],
  );

  // While photos exist only on this device (uploading / upload failed), warn
  // before the tab is closed or reloaded so a network outage never loses them.
  useEffect(() => {
    if (phase === 'done') return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase]);

  // Auto-return countdown (paused while a dialog is open; reset on touch).
  useEffect(() => {
    if (phase !== 'done' || printOpen || aiOpen || simOpen) return;
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    const reset = () => setRemaining(AUTO_RETURN_S);
    window.addEventListener('pointerdown', reset);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', reset);
    };
  }, [phase, printOpen, aiOpen, simOpen]);
  useEffect(() => {
    if (remaining <= 0) onDone();
  }, [remaining, onDone]);

  const shareUrl = result && typeof window !== 'undefined' ? `${window.location.origin}/s/${result.token}${buddy ? `?b=${buddy}` : ''}` : '';
  const [leaving, setLeaving] = useState(false);
  const jobs = guest?.session.printJobs ?? [];
  const activeJob = jobs.find((j) => j.status === 'queued' || j.status === 'printing');
  const failedJob = jobs.find((j) => j.status === 'failed');

  const [printing, setPrinting] = useState(false);
  /** One tap: prints the ready-made sheet with the event's paper + copies. */
  async function printNow() {
    if (!result || printing) return;
    setPrinting(true);
    try {
      await printSheet(result.sheetBlob, result.sheetPlan, event.printCopies);
      await api(`/api/s/${result.token}/print`, { method: 'POST', json: { mode: 'browser', type: 'strip', copies: event.printCopies, paper: event.printPaper } }).catch(() => {});
      setPrintedCount((n) => n + 1);
    } catch {
      toast('Gagal membuka printer', 'error');
    } finally {
      setPrinting(false);
    }
  }
  const [printedCount, setPrintedCount] = useState(0);

  async function queuePrint(type: 'strip' | 'ai', aiId?: string) {
    if (!result) return;
    try {
      await api(`/api/s/${result.token}/print`, { method: 'POST', json: { mode: 'queue', type, aiId, copies: event.printCopies } });
      toast('Dikirim ke print station');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mengirim', 'error');
    }
  }

  // ── Processing view ────────────────────────────────────────────────────────
  if (phase !== 'done' || !result) {
    const idx = PHASES.findIndex((p) => p.id === (phase === 'error' ? failedAt : phase));
    const overall = phase === 'upload' ? PHASE_BASE.upload + progress * 0.52 : PHASE_BASE[phase];
    return (
      <div className="kiosk fixed inset-0 flex flex-col items-center justify-center overflow-hidden px-4">
        <HillsWallpaper />
        {phase === 'error' ? (
          <WinWindow title="Photovoks 98" icon="warning" className="relative w-full max-w-md" bodyClassName="p-4" onClose={onDone} closeLabel="Batalkan">
            <div className="flex gap-3">
              <PixelIcon name="warning" className="size-12" />
              <div className="min-w-0 text-sm leading-relaxed">
                <p className="font-pixel text-[16px] font-bold">Program ini tersandung saat &ldquo;{PHASES[idx]?.label ?? 'memproses'}&rdquo;.</p>
                <p className="mt-1 text-ink-2">{error}</p>
                <p className="mt-2 text-xs text-muted">Tenang, foto masih tersimpan di perangkat ini. Periksa internet lalu coba lagi.</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="win" size="lg" onClick={onDone}>Batalkan</Button>
              <Button variant="win-primary" size="lg" onClick={() => void run()}><RefreshCcw /> Coba lagi</Button>
            </div>
          </WinWindow>
        ) : (
          <WinWindow title="Menyalin senyum…" icon="hourglass" className="relative w-full max-w-md" bodyClassName="p-4">
            {/* Files flying from the camera folder to the gallery folder */}
            <div className="relative flex h-20 items-center justify-between px-2">
              <PixelIcon name="folder" className="size-14" />
              <span className="absolute top-6 left-16">
                {[0, 1, 2].map((k) => (
                  <PixelIcon key={k} name="camera" className="paper-fly absolute size-7" style={{ ['--fx' as string]: 'clamp(60px,14vw,120px)', animationDelay: `${k * 0.53}s` } as React.CSSProperties} />
                ))}
              </span>
              <PixelIcon name="computer" className="size-14" />
            </div>
            <p className="mt-2 font-pixel text-[15px] font-bold">{PHASES[idx]?.joke ?? 'Memproses…'}</p>
            <p className="text-[13px] text-ink-2">Dari &lsquo;Kamera&rsquo; ke &lsquo;Galeri {event.name}&rsquo;</p>
            <BikunProgress className="mt-3" value={overall} label={`Bikun mengantar fotomu… kira-kira ${Math.max(1, Math.round((100 - overall) / 12))} kedipan lagi`} />
            <WinPanel className="mt-3 flex flex-col gap-1 py-1.5">
              {PHASES.filter((p) => p.id !== 'animate' || event.livePhoto).map((p) => {
                const i = PHASES.indexOf(p);
                const done = i < idx;
                const current = i === idx;
                return (
                  <p key={p.id} className={cn('flex items-center gap-2 font-pixel text-[13px]', !done && !current && 'opacity-45')}>
                    <span className="flex size-4 items-center justify-center">{done ? <Check className="size-4 text-ok" strokeWidth={3} /> : current ? <Spinner className="size-3.5" /> : '·'}</span>
                    {p.label}
                    {p.id === 'upload' && current ? <span className="ml-auto tabular-nums">{progress}%</span> : null}
                  </p>
                );
              })}
            </WinPanel>
          </WinWindow>
        )}
      </div>
    );
  }

  // ── Result view ────────────────────────────────────────────────────────────
  const printWindow =
    event.printMode === 'browser' ? (
      <WinWindow title="Cetak.exe" icon="printer" bodyClassName="flex flex-col gap-1.5 p-3">
        <Button variant="win-go" size="xl" onClick={() => void printNow()} loading={printing}>
          <Printer /> {printedCount ? 'Cetak lagi' : 'Cetak sekarang'}
        </Button>
        <p className="text-center text-xs text-ink-2">
          {printedCount ? `Terkirim ke printer${event.printCopies > 1 ? ` · ${event.printCopies} lembar` : ''}` : `${event.printCopies} lembar · langsung ke printer booth`}
          {' · '}
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setPrintOpen({ url: result.stripBlob, type: 'strip' })}>atur ukuran</button>
        </p>
      </WinWindow>
    ) : event.printMode === 'station' ? (
      <WinWindow title="Antrean cetak" icon="printer" bodyClassName="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 text-sm">
          {activeJob ? (
            <p className="flex items-center gap-2 font-bold"><Spinner className="size-4" /> {activeJob.status === 'printing' ? 'Sedang dicetak…' : 'Dalam antrean cetak'}</p>
          ) : failedJob && !jobs.some((j) => j.status === 'printed') ? (
            <p className="font-bold text-danger">Cetak gagal — panggil operator</p>
          ) : jobs.some((j) => j.status === 'printed') ? (
            <p className="flex items-center gap-2 font-bold"><Check className="size-4 text-ok" /> Sudah dicetak</p>
          ) : (
            <p className="font-semibold">Belum dicetak</p>
          )}
          {!printStationOnline ? <p className="text-xs text-ink-2">Ambil cetakan di meja print station</p> : null}
        </div>
        <Button variant="win" onClick={() => void queuePrint('strip')}>
          <Printer /> {jobs.length ? 'Cetak lagi' : 'Cetak'}
        </Button>
      </WinWindow>
    ) : null;

  return (
    <div className="kiosk fixed inset-0 flex flex-col overflow-hidden">
      <HillsWallpaper />
      {leaving ? <ShutdownScreen onDone={onDone} /> : null}
      <header className="relative z-10 flex items-center justify-between gap-3 px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2 sm:px-5">
        <span className="bevel-out flex items-center gap-2 bg-win px-3 py-1.5 font-pixel text-[14px]">
          <Clock className="size-4" /> Kembali dalam <b className="tabular-nums">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</b>
        </span>
        <Button variant="win" size="lg" onClick={() => setLeaving(true)}><Home /> Selesai</Button>
      </header>
      <div className="relative z-10 grid min-h-0 flex-1 gap-4 overflow-y-auto px-3 pb-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] md:overflow-visible">
        <div className="flex min-h-0 flex-col items-center justify-center gap-3">
          <WordArt variant="arc" className="-mb-2 text-[clamp(30px,4.6vw,52px)]">Keren Banget!</WordArt>
          <PhotoMachineSlot printing trayClassName="flex w-full max-w-full justify-center" sub="ambil hasilmu">
            <div className="print-out">
              <div className="bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(14,20,36,0.55)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={view === 'live' && result.gifUrl ? result.gifUrl : result.stripUrl}
                  alt="Hasil foto"
                  className="developing block max-h-[calc(100dvh-300px)] max-w-full object-contain"
                />
              </div>
            </div>
          </PhotoMachineSlot>
          {result.gifUrl ? (
            <div className="flex gap-1">
              <Button variant="win" size="sm" className={view === 'live' ? 'bevel-in bg-win-mid' : ''} onClick={() => setView('live')}><Film /> Live</Button>
              <Button variant="win" size="sm" className={view === 'strip' ? 'bevel-in bg-win-mid' : ''} onClick={() => setView('strip')}><ImageIcon /> Foto</Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 md:justify-center">
          <WinWindow title="Scan_aku.exe" icon="info" bodyClassName="p-4 text-center">
            <p className="font-display text-2xl">Scan paspor fotomu ✶</p>
            <p className="mb-3 text-sm text-ink-2">Arahkan kamera HP ke kode ini</p>
            <div className="bevel-in mx-auto w-fit bg-white p-2.5">
              <QRCodeSVG value={shareUrl} size={196} level="M" marginSize={1} />
            </div>
            <p className="mt-2 font-pixel text-[12px] text-ink-2">Foto, GIF, stiker &amp; minizine ada di sana</p>
          </WinWindow>

          {printWindow}

          <WinWindow title="SIM.exe ★ Fitur Unggulan" icon="star" bodyClassName="flex items-center gap-3 bg-[#F3F1EA] p-3">
            <SimMock className="hidden shrink-0 scale-[0.55] -mx-16 -my-6 sm:flex" />
            <div className="min-w-0 flex-1">
              <p className="font-heavy text-[22px] leading-none">SIM</p>
              <p className="font-[family-name:var(--font-scribble)] text-[18px] leading-tight">Surat Izin Mejeng</p>
              <p className="mt-0.5 text-xs text-ink-2">Photozine lipat dari fotomu — cetak & bawa pulang</p>
              <Button variant="win-go" className="mt-2" onClick={() => setSimOpen(true)}><IdCard /> Bikin SIM</Button>
            </div>
          </WinWindow>

          {event.aiEnabled && aiConfigured ? (
            <Button variant="win" size="xl" onClick={() => setAiOpen(true)}>
              <Palette /> Ubah gaya foto (AI)
            </Button>
          ) : null}
        </div>
      </div>

      <Taskbar className="relative z-10">
        <TaskItem icon="tv">Pratinjau</TaskItem>
        <TaskItem icon="info" active>Scan_aku.exe</TaskItem>
        {event.printMode !== 'off' ? <TaskItem icon="printer">Cetak</TaskItem> : null}
      </Taskbar>

      <PrintDialog
        open={!!printOpen}
        onOpenChange={(o) => !o && setPrintOpen(null)}
        source={printOpen?.url ?? null}
        defaultPaper={event.printPaper}
        defaultCopies={event.printCopies}
        onPrinted={async ({ copies, paper }) => {
          if (!printOpen) return;
          await api(`/api/s/${result.token}/print`, { method: 'POST', json: { mode: 'browser', type: printOpen.type, copies, paper } }).catch(() => {});
          setPrintOpen(null);
        }}
      />

      {simOpen ? (
        <SimStudio
          kiosk
          photos={simPhotos}
          eventName={event.name}
          seed={result.sessionId}
          qrValue={shareUrl}
          onClose={() => setSimOpen(false)}
        />
      ) : null}

      <Dialog open={aiOpen} onOpenChange={setAiOpen} size="lg" dark title="Ubah gaya foto" description="Pilih foto dan gaya, lalu tunggu sebentar.">
        {guest ? (
          <AiStudio
            token={result.token}
            data={guest}
            refresh={refresh}
            dark
            onPrint={
              event.printMode === 'off'
                ? undefined
                : (g: AiGenerationView) => {
                    if (!g.url) return;
                    if (event.printMode === 'station') void queuePrint('ai', g.id);
                    else {
                      setAiOpen(false);
                      setPrintOpen({ url: g.url, type: 'ai', aiId: g.id });
                    }
                  }
            }
          />
        ) : (
          <div className="flex justify-center py-10"><Spinner /></div>
        )}
      </Dialog>
    </div>
  );
}
