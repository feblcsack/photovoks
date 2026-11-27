'use client';

/**
 * SIM studio — "Surat Izin Mejeng" photo zine. Guest page (phone) and booth
 * (kiosk). Renders locally; download PDF/JPG or print one A4 sheet, fold it
 * in half and zig-zag → a pocket license.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Printer, Scissors, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { WordArt } from '@/components/brand/WordArt';
import { PixelIcon, WinPanel, WinWindow } from '@/components/os/retro';
import { canvasToBlob, loadBitmap } from '@/lib/frames/render';
import { printSheet } from '@/lib/print/sheet';
import { jpegToPdf } from '@/lib/zine/pdf';
import { ensureSimFonts, renderSimPanel, renderSimSheet, SIM_BACK, SIM_FRONT, SIM_GOLONGAN, SIM_PAPERS, simNumber, simPaper, type SimData, type SimGolongan } from '@/lib/sim/layout';
import { cn } from '@/lib/utils';

export interface SimPhoto {
  key: string;
  src: string | HTMLCanvasElement;
}

type Img = CanvasImageSource & { width: number; height: number };

export interface BuiltSim {
  canvas: HTMLCanvasElement;
  blob: Blob;
  paperId: string;
}

export function SimStudio({
  photos,
  eventName,
  seed,
  qrValue,
  onClose,
  kiosk = false,
  defaultPaper = 'a4',
  extraActions,
}: {
  photos: SimPhoto[];
  eventName: string;
  /** Stable seed (session id) → SIM number. */
  seed: string;
  qrValue: string;
  onClose: () => void;
  kiosk?: boolean;
  defaultPaper?: string;
  extraActions?: (build: () => Promise<BuiltSim>) => React.ReactNode;
}) {
  const toast = useToast();
  const [imgs, setImgs] = useState<Map<string, Img>>(new Map());
  const [picked, setPicked] = useState<string[]>(() => photos.slice(0, 3).map((p) => p.key));
  const [name, setName] = useState('');
  const [golongan, setGolongan] = useState<SimGolongan>('C');
  const [look, setLook] = useState<SimData['look']>('xerox');
  const [paperId, setPaperId] = useState(defaultPaper);
  const [side, setSide] = useState<'front' | 'back' | 'sheet'>('front');
  const [fonts, setFonts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [panels, setPanels] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void ensureSimFonts().then(() => alive && setFonts(true));
    void Promise.all(
      photos.map(async (p) => [p.key, typeof p.src === 'string' ? await loadBitmap(p.src) : p.src] as const),
    ).then((list) => {
      if (!alive) return;
      const m = new Map<string, Img>();
      for (const [k, v] of list) if (v) m.set(k, v);
      setImgs(m);
    });
    return () => {
      alive = false;
    };
  }, [photos]);

  const data: SimData = useMemo(
    () => ({
      name: name.trim() || 'Anak Kalcer',
      golongan,
      eventName,
      date: new Date(),
      number: simNumber(seed),
      qrValue,
      photos: picked.map((k) => imgs.get(k)).filter((x): x is Img => !!x),
      look,
    }),
    [name, golongan, eventName, seed, qrValue, picked, imgs, look],
  );

  // Panel previews (debounced while typing).
  useEffect(() => {
    if (!fonts) return;
    const t = setTimeout(() => {
      const out: Record<string, string> = {};
      for (const id of [...SIM_FRONT, ...SIM_BACK]) out[id] = renderSimPanel(id, data, 300).toDataURL('image/jpeg', 0.85);
      setPanels(out);
    }, 160);
    return () => clearTimeout(t);
  }, [data, fonts]);

  const build = async (): Promise<BuiltSim> => {
    await ensureSimFonts();
    await new Promise((r) => setTimeout(r, 30));
    const canvas = renderSimSheet(data, simPaper(paperId), true);
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
      const p = simPaper(paperId);
      if (kind === 'jpg') download(blob, 'SIM-surat-izin-mejeng.jpg');
      else if (kind === 'pdf') download(await jpegToPdf(blob, p.widthMm, p.heightMm, 'SIM — Surat Izin Mejeng'), 'SIM-surat-izin-mejeng.pdf');
      else await printSheet(blob, { pageWidthMm: p.widthMm, pageHeightMm: p.heightMm, widthPx: canvas.width, heightPx: canvas.height, placements: [], layout: 'fit' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal membuat SIM', 'error');
    } finally {
      setBusy(null);
    }
  }

  function togglePhoto(key: string) {
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key].slice(-3)));
  }

  const strip = side === 'back' ? SIM_BACK : SIM_FRONT;

  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#E9E6DE] text-ink', kiosk && 'kiosk')}>
      <header className="flex items-center justify-between gap-3 border-b-2 border-ink bg-surface px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <WordArt variant="outline" className="text-[30px]">SIM</WordArt>
          <div className="min-w-0">
            <p className="font-display text-lg leading-none">Surat Izin Mejeng</p>
            <p className="truncate font-type text-[11px] text-muted">Photozine lipat · 1 lembar · cetak 1 sisi</p>
          </div>
        </div>
        <Button variant="secondary" size={kiosk ? 'lg' : 'icon'} onClick={onClose} aria-label="Tutup"><X />{kiosk ? 'Tutup' : null}</Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto grid max-w-6xl gap-5 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Preview */}
          <div className="flex min-w-0 flex-col gap-3">
            <Segmented<typeof side>
              className="self-center"
              value={side}
              onChange={setSide}
              options={[{ value: 'front', label: 'Depan' }, { value: 'back', label: 'Belakang' }, { value: 'sheet', label: 'Cara lipat' }]}
            />
            {side === 'sheet' ? (
              <WinPanel className="flex flex-col gap-3 p-4 text-sm">
                {[
                  ['1', 'Cetak 1 sisi, lanskap, skala 100% (A4).'],
                  ['2', 'Lipat dua memanjang: setengah atas (yang terbalik) dilipat ke BELAKANG. Sekarang depan & belakang jadi satu strip.'],
                  ['3', 'Lipat zig-zag seperti akordeon di 3 garis tegak. Sampul “SIM” ada di paling depan.'],
                  ['4', 'Selesai! Masukkan dompet, tunjukkan kalau ditanya “izin mejeng-nya mana?”'],
                ].map(([n, t]) => (
                  <p key={n} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-techno text-xs font-bold text-white">{n}</span><span className="pt-1">{t}</span></p>
                ))}
                <p className="flex items-center gap-2 text-xs text-muted"><Scissors className="size-4" /> Tanpa gunting & lem.</p>
              </WinPanel>
            ) : (
              <div className="flex min-h-[340px] items-center justify-center py-6 [perspective:1400px]">
                {!fonts || !panels[strip[0]] ? (
                  <Spinner className="size-7" />
                ) : (
                  <div className="flex">
                    {strip.map((id, i) => (
                      // Accordion mock-up: alternate panel angles like a folded card.
                      <div key={id} className="relative w-[clamp(84px,19vw,190px)] origin-center border-2 border-ink bg-white shadow-[4px_6px_0_rgba(0,0,0,0.25)]" style={{ transform: `rotateY(${i % 2 ? -16 : 16}deg)`, marginLeft: i ? -4 : 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={panels[id]} alt={`Panel ${id}`} className="block w-full" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <WinWindow title="Formulir_SIM.txt" icon="book" bodyClassName="flex flex-col gap-3 p-3">
              <label className="flex flex-col gap-1">
                <span className="font-pixel text-[13px]">Nama pemegang</span>
                <Input value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder="Anak Kalcer" />
              </label>
              <div>
                <p className="mb-1 font-pixel text-[13px]">Golongan</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SIM_GOLONGAN.map((g) => (
                    <button key={g.id} type="button" onClick={() => setGolongan(g.id)} className={cn('flex flex-col items-start px-2 py-1.5 text-left', golongan === g.id ? 'bevel-in bg-win-light' : 'bevel-out bg-win active:bevel-in')}>
                      <span className="font-techno text-[13px] font-bold">SIM {g.id}</span>
                      <span className="text-[12px] leading-tight font-semibold">{g.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-ink-2">{SIM_GOLONGAN.find((g) => g.id === golongan)?.note}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-pixel text-[13px]">Tampilan</span>
                <Segmented<SimData['look']> size="sm" value={look} onChange={setLook} options={[{ value: 'xerox', label: 'Xerox B&W' }, { value: 'warna', label: 'Warna' }]} />
              </div>
              <div>
                <p className="mb-1 font-pixel text-[13px]">Foto ({picked.length}/3)</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {photos.map((p) => {
                    const order = picked.indexOf(p.key);
                    const im = imgs.get(p.key);
                    return (
                      <button key={p.key} type="button" onClick={() => togglePhoto(p.key)} className={cn('relative aspect-[3/4] overflow-hidden border-2 bg-ink/10', order >= 0 ? 'border-cobalt' : 'border-transparent opacity-60')}>
                        {im ? <Thumb img={im} /> : null}
                        {order >= 0 ? <span className="absolute top-0.5 left-0.5 flex size-5 items-center justify-center bg-sun font-pixel text-[11px] font-bold">{order + 1}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </WinWindow>

            <WinWindow title="Cetak.exe" icon="printer" bodyClassName="flex flex-col gap-2 p-3">
              <Segmented size="sm" className="self-start" value={paperId} onChange={setPaperId} options={SIM_PAPERS.map((p) => ({ value: p.id, label: p.label }))} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="win-go" size="lg" onClick={() => void run('pdf')} loading={busy === 'pdf'} disabled={!!busy}><FileText /> PDF</Button>
                <Button variant="win" size="lg" onClick={() => void run('jpg')} loading={busy === 'jpg'} disabled={!!busy}><Download /> JPG</Button>
              </div>
              <Button variant="win" size="lg" onClick={() => void run('print')} loading={busy === 'print'} disabled={!!busy}><Printer /> Cetak dari perangkat ini</Button>
              {extraActions ? extraActions(build) : null}
              <p className="flex items-start gap-1.5 text-[11px] text-ink-2"><PixelIcon name="info" className="size-4 shrink-0" /> Parodi photozine — bukan dokumen resmi ya.</p>
            </WinWindow>
          </div>
        </div>
      </div>
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
