'use client';

/**
 * Print dialog with an exact preview of the printed sheet.
 *
 * The preview is produced by the same `renderSheet` that generates the file
 * sent to the browser print dialog, so what you see is what prints.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Minus, Plus, Printer } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { LAYOUTS, PAPERS, paperById, type PrintLayout } from '@/lib/print/papers';
import { loadPrintable, printSheet, renderSheet, sheetToJpeg } from '@/lib/print/sheet';
import { cn } from '@/lib/utils';

export interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Image to print: URL or Blob. */
  source: string | Blob | null;
  title?: string;
  defaultPaper?: string;
  defaultCopies?: number;
  maxCopies?: number;
  /** Called after the print dialog was shown (user may still cancel there). */
  onPrinted?: (info: { copies: number; paper: string }) => void | Promise<void>;
  /** Optional alternative action (e.g. "Kirim ke print station"). */
  secondaryAction?: React.ReactNode;
}

export function PrintDialog({ open, onOpenChange, source, title = 'Cetak foto', defaultPaper = '4x6', defaultCopies = 1, maxCopies = 10, onPrinted, secondaryAction }: PrintDialogProps) {
  const [loaded, setLoaded] = useState<{ src: string | Blob; bmp: ImageBitmap | null; error: string | null } | null>(null);
  const [paper, setPaper] = useState(defaultPaper);
  const [layout, setLayout] = useState<PrintLayout>('auto');
  const [margin, setMargin] = useState(0);
  const [copies, setCopies] = useState(Math.min(defaultCopies, maxCopies));
  const [printing, setPrinting] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Reset choices each time the dialog opens (derived-state pattern).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPaper(defaultPaper);
      setLayout('auto');
      setCopies(Math.max(1, Math.min(defaultCopies, maxCopies)));
    }
  }

  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    loadPrintable(source)
      .then((bmp) => !cancelled && setLoaded({ src: source, bmp, error: null }))
      .catch(() => !cancelled && setLoaded({ src: source, bmp: null, error: 'Gambar gagal dimuat. Periksa koneksi lalu coba lagi.' }));
    return () => {
      cancelled = true;
    };
  }, [open, source]);

  const current = loaded && loaded.src === source ? loaded : null;
  const image = current?.bmp ?? null;
  const loadError = current?.error ?? null;

  const sheet = useMemo(() => {
    if (!image) return null;
    return renderSheet(image, image.width, image.height, paper, layout, margin);
  }, [image, paper, layout, margin]);

  // Draw a downscaled copy of the exact sheet into the preview canvas.
  useEffect(() => {
    const c = previewRef.current;
    if (!c || !sheet) return;
    const s = Math.min(1, 1100 / Math.max(sheet.canvas.width, sheet.canvas.height));
    c.width = Math.round(sheet.canvas.width * s);
    c.height = Math.round(sheet.canvas.height * s);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sheet.canvas, 0, 0, c.width, c.height);
  }, [sheet]);

  const p = paperById(paper);
  const sizeText = sheet ? `${sheet.plan.pageWidthMm.toFixed(0)} × ${sheet.plan.pageHeightMm.toFixed(0)} mm` : '';

  async function handlePrint() {
    if (!sheet) return;
    setPrinting(true);
    try {
      const blob = await sheetToJpeg(sheet.canvas);
      await printSheet(blob, sheet.plan, copies);
      await onPrinted?.({ copies, paper });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={title}
      description="Pratinjau di kiri sama persis dengan hasil cetak."
      bodyClassName="p-0"
      footer={
        <>
          <p className="mr-auto hidden items-center gap-1.5 text-xs text-muted md:flex">
            <Info className="size-3.5" /> Di dialog print browser: Margin <b>None</b>, Skala <b>100%</b>, matikan header &amp; footer.
          </p>
          {secondaryAction}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={handlePrint} loading={printing} disabled={!sheet}>
            <Printer /> Cetak {copies > 1 ? `${copies} lembar` : ''}
          </Button>
        </>
      }
    >
      <div className="grid min-h-0 md:grid-cols-[1fr_300px]">
        <div className="flex min-h-[320px] items-center justify-center bg-[#E9EBF0] p-6 md:h-[min(62vh,620px)]">
          {loadError ? (
            <p className="max-w-xs text-center text-sm text-danger">{loadError}</p>
          ) : !sheet ? (
            <Spinner className="size-7 text-muted" />
          ) : (
            <canvas
              ref={previewRef}
              className="block h-auto max-h-[min(56vh,560px)] w-auto max-w-full bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.06)]"
              style={{ aspectRatio: `${sheet.plan.widthPx} / ${sheet.plan.heightPx}` }}
            />
          )}
        </div>
        <div className="flex flex-col gap-4 border-t border-line p-5 md:border-t-0 md:border-l">
          <Field label="Ukuran kertas" hint={p.hint || undefined}>
            <Select value={paper} onChange={(e) => setPaper(e.target.value)}>
              {PAPERS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tata letak">
            <div className="grid grid-cols-2 gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  title={l.hint}
                  onClick={() => setLayout(l.id)}
                  disabled={p.heightMm === 0 && l.id !== 'auto' && l.id !== 'fit'}
                  className={cn(
                    'h-9 rounded-[9px] border px-2 text-xs font-semibold transition-colors disabled:opacity-35',
                    layout === l.id ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line-strong bg-surface text-ink-2 hover:border-faint',
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Margin">
            <Select value={margin} onChange={(e) => setMargin(Number(e.target.value))}>
              <option value={0}>Tanpa margin (borderless)</option>
              <option value={3}>Kecil · 3 mm</option>
              <option value={6}>Normal · 6 mm</option>
            </Select>
          </Field>
          <Field label="Jumlah salinan" hint={maxCopies < 10 ? `Maksimal ${maxCopies} lembar` : undefined}>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="secondary" onClick={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies <= 1} aria-label="Kurangi">
                <Minus />
              </Button>
              <span className="w-10 text-center text-lg font-bold tabular-nums">{copies}</span>
              <Button size="icon" variant="secondary" onClick={() => setCopies((c) => Math.min(maxCopies, c + 1))} disabled={copies >= maxCopies} aria-label="Tambah">
                <Plus />
              </Button>
            </div>
          </Field>
          <div className="mt-auto rounded-[10px] bg-canvas px-3 py-2.5 text-xs leading-relaxed text-muted">
            Halaman: <b className="text-ink-2">{sizeText}</b> · 300 DPI.
            <br />
            Pilih ukuran kertas yang sama di dialog print (mis. 4×6 / 10×15 cm).
          </div>
        </div>
      </div>
    </Dialog>
  );
}
