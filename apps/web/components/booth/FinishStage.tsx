'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Clock, Film, Home, ImageIcon, Palette, Printer, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { PrintDialog } from '@/components/print/PrintDialog';
import { AiStudio } from '@/components/session/AiStudio';
import { useGuestSession } from '@/components/session/useGuestSession';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { createCanvas, prepareDesign, renderDesign, scaledCopy } from '@/lib/frames/render';
import { boomerang, buildSprite, encodeGif, filteredCopy, LIVE_CELL_WIDTH, LIVE_FRAMES, toJpeg } from '@/lib/booth/media';
import { printSheet, renderSheet, sheetToJpeg } from '@/lib/print/sheet';
import type { SheetPlan } from '@/lib/print/papers';
import type { EventConfig } from '@/lib/events';
import type { FrameRecord } from '@/lib/frames/types';
import { primarySlotAspect } from '@/lib/frames/types';
import type { AiGenerationView } from '@/lib/session-types';
import { cn } from '@/lib/utils';
import type { Shot } from './CaptureStage';
import { PhotoMachineSlot } from '@/components/brand/scrap';

type Phase = 'compose' | 'animate' | 'upload' | 'save' | 'done' | 'error';
const PHASES: Array<{ id: Phase; label: string }> = [
  { id: 'compose', label: 'Menyusun foto ke frame' },
  { id: 'animate', label: 'Membuat foto bergerak' },
  { id: 'upload', label: 'Mengunggah' },
  { id: 'save', label: 'Menyimpan ke galeri event' },
];
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

