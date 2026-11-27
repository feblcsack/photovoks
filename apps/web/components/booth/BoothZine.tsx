'use client';

/**
 * Booth minizine mode: capture a few photos → design the zine in the studio →
 * print + save (QR softfile). The zine is stored as a normal session whose
 * "strip" is the zine sheet, so gallery, print queue and QR all just work.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Home, Printer, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PixelIcon } from '@/components/os/retro';
import { useToast } from '@/components/ui/toast';
import { ZineStudio, type BuiltSheet, type ZinePhoto } from '@/components/zine/ZineStudio';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { scaledCopy } from '@/lib/frames/render';
import { toJpeg } from '@/lib/booth/media';
import { printSheet } from '@/lib/print/sheet';
import { autoFill, blankPage, pageAspect, zinePaper, ZINE_PAPERS, type ZinePage } from '@/lib/zine/layout';
import type { EventConfig } from '@/lib/events';
import type { MascotId } from '@/lib/mascots';
import { CaptureStage, type Shot } from './CaptureStage';
import type { CameraController } from './useCamera';
import type { LibrarySticker } from '@/lib/session-types';

const FIRST_SHOTS = 4;
const MAX_SHOTS = 8;

export function BoothZine({ code, event, camera, mirror, buddy, onDone, paymentToken = null, onPaymentUsed, libraryStickers = [] }: { code: string; event: EventConfig; camera: CameraController; mirror: boolean; buddy?: MascotId | null; onDone: () => void; paymentToken?: string | null; onPaymentUsed?: () => void; libraryStickers?: LibrarySticker[] }) {
  const toast = useToast();
  // Papers the booth can print on: the event's paper (when it suits a zine) + A4.
  const papers = useMemo(() => {
    const list = ['a4'];
    if (ZINE_PAPERS.some((p) => p.id === event.printPaper) && event.printPaper !== 'a4') list.unshift(event.printPaper);
    return list;
  }, [event.printPaper]);
  const paper = zinePaper(papers[0]);
  const aspect = pageAspect(paper);

  const [shots, setShots] = useState<(Shot | null)[]>(Array(FIRST_SHOTS).fill(null));
  const [queue, setQueue] = useState<number[]>(Array.from({ length: FIRST_SHOTS }, (_, i) => i));
  const [step, setStep] = useState<'capture' | 'studio'>('capture');
  const [pages, setPages] = useState<ZinePage[]>(() => Array.from({ length: 8 }, (_, i) => blankPage(i, event.name, `${event.name}\nmade at photovoks ✶`)));
  const [saved, setSaved] = useState<{ token: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const photos = useMemo<ZinePhoto[]>(() => shots.flatMap((s, i) => (s ? [{ key: `b-${i}`, src: s.still, label: `#${i + 1}` }] : [])), [shots]);
  // After the first capture round, lay the photos out on the pages once.
  const [filled, setFilled] = useState(false);
  if (step === 'studio' && !filled && photos.length) {
    setFilled(true);
    setPages(autoFill(pages, photos.map((p) => p.key)));
  }

  const onShot = useCallback((i: number, shot: Shot) => setShots((prev) => {
    const next = [...prev];
    next[i] = shot;
    return next;
  }), []);

  function morePhotos() {
    if (shots.length >= MAX_SHOTS) return toast(`Maksimal ${MAX_SHOTS} foto`, 'info');
    const add = Math.min(2, MAX_SHOTS - shots.length);
    setQueue(Array.from({ length: add }, (_, k) => shots.length + k));
    setShots([...shots, ...Array(add).fill(null)]);
    setStep('capture');
  }

  async function save(build: (paperId: string, guides: boolean) => Promise<BuiltSheet>, paperId: string, guides: boolean, print: boolean) {
    setBusy(print ? 'print' : 'save');
    try {
      const sheet = await build(paperId, guides);
      const taken = shots.filter((s): s is Shot => !!s);
      const created = await api<{ sessionId: string; sessionToken: string; uploadUrls: Record<string, string> }>('/api/sessions', {
        method: 'POST',
        json: { eventCode: code, kind: 'zine', shotCount: Math.max(1, taken.length), paymentToken },
      });
      onPaymentUsed?.();
      const station = print && event.printMode === 'station' && paperId === event.printPaper;
      const uploads: Array<[string, Blob]> = [
        ['strip.jpg', sheet.blob],
        ['thumb.jpg', await toJpeg(scaledCopy(sheet.canvas, 480), 0.8)],
        ...(await Promise.all(taken.map(async (s, i): Promise<[string, Blob]> => [`photo_${i}.jpg`, await toJpeg(scaledCopy(s.still, 1200, 1200), 0.85)]))),
        // The print station prints sheet.jpg — only needed when it will print.
        ...(station ? [['sheet.jpg', sheet.blob] as [string, Blob]] : []),
      ];
      for (const [name, blob] of uploads) await uploadToSignedUrl(created.uploadUrls[name], blob, 'image/jpeg');
      await api(`/api/sessions/${created.sessionId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${created.sessionToken}` },
        json: { filter: 'zine', stripWidth: sheet.canvas.width, stripHeight: sheet.canvas.height, liveFrames: 0, autoPrint: station },
      });
      if (print && !station) {
        await printSheet(sheet.blob, { pageWidthMm: sheet.paper.widthMm, pageHeightMm: sheet.paper.heightMm, widthPx: sheet.canvas.width, heightPx: sheet.canvas.height, placements: [], layout: 'fit' }, 1);
        await api(`/api/s/${created.sessionToken}/print`, { method: 'POST', json: { mode: 'browser', type: 'strip', copies: 1, paper: paperId } }).catch(() => {});
      }
      if (station) toast('Dikirim ke print station');
      setSaved({ token: created.sessionToken });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan zine', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (step === 'capture') {
    return (
      <CaptureStage
        key={queue.join(',')}
        camera={camera}
        queue={queue}
        totalShots={shots.length}
        aspectFor={() => aspect}
        countdown={event.countdownSeconds}
        mode={event.captureMode}
        mirror={mirror}
        live={false}
        existing={shots}
        onShot={onShot}
        onDone={() => setStep('studio')}
        onCancel={() => (photos.length ? setStep('studio') : onDone())}
      />
    );
  }

  const shareUrl = saved && typeof window !== 'undefined' ? `${window.location.origin}/s/${saved.token}${buddy ? `?b=${buddy}` : ''}` : '';
  return (
    <>
      <ZineStudio
        kiosk
        libraryStickers={libraryStickers}
        photos={photos}
        title={event.name}
        subtitle={`${event.name}\nmade at photovoks ✶`}
        onClose={onDone}
        allowUpload={false}
        onMorePhotos={shots.length < MAX_SHOTS ? morePhotos : undefined}
        papers={papers}
        defaultPaper={papers[0]}
        pages={pages}
        onPagesChange={setPages}
        extraActions={(build, paperId, guides) => (
          <div className="grid gap-2 sm:grid-cols-2">
            {event.printMode !== 'off' ? (
              <Button variant="primary" size="xl" loading={busy === 'print'} disabled={!!busy || !!saved} onClick={() => void save(build, paperId, guides, true)}>
                <Printer /> Cetak &amp; simpan
              </Button>
            ) : null}
            <Button variant="ink" size="xl" loading={busy === 'save'} disabled={!!busy || !!saved} onClick={() => void save(build, paperId, guides, false)}>
              <QrCode /> Simpan &amp; QR
            </Button>
          </div>
        )}
      />
      <Dialog win winIcon={<PixelIcon name="book" className="size-4" />} open={!!saved} onOpenChange={() => {}} hideClose size="sm" title="Zine kamu siap! ✶" description="Scan untuk unduh lembar zine + cara melipatnya.">
        <div className="flex flex-col items-center gap-4 pb-2">
          <div className="bevel-in bg-white p-3">
            <QRCodeSVG value={shareUrl} size={200} level="M" marginSize={1} />
          </div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Check className="size-4 text-ok" /> Tersimpan di galeri event</p>
          <Button variant="win-go" size="xl" className="w-full" onClick={onDone}><Home /> Selesai</Button>
        </div>
      </Dialog>
    </>
  );
}
