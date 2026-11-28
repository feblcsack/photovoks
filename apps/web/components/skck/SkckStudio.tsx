'use client';

/**
 * SKCK studio — "Surat Keterangan Cukup Kalcer" photozine. Guest page (phone)
 * and booth (kiosk). Renders locally. The preview shows the folding guide;
 * downloads and prints are the clean sheet at the chosen paper size.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WinInput } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { PixelIcon, WinWindow } from '@/components/os/retro';
import { canvasToBlob, loadBitmap } from '@/lib/frames/render';
import { printSheet } from '@/lib/print/sheet';
import { jpegToPdf } from '@/lib/zine/pdf';
import { ensureSkckFonts, loadSkckTemplate, renderSkckPanels, renderSkckSheet, SKCK_BACK, SKCK_FRONT, SKCK_PAPERS, SKCK_SLOTS, skckNumber, skckPaper, skckToday, type SkckData } from '@/lib/skck/layout';
import { cn } from '@/lib/utils';
import { FoldSteps } from './FoldSteps';

export interface SkckPhoto {
  key: string;
  src: string | HTMLCanvasElement;
}

type Img = CanvasImageSource & { width: number; height: number };

export interface BuiltSkck {
  canvas: HTMLCanvasElement;
  blob: Blob;
  paperId: string;
}

type View = 'front' | 'back' | 'guide';

export function SkckStudio({
  photos,
  eventName,
  seed,
  qrValue,
  onClose,
  kiosk = false,
  defaultPaper = 'a4',
  initialView = 'front',
}: {
  photos: SkckPhoto[];
  eventName: string;
  /** Stable seed (session id) → SKCK number. */
  seed: string;
  qrValue: string;
  onClose: () => void;
  kiosk?: boolean;
  defaultPaper?: string;
  initialView?: View;
}) {
  const toast = useToast();
  const [imgs, setImgs] = useState<Map<string, Img>>(new Map());
  const [picked, setPicked] = useState<string[]>(() => photos.slice(0, SKCK_SLOTS.length).map((p) => p.key));
  const [name, setName] = useState('');
  const [eventText, setEventText] = useState(eventName);
  const [issued, setIssued] = useState(() => skckToday());
  const [look, setLook] = useState<SkckData['look']>('xerox');
  const [template, setTemplate] = useState<Img | null>(null);
  const [paperId, setPaperId] = useState(defaultPaper);
  const [view, setView] = useState<View>(initialView);
  const [fonts, setFonts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, string>>({});
  const [guide, setGuide] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void ensureSkckFonts().then(() => alive && setFonts(true));
    void Promise.all(photos.map(async (p) => [p.key, typeof p.src === 'string' ? await loadBitmap(p.src) : p.src] as const)).then((list) => {
      if (!alive) return;
      const m = new Map<string, Img>();
      for (const [k, v] of list) if (v) m.set(k, v);
      setImgs(m);
    });
    return () => {
      alive = false;
    };
  }, [photos]);

  useEffect(() => {
    let alive = true;
    void loadSkckTemplate()
      .then((t) => alive && setTemplate(t))
      .catch((e) => alive && toast(e instanceof Error ? e.message : 'Template SKCK gagal dimuat', 'error'));
    return () => {
      alive = false;
    };
  }, [toast]);

  const data: SkckData | null = useMemo(
    () =>
      template
        ? {
            name: name.trim() || 'Anak Kalcer',
            eventName: eventText.trim() || eventName,
            issued: issued.trim() || skckToday(),
            number: skckNumber(seed),
            qrValue,
            photos: picked.map((k) => imgs.get(k)).filter((x): x is Img => !!x),
            look,
            template,
          }
        : null,
    [template, name, eventText, eventName, issued, seed, qrValue, picked, imgs, look],
  );
  const paper = skckPaper(paperId);

  // Previews (debounced while typing). Panels for the accordion, sheet for the guide.
  useEffect(() => {
    if (!fonts || !data) return;
    const t = setTimeout(() => {
      const out: Record<string, string> = {};
      const cut = renderSkckPanels(data, 320);
      for (const id of [...SKCK_FRONT, ...SKCK_BACK]) out[id] = cut[id].toDataURL('image/jpeg', 0.86);
      setPanels(out);
      if (view === 'guide') setGuide(renderSkckSheet(data, paper, true, 4).toDataURL('image/jpeg', 0.85));
    }, 160);
    return () => clearTimeout(t);
  }, [data, fonts, paper, view]);

  const build = async (): Promise<BuiltSkck> => {
    await ensureSkckFonts();
    if (!data) throw new Error('Template SKCK belum siap');
    await new Promise((r) => setTimeout(r, 30));
    const canvas = renderSkckSheet(data, paper, false);
    return { canvas, blob: await canvasToBlob(canvas, 'image/jpeg', 0.92), paperId };
  };

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function run(kind: 'pdf' | 'jpg' | 'print') {
    setBusy(kind);
    try {
      const { canvas, blob } = await build();
      if (kind === 'jpg') download(blob, 'skck-cukup-kalcer.jpg');
      else if (kind === 'pdf') download(await jpegToPdf(blob, paper.widthMm, paper.heightMm, 'SKCK — Surat Keterangan Cukup Kalcer'), 'skck-cukup-kalcer.pdf');
      else await printSheet(blob, { pageWidthMm: paper.widthMm, pageHeightMm: paper.heightMm, widthPx: canvas.width, heightPx: canvas.height, placements: [], layout: 'fit' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal membuat SKCK', 'error');
    } finally {
      setBusy(null);
    }
  }

  function togglePhoto(key: string) {
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].slice(-SKCK_SLOTS.length)));
  }

  const strip = view === 'back' ? SKCK_BACK : SKCK_FRONT;
  const tabs: Array<[View, string]> = [['front', 'Depan'], ['back', 'Belakang'], ['guide', 'Cara lipat']];

  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col overflow-hidden bg-desk', kiosk && 'kiosk')}>
      <WinWindow
        title="SKCK.exe — Surat Keterangan Cukup Kalcer"
        icon="book"
        className="m-0 flex min-h-0 flex-1 flex-col sm:m-3"
        bodyClassName="win-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-0"
        onClose={onClose}
      >
        <div className="mx-auto grid max-w-6xl gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Preview */}
          <div className="flex min-w-0 flex-col">
            <div role="tablist" className="flex gap-0.5 pl-1">
              {tabs.map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('win-tab', view === v && 'win-tab-active')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="win-tabpanel flex min-h-[360px] flex-col items-center justify-center gap-4 bg-[#9C9A93] p-4 [background-image:radial-gradient(rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:4px_4px]">
              {!fonts || !data || !panels[strip[0]] ? (
                <Spinner className="size-7" />
              ) : view === 'guide' ? (
                <>
                  {guide ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={guide} alt="Lembar SKCK dengan garis lipat" className="block w-full max-w-3xl shadow-[4px_4px_0_rgba(0,0,0,0.35)]" />
                  ) : (
                    <Spinner className="size-7" />
                  )}
                  <p className="text-center text-[12px] text-white [text-shadow:1px_1px_0_#000]">Garis warna hanya panduan di layar — file unduhan & cetakan bersih tanpa garis.</p>
                </>
              ) : (
                <div className="flex py-4 [perspective:1400px]">
                  {strip.map((id, i) => (
                    <div key={id} className="relative w-[clamp(80px,19vw,190px)] origin-center bg-white shadow-[4px_6px_0_rgba(0,0,0,0.3)]" style={{ transform: `rotateY(${i % 2 ? -14 : 14}deg)`, marginLeft: i ? -3 : 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={panels[id]} alt={`Halaman ${id}`} className="block w-full" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            {view === 'guide' ? <FoldSteps className="mt-3" /> : null}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <fieldset className="win-fieldset">
              <legend>Data SKCK</legend>
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[13px]">Nama</span>
                  <WinInput value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder="Anak Kalcer" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px]">Event</span>
                  <WinInput value={eventText} maxLength={40} onChange={(e) => setEventText(e.target.value)} placeholder={eventName} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[13px]">Terbit</span>
                  <WinInput value={issued} maxLength={32} onChange={(e) => setIssued(e.target.value)} placeholder={skckToday()} />
                </label>
              </div>
            </fieldset>

            <fieldset className="win-fieldset">
              <legend>Tampilan</legend>
              <div className="flex gap-4">
                {([['xerox', 'Fotokopi hitam-putih'], ['warna', 'Foto berwarna']] as const).map(([v, label]) => (
                  <label key={v} className="flex items-center gap-1.5 text-[13px]">
                    <input type="radio" name="skck-look" className="win-radio" checked={look === v} onChange={() => setLook(v)} /> {label}
                  </label>
                ))}
              </div>
              <p className="mt-3 mb-1 text-[13px]">Foto ({picked.length}/{SKCK_SLOTS.length}): {SKCK_SLOTS.map((s, i) => `${i + 1}. ${s.label}`).join(' · ')}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {photos.map((p) => {
                  const order = picked.indexOf(p.key);
                  const im = imgs.get(p.key);
                  return (
                    <button key={p.key} type="button" aria-pressed={order >= 0} onClick={() => togglePhoto(p.key)} className={cn('win-field relative aspect-[3/4] overflow-hidden p-0', order < 0 && 'opacity-55')}>
                      {im ? <Thumb img={im} /> : null}
                      {order >= 0 ? <span className="absolute top-0.5 left-0.5 flex size-5 items-center justify-center bg-[#000080] text-[11px] font-bold text-white">{order + 1}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="win-fieldset">
              <legend>Unduh & cetak</legend>
              <div className="mb-2 flex flex-wrap gap-4">
                {SKCK_PAPERS.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-[13px]">
                    <input type="radio" name="skck-paper" className="win-radio" checked={paperId === p.id} onChange={() => setPaperId(p.id)} /> {p.label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="win" size="lg" onClick={() => void run('pdf')} loading={busy === 'pdf'} disabled={!!busy}><FileText /> PDF</Button>
                <Button variant="win" size="lg" onClick={() => void run('jpg')} loading={busy === 'jpg'} disabled={!!busy}><Download /> JPG</Button>
              </div>
              <Button variant="win" size="lg" className="mt-2 w-full" onClick={() => void run('print')} loading={busy === 'print'} disabled={!!busy}><Printer /> Cetak dari perangkat ini</Button>
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-2"><PixelIcon name="info" className="size-4 shrink-0" /> Cetak 1 sisi, lanskap, skala 100%. Parodi photozine — bukan dokumen resmi.</p>
            </fieldset>
            {kiosk ? <Button variant="win" size="lg" onClick={onClose}><X /> Tutup</Button> : null}
          </div>
        </div>
      </WinWindow>
    </div>
  );
}

function Thumb({ img }: { img: Img }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 90;
    c.height = 120;
    const s = Math.max(90 / img.width, 120 / img.height);
    c.getContext('2d')!.drawImage(img, (90 - img.width * s) / 2, (120 - img.height * s) / 2, img.width * s, img.height * s);
  }, [img]);
  return <canvas ref={ref} className="size-full object-cover" />;
}

