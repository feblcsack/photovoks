'use client';

/**
 * Minizine studio — turns photos into an 8-page, one-sheet mini zine.
 * Used on the guest page (phone: session photos + new photos from camera /
 * gallery) and in the booth (fresh captures, print on the spot).
 *
 * Everything renders locally on canvas; nothing is uploaded unless the host
 * (booth) explicitly saves the result.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Camera, ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Printer, RotateCcw, Scissors, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { Logo, Sticker } from '@/components/brand/scrap';
import { canvasToBlob, createCanvas, loadBitmap, type Drawable } from '@/lib/frames/render';
import { ensureFonts, FONTS } from '@/lib/frames/fonts';
import { FILTERS } from '@/lib/booth/media';
import { printSheet } from '@/lib/print/sheet';
import { STICKER_CATEGORIES, Y2K_STICKERS, y2kStickerUrl } from '@/lib/y2k-stickers';
import { WORDART_STYLES } from '@/lib/wordart';
import { WordArt } from '@/components/brand/WordArt';
import type { LibrarySticker } from '@/lib/session-types';
import {
  autoFill,
  blankPage,
  CAPTION_COLORS,
  CAPTION_FONTS,
  FRAMES,
  LAYOUTS,
  PATTERNS,
  slotCount,
  ZINE_THEMES,
  PAGE_BGS,
  PAGE_NAMES,
  PAGE_SHORT,
  pageAspect,
  pageSizeMm,
  renderPage,
  renderSheet,
  ZINE_PAPERS,
  zinePaper,
  type ZineImages,
  type ZinePage,
  type ZinePaper,
  type StickerImages,
} from '@/lib/zine/layout';
import { jpegToPdf } from '@/lib/zine/pdf';
import { cn } from '@/lib/utils';
import { FoldGuide } from './FoldGuide';

export interface ZinePhoto {
  key: string;
  src: string | Blob | HTMLCanvasElement;
  label?: string;
}

export interface BuiltSheet {
  canvas: HTMLCanvasElement;
  blob: Blob;
  paper: ZinePaper;
}

type Tab = 'edit' | 'preview' | 'fold' | 'export';
const uid = () => Math.random().toString(36).slice(2, 9);
const MAX_UPLOAD_SIDE = 2000;

// Sticker bitmaps are shared across studio instances.
let stickerPromise: Promise<StickerImages> | null = null;
function loadStickers(): Promise<StickerImages> {
  if (!stickerPromise) {
    stickerPromise = Promise.all(
      Y2K_STICKERS.map(
        (s) =>
          new Promise<[string, Drawable] | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve([s.id, img]);
            img.onerror = () => resolve(null);
            img.src = y2kStickerUrl(s.id);
          }),
      ),
    ).then((list) => new Map(list.filter((x): x is [string, Drawable] => !!x)));
  }
  return stickerPromise;
}

async function toDrawable(src: ZinePhoto['src']): Promise<Drawable | null> {
  if (typeof src === 'string') return loadBitmap(src);
  if (src instanceof Blob) {
    try {
      const bmp = await createImageBitmap(src);
      const s = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bmp.width, bmp.height));
      if (s >= 1) return bmp;
      const c = createCanvas(bmp.width * s, bmp.height * s);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      return c;
    } catch {
      return null;
    }
  }
  return src;
}

export function ZineStudio({
  photos,
  title,
  subtitle,
  onClose,
  allowUpload = true,
  onMorePhotos,
  defaultPaper = 'a4',
  papers,
  extraActions,
  kiosk = false,
  pages: controlledPages,
  onPagesChange,
  initialTab = 'edit',
  libraryStickers = [],
}: {
  photos: ZinePhoto[];
  title: string;
  subtitle: string;
  onClose: () => void;
  allowUpload?: boolean;
  /** Booth: go back to the camera for more photos. */
  onMorePhotos?: () => void;
  defaultPaper?: string;
  /** Limit paper choices (booth). */
  papers?: string[];
  /** Extra buttons on the export tab (booth: print + save session). */
  extraActions?: (build: (paperId: string, guides: boolean) => Promise<BuiltSheet>, paperId: string, guides: boolean) => React.ReactNode;
  kiosk?: boolean;
  /** Optional controlled pages (booth keeps them across extra captures). */
  pages?: ZinePage[];
  onPagesChange?: (p: ZinePage[]) => void;
  initialTab?: Tab;
  /** Admin sticker library (all events). */
  libraryStickers?: LibrarySticker[];
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [images, setImages] = useState<ZineImages>(new Map());
  const [stickers, setStickers] = useState<StickerImages>(new Map());
  const [uploads, setUploads] = useState<ZinePhoto[]>([]);
  const allPhotos = useMemo(() => [...photos, ...uploads], [photos, uploads]);
  // First open: the photos are already dropped onto the pages.
  const [localPages, setLocalPages] = useState<ZinePage[]>(() => autoFill(Array.from({ length: 8 }, (_, i) => blankPage(i, title, subtitle)), photos.map((x) => x.key)));
  const pages = controlledPages ?? localPages;
  const setPages = useCallback(
    (next: ZinePage[] | ((p: ZinePage[]) => ZinePage[])) => {
      const value = typeof next === 'function' ? (next as (p: ZinePage[]) => ZinePage[])(pages) : next;
      if (onPagesChange) onPagesChange(value);
      else setLocalPages(value);
    },
    [pages, onPagesChange],
  );
  const [sel, setSel] = useState(0);
  const [slot, setSlot] = useState(0);
  const [stickerTab, setStickerTab] = useState<string>('lucu');
  const [theme, setTheme] = useState<string | null>(null);
  const [selSticker, setSelSticker] = useState<string | null>(null);
  const [paperId, setPaperId] = useState(papers?.includes(defaultPaper) || !papers ? defaultPaper : papers[0]);
  const [guides, setGuides] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const paper = zinePaper(paperId);
  const aspect = pageAspect(paper);
  const page = pages[sel];

  // ── Loading ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    void loadStickers().then(async (m) => {
      // Library stickers (admin uploads) are added under `lib:<id>`.
      const extra = await Promise.all(libraryStickers.map(async (ls) => [`lib:${ls.id}`, await loadBitmap(ls.url)] as const));
      if (!alive) return;
      const merged = new Map(m);
      extra.forEach(([k, d]) => d && merged.set(k, d));
      setStickers(merged);
    });
    void ensureFonts(CAPTION_FONTS.map((f) => ({ font: f, weight: 700 }))).then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [libraryStickers]);

  useEffect(() => {
    let alive = true;
    const missing = allPhotos.filter((p) => !images.has(p.key));
    if (!missing.length) return;
    void Promise.all(missing.map(async (p) => [p.key, await toDrawable(p.src)] as const)).then((loaded) => {
      if (!alive) return;
      setImages((prev) => {
        const next = new Map(prev);
        loaded.forEach(([k, d]) => d && next.set(k, d));
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [allPhotos, images]);

  const patch = (p: Partial<ZinePage>, index = sel) => setPages((list) => list.map((x, i) => (i === index ? { ...x, ...p } : x)));

  // ── Uploads (phone camera / gallery) ─────────────────────────────────────
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 12).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return toast('Pilih file gambar', 'error');
    const added = list.map((f) => ({ key: `up-${uid()}`, src: f as Blob, label: 'Baru' }));
    setUploads((u) => [...u, ...added]);
    // Put the first new photo on the selected page.
    if (page.layout !== 'text') assign(added[0].key);
    toast(`${added.length} foto ditambahkan`);
  }

  function assign(key: string) {
    const imgs = [...page.images, null, null, null, null].slice(0, 4);
    const n = slotCount(page.layout);
    const s = n > 1 ? Math.min(slot, n - 1) : 0;
    imgs[s] = key;
    if (n > 1) setSlot((s + 1) % n); // next tap fills the next frame
    patch({ images: imgs, zoom: 1, panX: 0, panY: 0, layout: page.layout === 'text' ? 'full' : page.layout });
  }

  function movePage(dir: -1 | 1) {
    const j = sel + dir;
    if (j < 0 || j > 7) return;
    setPages((list) => {
      const next = [...list];
      [next[sel], next[j]] = [next[j], next[sel]];
      return next;
    });
    setSel(j);
  }

  function addSticker(id: string) {
    const key = uid();
    const n = page.stickers.length;
    patch({ stickers: [...page.stickers, { key, id, x: 0.5 + ((n % 3) - 1) * 0.18, y: 0.4 + (n % 2) * 0.2, s: 0.32, r: (n % 2 ? 1 : -1) * 10 }] });
    setSelSticker(key);
  }
  const sticker = page.stickers.find((s) => s.key === selSticker) ?? null;
  const patchSticker = (p: Partial<ZinePage['stickers'][number]>) => patch({ stickers: page.stickers.map((s) => (s.key === selSticker ? { ...s, ...p } : s)) });

  // ── Sheet export ─────────────────────────────────────────────────────────
  const build = useCallback(
    async (pid: string, withGuides: boolean): Promise<BuiltSheet> => {
      const p = zinePaper(pid);
      await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
      const canvas = renderSheet(pages, { paper: p, images, stickers, quality: 2400, guides: withGuides });
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      return { canvas, blob, paper: p };
    },
    [pages, images, stickers],
  );

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function run(kind: 'pdf' | 'jpg' | 'print') {
    setBusy(kind);
    try {
      const { blob, paper: p, canvas } = await build(paperId, guides);
      if (kind === 'jpg') download(blob, `photovoks-zine-${p.id}.jpg`);
      else if (kind === 'pdf') download(await jpegToPdf(blob, p.widthMm, p.heightMm, title), `photovoks-zine-${p.id}.pdf`);
      else await printSheet(blob, { pageWidthMm: p.widthMm, pageHeightMm: p.heightMm, widthPx: canvas.width, heightPx: canvas.height, placements: [], layout: 'fit' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal membuat zine', 'error');
    } finally {
      setBusy(null);
    }
  }

  const emptyPages = pages.filter((p, i) => i !== 7 && p.layout !== 'text' && !p.images.some(Boolean)).length;

  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col bg-canvas', kiosk && 'kiosk')}>
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b-2 border-ink bg-surface px-3 pt-[max(10px,env(safe-area-inset-top))] pb-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size="sm" className="w-11 shrink-0" alt="" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-none sm:text-xl">Minizine studio</p>
            <p className="truncate font-type text-[11px] text-muted">8 halaman · 1 lembar · 1 guntingan</p>
          </div>
        </div>
        <Button variant="secondary" size={kiosk ? 'lg' : 'icon'} onClick={onClose} aria-label="Tutup">
          <X />
          {kiosk ? 'Tutup' : null}
        </Button>
      </header>
      <div className="flex justify-center border-b border-line bg-surface/70 px-3 py-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'edit', label: <><Wand2 className="size-3.5" /> Edit</> },
            { value: 'preview', label: <><BookOpen className="size-3.5" /> Preview</> },
            { value: 'fold', label: <><Scissors className="size-3.5" /> Cara lipat</> },
            { value: 'export', label: <><Download className="size-3.5" /> Simpan</> },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === 'edit' ? (
          <div className="mx-auto grid max-w-5xl gap-4 p-3 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
            <div className="flex flex-col gap-3">
              <PageRail pages={pages} sel={sel} onSelect={(i) => { setSel(i); setSelSticker(null); setSlot(0); }} images={images} stickers={stickers} aspect={aspect} fontsReady={fontsReady} />
              <div className="flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" disabled={sel === 0} onClick={() => movePage(-1)}><ChevronLeft /> Geser</Button>
                <p className="font-display text-lg">{PAGE_NAMES[sel]}</p>
                <Button size="sm" variant="ghost" disabled={sel === 7} onClick={() => movePage(1)}>Geser <ChevronRight /></Button>
              </div>
              <PageCanvas
                page={page}
                aspect={aspect}
                images={images}
                stickers={stickers}
                fontsReady={fontsReady}
                selSticker={selSticker}
                onSelectSticker={setSelSticker}
                onChange={(p) => patch(p)}
              />
              <p className="text-center text-xs text-muted">Geser foto untuk mengatur posisi · ketuk stiker untuk memilih, seret untuk memindah</p>
            </div>

            <div className="flex flex-col gap-3">
              <Card title="Tema (semua halaman)">
                <div className="grid grid-cols-3 gap-2">
                  {ZINE_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        setPages((list) => list.map((p, i) => t.apply(p, i)));
                      }}
                      className={cn('flex flex-col items-center gap-1 rounded-[12px] border-2 p-2 text-[11px] font-bold transition', theme === t.id ? 'border-ink shadow-[2px_2px_0_var(--color-ink)]' : 'border-ink/20 hover:border-ink/50')}
                    >
                      <span className="flex h-6 w-full overflow-hidden rounded-[6px] border border-ink/30">
                        <span className="flex-1" style={{ background: t.swatch[0] }} />
                        <span className="flex-1" style={{ background: t.swatch[1] }} />
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Card>
              <Card title="Foto">
                <div className="grid grid-cols-4 gap-2">
                  {allPhotos.map((p) => {
                    const used = page.images.includes(p.key);
                    return (
                      <button key={p.key} type="button" onClick={() => assign(p.key)} className={cn('relative aspect-square overflow-hidden rounded-[10px] border-2 bg-ink/5', used ? 'border-brand shadow-[2px_2px_0_var(--color-ink)]' : 'border-ink/20')}>
                        <PhotoThumb img={images.get(p.key)} />
                        {p.label ? <span className="absolute bottom-0.5 left-0.5 rounded-full bg-cobalt px-1.5 text-[9px] font-bold text-white">{p.label}</span> : null}
                      </button>
                    );
                  })}
                  {allowUpload ? (
                    <>
                      <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-ink/40 text-[10px] font-bold text-ink-2 hover:bg-ink/5">
                        <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
                        <Camera className="size-5" /> Kamera
                      </label>
                      <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-ink/40 text-[10px] font-bold text-ink-2 hover:bg-ink/5">
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
                        <ImagePlus className="size-5" /> Galeri
                      </label>
                    </>
                  ) : null}
                  {onMorePhotos ? (
                    <button type="button" onClick={onMorePhotos} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-ink/40 text-[10px] font-bold text-ink-2 hover:bg-ink/5">
                      <Camera className="size-5" /> Foto lagi
                    </button>
                  ) : null}
                </div>
                {slotCount(page.layout) > 1 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted">Isi bingkai:</span>
                    {Array.from({ length: slotCount(page.layout) }, (_, i) => (
                      <Chip key={i} on={slot === i} onClick={() => setSlot(i)}>#{i + 1}</Chip>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setPages((p) => autoFill(p, allPhotos.map((x) => x.key)))} disabled={!allPhotos.length}><Sparkles /> Isi otomatis</Button>
                  {page.images.some(Boolean) ? <Button size="sm" variant="ghost" onClick={() => patch({ images: [null, null, null, null] })}><Trash2 /> Kosongkan</Button> : null}
                </div>
              </Card>

              <Card title="Tata letak">
                <div className="flex flex-wrap gap-1.5">
                  {LAYOUTS.map((l) => <Chip key={l.id} on={page.layout === l.id} onClick={() => patch({ layout: l.id })}>{l.label}</Chip>)}
                </div>
                {page.layout !== 'text' ? (
                  <>
                    {page.layout !== 'full' && page.layout !== 'polaroid' && page.layout !== 'film' ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Bingkai foto</p>
                        <div className="flex flex-wrap gap-1.5">
                          {FRAMES.map((f) => <Chip key={f.id} on={(page.frame ?? 'none') === f.id} onClick={() => patch({ frame: f.id })}>{f.label}</Chip>)}
                        </div>
                      </div>
                    ) : null}
                    <Range label="Zoom" value={page.zoom} min={1} max={3} step={0.05} onChange={(v) => patch({ zoom: v })} />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted">Posisi: seret foto di kanvas</span>
                      <Button size="xs" variant="ghost" onClick={() => patch({ zoom: 1, panX: 0, panY: 0 })}><RotateCcw /> Reset</Button>
                    </div>
                    <p className="mt-3 mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Filter</p>
                    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                      {FILTERS.map((f) => <Chip key={f.id} on={page.filter === f.id} onClick={() => patch({ filter: f.id })}>{f.label}</Chip>)}
                    </div>
                    <Button size="xs" variant="ghost" className="mt-1" onClick={() => setPages((list) => list.map((p) => ({ ...p, filter: page.filter })))}>Terapkan filter ke semua halaman</Button>
                  </>
                ) : null}
              </Card>

              <Card title="Teks">
                <textarea value={page.caption} onChange={(e) => patch({ caption: e.target.value.slice(0, 120) })} rows={2} placeholder="Tulis caption…" className="w-full resize-none rounded-[12px] border-2 border-ink/80 bg-white px-3 py-2 font-type text-sm outline-none focus:border-cobalt" />
                <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {CAPTION_FONTS.map((f) => (
                    <Chip key={f} on={page.captionFont === f} onClick={() => patch({ captionFont: f })}>
                      <span style={{ fontFamily: FONTS[f].family }}>Aa</span>
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">WordArt</p>
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                  <Chip on={!page.captionArt} onClick={() => patch({ captionArt: null })}>Biasa</Chip>
                  {WORDART_STYLES.map((w) => (
                    <button key={w.id} type="button" onClick={() => patch({ captionArt: w.id })} title={w.label} className={cn('flex h-8 shrink-0 items-center rounded-full border-2 px-2 text-[17px]', page.captionArt === w.id ? 'border-ink bg-sun/40' : 'border-ink/20 bg-white')}>
                      <WordArt variant={w.id}>Aa</WordArt>
                    </button>
                  ))}
                </div>
                <Range label="Ukuran" value={page.captionSize ?? 1} min={0.6} max={1.8} step={0.05} onChange={(v) => patch({ captionSize: v })} />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Swatches colors={CAPTION_COLORS} value={page.captionColor} onChange={(c) => patch({ captionColor: c })} />
                  {page.layout !== 'text' ? (
                    <Segmented<ZinePage['captionPos']> size="sm" value={page.captionPos} onChange={(v) => patch({ captionPos: v })} options={[{ value: 'top', label: 'Atas' }, { value: 'center', label: 'Tengah' }, { value: 'bottom', label: 'Bawah' }]} />
                  ) : null}
                </div>
              </Card>

              <Card title="Latar halaman">
                <Swatches colors={PAGE_BGS} value={page.bg} onChange={(c) => patch({ bg: c })} />
                <p className="mt-3 mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Motif</p>
                <div className="flex flex-wrap gap-1.5">
                  {PATTERNS.map((pt) => <Chip key={pt.id} on={(page.pattern ?? 'none') === pt.id} onClick={() => patch({ pattern: pt.id, bg2: page.bg2 ?? (page.bg === '#1A1410' ? '#FFD43B' : '#FF9BD2') })}>{pt.label}</Chip>)}
                </div>
                {(page.pattern ?? 'none') !== 'none' ? (
                  <div className="mt-2">
                    <p className="mb-1.5 text-xs text-muted">Warna motif</p>
                    <Swatches colors={PAGE_BGS} value={page.bg2 ?? '#FF9BD2'} onChange={(c) => patch({ bg2: c })} />
                  </div>
                ) : null}
                <Button size="xs" variant="ghost" className="mt-2" onClick={() => setPages((list) => list.map((p) => ({ ...p, bg: page.bg, bg2: page.bg2, pattern: page.pattern })))}>Terapkan latar ke semua halaman</Button>
              </Card>

              <Card title="Stiker">
                <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
                  {[...STICKER_CATEGORIES, ...(libraryStickers.length ? [{ id: 'library', label: 'Spesial' }] : [])].map((c) => (
                    <Chip key={c.id} on={stickerTab === c.id} onClick={() => setStickerTab(c.id)}>{c.label}</Chip>
                  ))}
                </div>
                <div className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto">
                  {stickerTab === 'library'
                    ? libraryStickers.map((ls) => (
                        <button key={ls.id} type="button" title={ls.name} onClick={() => addSticker(`lib:${ls.id}`)} className="flex aspect-square items-center justify-center rounded-[10px] p-0.5 hover:bg-ink/5 active:scale-95">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ls.url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                        </button>
                      ))
                    : Y2K_STICKERS.filter((s) => s.category === stickerTab).map((s) => (
                        <button key={s.id} type="button" title={s.label} onClick={() => addSticker(s.id)} className="flex aspect-square items-center justify-center rounded-[10px] hover:bg-ink/5 active:scale-95">
                          <Sticker id={s.id} className="size-full" />
                        </button>
                      ))}
                </div>
                {sticker ? (
                  <div className="mt-3 rounded-[12px] bg-ink/[0.04] p-3">
                    <Range label="Ukuran" value={sticker.s} min={0.1} max={0.8} step={0.01} onChange={(v) => patchSticker({ s: v })} />
                    <Range label="Putar" value={sticker.r} min={-180} max={180} step={1} onChange={(v) => patchSticker({ r: v })} />
                    <Button size="xs" variant="danger-ghost" className="mt-1" onClick={() => { patch({ stickers: page.stickers.filter((s) => s.key !== selSticker) }); setSelSticker(null); }}><Trash2 /> Hapus stiker</Button>
                  </div>
                ) : null}
              </Card>

              <Button variant="primary" size="lg" onClick={() => setTab('preview')}>Lihat preview <ArrowRight /></Button>
            </div>
          </div>
        ) : null}

        {tab === 'preview' ? (
          <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
            {emptyPages ? <p className="rounded-full border-2 border-dashed border-warn/50 bg-warn-soft px-4 py-2 text-center text-sm text-warn">{emptyPages} halaman belum ada fotonya — tidak apa-apa, akan tampil sebagai latar polos.</p> : null}
            <Booklet pages={pages} images={images} stickers={stickers} aspect={aspect} fontsReady={fontsReady} />
            <SheetPreview pages={pages} images={images} stickers={stickers} paper={paper} guides={guides} fontsReady={fontsReady} />
            <Button variant="primary" size="lg" className="self-center" onClick={() => setTab('export')}>Siap dicetak <ArrowRight /></Button>
          </div>
        ) : null}

        {tab === 'fold' ? (
          <div className="mx-auto max-w-xl p-4 sm:p-6">
            <FoldGuide />
          </div>
        ) : null}

        {tab === 'export' ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
            <Card title="Ukuran kertas">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ZINE_PAPERS.filter((p) => !papers || papers.includes(p.id)).map((p) => {
                  const s = pageSizeMm(p);
                  return (
                    <button key={p.id} type="button" onClick={() => setPaperId(p.id)} className={cn('rounded-[14px] border-2 p-3 text-left transition', paperId === p.id ? 'border-ink bg-sun shadow-[3px_3px_0_var(--color-ink)]' : 'border-ink/20 bg-surface hover:border-ink/50')}>
                      <span className="block font-display text-lg leading-none">{p.label}</span>
                      <span className="mt-1 block font-type text-[11px] text-ink-2">lembar {Math.round(p.widthMm)}×{Math.round(p.heightMm)}mm</span>
                      <span className="block font-type text-[11px] text-ink-2">halaman {s.w.toFixed(0)}×{s.h.toFixed(0)}mm</span>
                      <span className="mt-1 block text-[10px] leading-snug text-muted">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                Tampilkan tanda lipat &amp; garis gunting merah
              </label>
            </Card>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="primary" size="lg" onClick={() => void run('pdf')} loading={busy === 'pdf'} disabled={!!busy}><FileText /> Unduh PDF</Button>
              <Button variant="secondary" size="lg" onClick={() => void run('jpg')} loading={busy === 'jpg'} disabled={!!busy}><Download /> Unduh JPG</Button>
              <Button variant="sun" size="lg" onClick={() => void run('print')} loading={busy === 'print'} disabled={!!busy}><Printer /> Cetak</Button>
            </div>
            {extraActions ? <div className="flex flex-col gap-2">{extraActions(build, paperId, guides)}</div> : null}
            <p className="text-center font-type text-xs text-muted">Cetak satu sisi, lanskap, skala 100%. Lalu ikuti tab <button type="button" className="font-bold underline" onClick={() => setTab('fold')}>Cara lipat</button>.</p>
            {busy ? <p className="flex items-center justify-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Menyusun lembar 300 DPI…</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border-2 border-ink bg-surface p-3.5 shadow-[3px_3px_0_var(--color-ink)]">
      <p className="mb-2.5 font-type text-xs font-bold tracking-[0.14em] uppercase">{title}</p>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-8 shrink-0 rounded-full border-2 px-3 text-xs font-bold whitespace-nowrap transition', on ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-white text-ink-2 hover:border-ink/60')}>
      {children}
    </button>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className={cn('size-7 rounded-full border-2 transition', value === c ? 'scale-110 border-ink ring-2 ring-cobalt ring-offset-1' : 'border-ink/30')} style={{ background: c }} />
      ))}
    </div>
  );
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="mt-2 flex items-center gap-3 text-xs font-semibold text-ink-2">
      <span className="w-14 shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" />
    </label>
  );
}

function PhotoThumb({ img }: { img: Drawable | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    const iw = (img as HTMLImageElement).naturalWidth || (img as ImageBitmap).width;
    const ih = (img as HTMLImageElement).naturalHeight || (img as ImageBitmap).height;
    c.width = 120;
    c.height = 120;
    const s = Math.max(120 / iw, 120 / ih);
    c.getContext('2d')!.drawImage(img as CanvasImageSource, (120 - iw * s) / 2, (120 - ih * s) / 2, iw * s, ih * s);
  }, [img]);
  return img ? <canvas ref={ref} className="size-full" /> : <span className="flex size-full items-center justify-center"><Spinner className="size-4" /></span>;
}

/** Renders a page into a canvas element sized by CSS width. */
function usePageRender(ref: React.RefObject<HTMLCanvasElement | null>, page: ZinePage, aspect: number, width: number, images: ZineImages, stickers: StickerImages, quality: number, fontsReady: number, hints = true) {
  useEffect(() => {
    const c = ref.current;
    if (!c || !width) return;
    const raf = requestAnimationFrame(() => {
      c.width = Math.round(width);
      c.height = Math.round(width / aspect);
      renderPage(c.getContext('2d')!, page, c.width, c.height, { images, stickers, quality, hints });
    });
    return () => cancelAnimationFrame(raf);
  }, [ref, page, aspect, width, images, stickers, quality, fontsReady, hints]);
}

function MiniPage({ page, aspect, images, stickers, fontsReady, width = 90, className }: { page: ZinePage; aspect: number; images: ZineImages; stickers: StickerImages; fontsReady: number; width?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  usePageRender(ref, page, aspect, width * 2, images, stickers, 360, fontsReady);
  return <canvas ref={ref} className={cn('block w-full', className)} style={{ aspectRatio: String(aspect) }} />;
}

function PageRail({ pages, sel, onSelect, images, stickers, aspect, fontsReady }: { pages: ZinePage[]; sel: number; onSelect: (i: number) => void; images: ZineImages; stickers: StickerImages; aspect: number; fontsReady: number }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pt-1 pb-2">
      {pages.map((p, i) => (
        <button key={i} type="button" onClick={() => onSelect(i)} className={cn('w-[62px] shrink-0 text-center transition', sel === i ? '-translate-y-0.5' : 'opacity-80')}>
          <span className={cn('block overflow-hidden rounded-[6px] border-2', sel === i ? 'border-brand shadow-[2px_2px_0_var(--color-ink)]' : 'border-ink/25')}>
            <MiniPage page={p} aspect={aspect} images={images} stickers={stickers} fontsReady={fontsReady} width={62} />
          </span>
          <span className={cn('mt-1 block font-type text-[10px]', sel === i ? 'font-bold text-brand' : 'text-muted')}>{PAGE_SHORT[i]}</span>
        </button>
      ))}
    </div>
  );
}

function PageCanvas({ page, aspect, images, stickers, fontsReady, selSticker, onSelectSticker, onChange }: { page: ZinePage; aspect: number; images: ZineImages; stickers: StickerImages; fontsReady: number; selSticker: string | null; onSelectSticker: (k: string | null) => void; onChange: (p: Partial<ZinePage>) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setW(Math.min(el.clientWidth, 460));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  usePageRender(ref, page, aspect, w * dpr, images, stickers, 1100, fontsReady);

  const drag = useRef<null | { mode: 'pan' | 'sticker'; key?: string; sx: number; sy: number; ox: number; oy: number }>(null);
  const h = w / aspect;

  function down(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    // Hit-test stickers from the top.
    const hit = [...page.stickers].reverse().find((s) => {
      const half = s.s / 2;
      return Math.abs(u - s.x) < half && Math.abs((v - s.y) * (h / w)) < half;
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit) {
      onSelectSticker(hit.key);
      drag.current = { mode: 'sticker', key: hit.key, sx: e.clientX, sy: e.clientY, ox: hit.x, oy: hit.y };
    } else {
      onSelectSticker(null);
      if (page.layout !== 'text') drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: page.panX, oy: page.panY };
    }
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || !w) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === 'sticker') {
      onChange({ stickers: page.stickers.map((s) => (s.key === d.key ? { ...s, x: Math.min(1.1, Math.max(-0.1, d.ox + dx / w)), y: Math.min(1.1, Math.max(-0.1, d.oy + dy / h)) } : s)) });
    } else {
      const k = 2 / Math.max(1, page.zoom);
      onChange({ panX: Math.max(-1, Math.min(1, d.ox - (dx / w) * k * 2)), panY: Math.max(-1, Math.min(1, d.oy - (dy / h) * k * 2)) });
    }
  }
  const up = () => (drag.current = null);

  const selected = page.stickers.find((s) => s.key === selSticker);
  return (
    <div ref={wrapRef} className="flex w-full justify-center">
      <div
        className="relative touch-none overflow-hidden rounded-[4px] border-2 border-ink bg-white shadow-[5px_5px_0_var(--color-ink)]"
        style={{ width: w || '100%', height: h || undefined, aspectRatio: w ? undefined : String(aspect) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <canvas ref={ref} className="block size-full" />
        {selected ? (
          <span
            className="pointer-events-none absolute rounded-[6px] border-2 border-dashed border-cobalt"
            style={{ left: `${(selected.x - selected.s / 2) * 100}%`, top: `calc(${selected.y * 100}% - ${(selected.s * w) / 2}px)`, width: `${selected.s * 100}%`, height: selected.s * w }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Flip-through booklet preview: cover → spreads → back cover. */
function Booklet({ pages, images, stickers, aspect, fontsReady }: { pages: ZinePage[]; images: ZineImages; stickers: StickerImages; aspect: number; fontsReady: number }) {
  const spreads: Array<[number | null, number | null]> = [[null, 0], [1, 2], [3, 4], [5, 6], [7, null]];
  const [i, setI] = useState(0);
  const [turn, setTurn] = useState<'next' | 'prev' | null>(null);
  const go = (dir: 1 | -1) => {
    const j = i + dir;
    if (j < 0 || j >= spreads.length || turn) return;
    setTurn(dir === 1 ? 'next' : 'prev');
    setTimeout(() => {
      setI(j);
      setTurn(null);
    }, 280);
  };
  const [l, r] = spreads[i];
  const pageEl = (n: number | null, side: 'l' | 'r') =>
    n === null ? (
      <div className="w-1/2" />
    ) : (
      <div className={cn('relative w-1/2 overflow-hidden bg-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)]', side === 'l' ? 'rounded-l-[3px]' : 'rounded-r-[3px]')}>
        <MiniPage page={pages[n]} aspect={aspect} images={images} stickers={stickers} fontsReady={fontsReady} width={240} />
        <span className={cn('pointer-events-none absolute inset-y-0 w-6', side === 'l' ? 'right-0 bg-gradient-to-l from-black/20 to-transparent' : 'left-0 bg-gradient-to-r from-black/20 to-transparent')} />
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-type text-xs font-bold tracking-[0.14em] uppercase">Preview buku</p>
      <div className="w-full max-w-[520px] [perspective:1400px]">
        <div
          className="flex transition-transform duration-[280ms] ease-in [transform-style:preserve-3d]"
          style={{ transform: turn === 'next' ? 'rotateY(-12deg) translateX(-4%)' : turn === 'prev' ? 'rotateY(12deg) translateX(4%)' : 'none', opacity: turn ? 0.6 : 1 }}
        >
          {pageEl(l, 'l')}
          {pageEl(r, 'r')}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={() => go(-1)} disabled={i === 0} aria-label="Sebelumnya"><ArrowLeft /></Button>
        <span className="min-w-28 text-center font-type text-sm">{i === 0 ? 'Sampul depan' : i === spreads.length - 1 ? 'Sampul belakang' : `Hal. ${l}–${r}`}</span>
        <Button size="icon" variant="secondary" onClick={() => go(1)} disabled={i === spreads.length - 1} aria-label="Berikutnya"><ArrowRight /></Button>
      </div>
    </div>
  );
}

function SheetPreview({ pages, images, stickers, paper, guides, fontsReady }: { pages: ZinePage[]; images: ZineImages; stickers: StickerImages; paper: ZinePaper; guides: boolean; fontsReady: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const target = ref.current;
      if (!target) return;
      const pxPerMm = 1000 / paper.widthMm;
      const c = renderSheet(pages, { paper, images, stickers, quality: 500, guides, pxPerMm });
      target.width = c.width;
      target.height = c.height;
      target.getContext('2d')!.drawImage(c, 0, 0);
    }, 120);
    return () => clearTimeout(t);
  }, [pages, images, stickers, paper, guides, fontsReady]);
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-type text-xs font-bold tracking-[0.14em] uppercase">Lembar cetak · {paper.label}</p>
      <canvas ref={ref} className="w-full max-w-[640px] border-2 border-ink bg-white shadow-[4px_4px_0_var(--color-ink)]" style={{ aspectRatio: `${paper.widthMm} / ${paper.heightMm}` }} />
      <p className="max-w-md text-center text-xs text-muted">Baris atas sengaja terbalik — setelah dilipat semua halaman jadi tegak. Garis merah = bagian yang digunting.</p>
    </div>
  );
}