export function FinishStage({ code, event, frame, shots, selection, filter, tokens, printStationOnline, aiConfigured, onDone }: {
  code: string;
  event: EventConfig;
  frame: FrameRecord;
  shots: Shot[];
  selection: number[];
  filter: string;
  tokens: Record<string, string>;
  printStationOnline: boolean;
  aiConfigured: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const [phase, setPhaseState] = useState<Phase>('compose');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<'strip' | 'live'>('strip');
  const [printOpen, setPrintOpen] = useState<{ url: string | Blob; type: 'strip' | 'ai'; aiId?: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [remaining, setRemaining] = useState(AUTO_RETURN_S);
  const started = useRef(false);
  const createdRef = useRef<{ sessionId: string; sessionToken: string; uploadUrls: Record<string, string> } | null>(null);
  const lastPhase = useRef<Phase>('compose');
  const [failedAt, setFailedAt] = useState<Phase>('compose');
  const { data: guest, refresh } = useGuestSession(result?.token ?? null);

  const run = useCallback(async () => {
    setError(null);
    setProgress(0);
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
          json: { eventCode: code, frameId: frame.id, shotCount: shots.length, live: hasLiveShots, gif: hasLiveShots },
        }));
      createdRef.current = created;
      const qrValue = `${window.location.origin}/s/${created.sessionToken}`;

      // 2 · Compose full-resolution strip with filtered stills.
      const assets = await prepareDesign(frame.design);
      // Filter each shot once (slots may repeat the same shot).
      const filteredStills = shots.map((s) => filteredCopy(s.still, filter));
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
        const filteredBursts = shots.map((s) => s.burst.map((f) => filteredCopy(f, filter)));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
      setFailedAt(lastPhase.current);
      setPhaseState('error');
    }
  }, [code, event, filter, frame, selection, shots, tokens]);

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

  // Auto-return countdown (paused while a dialog is open; reset on touch).
  useEffect(() => {
    if (phase !== 'done' || printOpen || aiOpen) return;
    const t = setInterval(() => setRemaining((r) => r - 1), 1000);
    const reset = () => setRemaining(AUTO_RETURN_S);
    window.addEventListener('pointerdown', reset);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', reset);
    };
  }, [phase, printOpen, aiOpen]);
  useEffect(() => {
    if (remaining <= 0) onDone();
  }, [remaining, onDone]);

  const shareUrl = result && typeof window !== 'undefined' ? `${window.location.origin}/s/${result.token}` : '';
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
    return (
      <div className="kiosk booth-paper fixed inset-0 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-3xl">{phase === 'error' ? 'Ups, ada kendala' : 'Sebentar ya…'}</h1>
          <ol className="flex flex-col gap-3">
            {PHASES.map((p, i) => {
              const done = i < idx;
              const failed = phase === 'error' && i === idx;
              const current = phase !== 'error' && i === idx;
              return (
                <li key={p.id} className={cn('flex items-center gap-3 rounded-[14px] bg-white px-4 py-3 text-[15px] font-semibold shadow-[0_1px_0_rgba(14,20,36,0.06)]', !done && !current && !failed && 'opacity-45', failed && 'text-danger')}>
                  <span className="flex size-7 items-center justify-center">
                    {done ? <Check className="size-5 text-ok" /> : current ? <Spinner className="size-5" /> : failed ? <span className="text-lg font-bold">!</span> : <span className="size-2 rounded-full bg-ink/30" />}
                  </span>
                  <span className="flex-1">{p.label}</span>
                  {p.id === 'upload' && current ? <span className="text-sm tabular-nums text-muted">{progress}%</span> : null}
                </li>
              );
            })}
          </ol>
          {phase === 'error' ? (
            <div className="mt-6 text-center">
              <p className="text-sm text-danger">{error}</p>
              <p className="mt-1 text-xs text-muted">Foto masih tersimpan di perangkat ini. Periksa internet lalu coba lagi.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="secondary" size="lg" onClick={onDone}>Batalkan</Button>
                <Button variant="sun" size="lg" onClick={() => void run()}><RefreshCcw /> Coba lagi</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Result view ────────────────────────────────────────────────────────────
  return (
    <div className="kiosk booth-paper fixed inset-0 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 sm:px-6">
        <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-muted shadow-[0_1px_0_rgba(14,20,36,0.06)]">
          <Clock className="size-4" /> Kembali dalam {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
        <Button variant="ink" size="lg" onClick={onDone}><Home /> Selesai</Button>
      </header>
      <div className="grid min-h-0 flex-1 gap-5 px-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="flex min-h-0 flex-col items-center justify-center gap-3">
          <PhotoMachineSlot printing trayClassName="flex w-full max-w-full justify-center" sub="ambil hasilmu">
            <div className="print-out">
              <div className="bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(14,20,36,0.55)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={view === 'live' && result.gifUrl ? result.gifUrl : result.stripUrl}
                  alt="Hasil foto"
                  className="developing block max-h-[calc(100dvh-280px)] max-w-full object-contain"
                />
              </div>
            </div>
          </PhotoMachineSlot>
          {result.gifUrl ? (
            <Segmented value={view} onChange={setView} options={[{ value: 'live', label: <><Film className="size-3.5" /> Live</> }, { value: 'strip', label: <><ImageIcon className="size-3.5" /> Foto</> }]} />
          ) : null}
        </div>
        <div className="flex flex-col gap-3 md:justify-center">
          <div className="rounded-[22px] border-2 border-ink bg-surface p-5 text-center shadow-[5px_5px_0_var(--color-ink)]">
            <p className="font-display text-2xl">Scan paspor fotomu ✶</p>
            <p className="mb-4 text-sm text-muted">Arahkan kamera HP ke kode ini</p>
            <div className="mx-auto w-fit rounded-[12px] bg-white p-2 ring-1 ring-line">
              <QRCodeSVG value={shareUrl} size={196} level="M" marginSize={1} />
            </div>
            <p className="mt-3 truncate text-[11px] text-faint">{shareUrl}</p>
          </div>

          {event.printMode === 'browser' ? (
            <div className="flex flex-col gap-1.5">
              <Button variant="sun" size="xl" onClick={() => void printNow()} loading={printing}>
                <Printer /> {printedCount ? 'Cetak lagi' : 'Cetak sekarang'}
              </Button>
              <p className="text-center text-xs text-muted">
                {printedCount ? `Terkirim ke printer${event.printCopies > 1 ? ` · ${event.printCopies} lembar` : ''}` : `${event.printCopies} lembar · langsung ke printer booth`}
                {' · '}
                <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setPrintOpen({ url: result.stripBlob, type: 'strip' })}>atur ukuran</button>
              </p>
            </div>
          ) : event.printMode === 'station' ? (
            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-white px-4 py-3 shadow-[0_1px_0_rgba(14,20,36,0.06)]">
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
                {!printStationOnline ? <p className="text-xs text-muted">Ambil cetakan di meja print station</p> : null}
              </div>
              <Button variant="secondary" onClick={() => void queuePrint('strip')}>
                <Printer /> {jobs.length ? 'Cetak lagi' : 'Cetak'}
              </Button>
            </div>
          ) : null}

          {event.aiEnabled && aiConfigured ? (
            <Button variant="ai" size="xl" onClick={() => setAiOpen(true)}>
              <Palette /> Ubah gaya foto
            </Button>
          ) : null}
        </div>
      </div>

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
