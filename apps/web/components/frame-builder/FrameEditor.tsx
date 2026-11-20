'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Barcode,
  Circle,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutTemplate,
  Lock,
  Minus,
  Plus,
  Redo2,
  Save,
  Square,
  SquareUser,
  Type,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { FrameCanvas } from '@/components/frames/FrameCanvas';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { canvasToBlob, createCanvas, defaultTokens, loadBitmap, prepareDesign, renderDesign, type Drawable } from '@/lib/frames/render';
import { FRAME_TEMPLATES } from '@/lib/frames/presets';
import type { AssetRef, FrameDesign, FrameElement, ImageElement } from '@/lib/frames/types';
import { aspectOfSlot, collectAssets, newId, slotCountOf } from '@/lib/frames/types';
import { cn } from '@/lib/utils';
import { EditorStage } from './EditorStage';
import { PropertiesPanel } from './PropertiesPanel';
import { nextSlotIndex, samplePhotos, useEditor } from './useEditor';

const TYPE_ICON: Record<FrameElement['type'], React.ComponentType<{ className?: string }>> = {
  photo: SquareUser,
  text: Type,
  image: ImagePlus,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  barcode: Barcode,
};

export interface FrameEditorProps {
  frameId?: string;
  initialName: string;
  initialDesign: FrameDesign;
  initialActive?: boolean;
  eventCode?: string | null;
}

export function FrameEditor({ frameId, initialName, initialDesign, initialActive = true, eventCode }: FrameEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const editor = useEditor(initialDesign);
  const { design, selected, selectedId, setSelectedId } = editor;
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [active, setActive] = useState(initialActive);
  const [savedActive, setSavedActive] = useState(initialActive);
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
  const [fitZoom, setFitZoom] = useState(0.3);
  const [preview, setPreview] = useState<'slots' | 'sample'>('sample');
  const [assets, setAssets] = useState<Map<string, Drawable>>(new Map());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(!frameId && initialDesign.elements.length === 0);
  const [showPreview, setShowPreview] = useState(false);
  const stageWrap = useRef<HTMLDivElement>(null);
  const tokens = useMemo(() => defaultTokens('Nama Event', 'AB12CD'), []);

  const dirty = editor.dirty || name !== savedName || active !== savedActive;
  const slotCount = slotCountOf(design);
  const zoom = zoomMode === 'fit' ? fitZoom : zoomMode;

  // Fit-to-screen zoom.
  useEffect(() => {
    const el = stageWrap.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setFitZoom(Math.max(0.05, Math.min((r.width - 64) / design.width, (r.height - 64) / design.height, 1.5)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [design.width, design.height]);

  // Load images used by the design (keyed by storage path).
  useEffect(() => {
    let cancelled = false;
    void prepareDesign(design).then((m) => {
      if (!cancelled) setAssets((prev) => (sameKeys(prev, m) ? prev : m));
    });
    return () => {
      cancelled = true;
    };
  }, [design]);

  const sampleAspect = Math.round(aspectOfSlot(design, 0) * 20) / 20;
  const photos = useMemo(() => (preview === 'sample' ? samplePhotos(Math.max(1, slotCount), sampleAspect) : undefined), [preview, slotCount, sampleAspect]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ── Adding elements ────────────────────────────────────────────────────────
  const add = useCallback(
    (type: FrameElement['type']) => {
      const W = design.width;
      const H = design.height;
      const base = { id: newId(), x: Math.round(W * 0.2), y: Math.round(H * 0.4), w: Math.round(W * 0.6), h: Math.round(H * 0.1) };
      let el: FrameElement;
      switch (type) {
        case 'photo': {
          const w = Math.round(W * 0.7);
          el = { ...base, type: 'photo', slot: nextSlotIndex(design), w, h: Math.round(w * 0.75), x: Math.round((W - w) / 2), radius: 0, borderWidth: 0, borderColor: '#000000' };
          break;
        }
        case 'text':
          el = { ...base, type: 'text', text: '{event}', font: 'sans', size: Math.round(W / 12), weight: 700, color: '#111111', align: 'center', letterSpacing: 0, lineHeight: 1.2, h: Math.round(W / 8) };
          break;
        case 'rect':
          el = { ...base, type: 'rect', fill: '#F3F4F6', stroke: 'transparent', strokeWidth: 0, radius: 12 };
          break;
        case 'ellipse':
          el = { ...base, type: 'ellipse', w: Math.round(W * 0.3), h: Math.round(W * 0.3), fill: '#FFD43B', stroke: 'transparent', strokeWidth: 0, radius: 0 };
          break;
        case 'line':
          el = { ...base, type: 'line', h: 12, color: '#111111', thickness: 3, dash: 0 };
          break;
        case 'barcode':
          el = { ...base, type: 'barcode', w: Math.round(W * 0.45), h: Math.round(W * 0.15), color: '#111111', seed: 'photovoks' };
          break;
        default:
          return;
      }
      editor.addElement(el);
    },
    [design, editor],
  );

  async function uploadAsset(file: File): Promise<AssetRef | null> {
    if (file.size > 10 * 1024 * 1024) {
      toast('Gambar maksimal 10 MB', 'error');
      return null;
    }
    setUploading(true);
    try {
      const res = await api<{ path: string; signedUrl: string }>('/api/admin/frames/upload-url', { method: 'POST', json: { kind: 'asset', contentType: file.type } });
      await uploadToSignedUrl(res.signedUrl, file, file.type);
      return { path: res.path, url: URL.createObjectURL(file) };
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload gagal', 'error');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onUploadImage(target: 'background' | 'element' | 'new', file: File) {
    const ref = await uploadAsset(file);
    if (!ref) return;
    const bmp = await loadBitmap(ref.url!);
    const d = editor.designRef.current;
    if (target === 'background') {
      editor.commit({ ...d, background: { ...d.background, image: ref, imageFit: d.background.imageFit ?? 'cover' } });
    } else if (target === 'element' && selected?.type === 'image') {
      editor.updateElement(selected.id, { asset: ref } as Partial<ImageElement>);
    } else {
      const ar = bmp ? bmp.width / bmp.height : 1;
      // Full-canvas PNG overlays (same ratio as canvas) are placed edge to edge on top.
      const sameRatio = Math.abs(ar - d.width / d.height) < 0.02;
      const w = sameRatio ? d.width : Math.round(d.width * 0.5);
      const h = sameRatio ? d.height : Math.round(w / ar);
      editor.addElement({ id: newId(), type: 'image', name: file.name.slice(0, 40), asset: ref, x: sameRatio ? 0 : Math.round((d.width - w) / 2), y: sameRatio ? 0 : Math.round((d.height - h) / 2), w, h, fit: sameRatio ? 'stretch' : 'contain', radius: 0 });
      if (sameRatio) toast('Overlay ditempatkan penuh di lapisan teratas');
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        editor.redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      } else if (mod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault();
        editor.duplicateElement(selectedId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        editor.removeElement(selectedId);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (selected && !selected.locked && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        editor.updateElement(selected.id, { x: selected.x + dx, y: selected.y + dy }, `${selected.id}:nudge`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Save ──────────────────────────────────────────────────────────────────
  async function makeThumbnail(): Promise<string | null> {
    try {
      const d = editor.designRef.current;
      const loaded = await prepareDesign(d);
      const scale = Math.min(1, 480 / d.width);
      const c = createCanvas(d.width * scale, d.height * scale);
      renderDesign(c.getContext('2d')!, d, { photos: samplePhotos(Math.max(1, slotCountOf(d)), aspectOfSlot(d, 0)), assets: loaded, tokens, scale });
      const blob = await canvasToBlob(c, 'image/jpeg', 0.85);
      const res = await api<{ path: string; signedUrl: string }>('/api/admin/frames/upload-url', { method: 'POST', json: { kind: 'thumb', contentType: 'image/jpeg' } });
      await uploadToSignedUrl(res.signedUrl, blob, 'image/jpeg');
      return res.path;
    } catch {
      return null; // Thumbnail is optional; booth falls back to live rendering.
    }
  }

  async function save() {
    const d = editor.designRef.current;
    if (!name.trim()) return toast('Beri nama frame dulu', 'error');
    if (slotCountOf(d) < 1) return toast('Tambahkan minimal 1 slot foto', 'error');
    setSaving(true);
    try {
      let id = frameId;
      if (id) {
        await api(`/api/admin/frames/${id}`, { method: 'PATCH', json: { name, design: d, isActive: active } });
      } else {
        const res = await api<{ id: string }>('/api/admin/frames', { method: 'POST', json: { name, design: d, eventCode } });
        id = res.id;
      }
      const thumb = await makeThumbnail();
      if (thumb) await api(`/api/admin/frames/${id}`, { method: 'PATCH', json: { thumbnailPath: thumb } }).catch(() => {});
      editor.markSaved(d);
      setSavedName(name);
      setSavedActive(active);
      toast(eventCode && !frameId ? `Frame disimpan & ditambahkan ke event ${eventCode}` : 'Frame disimpan');
      if (!frameId) router.replace(`/admin/frames/${id}${eventCode ? `?event=${eventCode}` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  const tools: Array<{ type: FrameElement['type']; label: string }> = [
    { type: 'photo', label: 'Slot foto' },
    { type: 'text', label: 'Teks' },
    { type: 'rect', label: 'Kotak' },
    { type: 'ellipse', label: 'Lingkaran' },
    { type: 'line', label: 'Garis' },
    { type: 'barcode', label: 'Barcode' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas lg:left-[248px]">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <Link href={eventCode ? `/event/${eventCode}/frames` : '/admin/frames'} className="flex size-9 items-center justify-center rounded-ctl text-ink-2 hover:bg-ink/5" aria-label="Kembali"><ArrowLeft className="size-5" /></Link>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama frame" className="h-9 w-40 min-w-0 rounded-ctl border border-transparent px-2 text-[15px] font-bold hover:border-line focus:border-brand focus:outline-none sm:w-64" aria-label="Nama frame" />
        <span className="hidden text-xs text-muted md:inline">{design.width}×{design.height} · {slotCount} slot</span>
        <div className="mx-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Batal (⌘Z)"><Undo2 /></Button>
          <Button size="icon-sm" variant="ghost" onClick={editor.redo} disabled={!editor.canRedo} aria-label="Ulangi (⇧⌘Z)"><Redo2 /></Button>
          <span className="mx-1 h-5 w-px bg-line" />
          <Button size="icon-sm" variant="ghost" onClick={() => setZoomMode(Math.max(0.05, zoom / 1.25))} aria-label="Perkecil"><Minus /></Button>
          <button type="button" onClick={() => setZoomMode('fit')} className="h-8 min-w-14 rounded-[8px] px-1 text-xs font-semibold tabular-nums hover:bg-ink/5">{Math.round(zoom * 100)}%</button>
          <Button size="icon-sm" variant="ghost" onClick={() => setZoomMode(Math.min(3, zoom * 1.25))} aria-label="Perbesar"><Plus /></Button>
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <Segmented size="sm" className="hidden sm:inline-flex" value={preview} onChange={setPreview} options={[{ value: 'sample', label: 'Foto contoh' }, { value: 'slots', label: 'Slot' }]} />
        </div>
        <Button variant="secondary" size="sm" className="hidden md:inline-flex" onClick={() => setTemplatesOpen(true)}><LayoutTemplate /> Template</Button>
        <Button variant="secondary" size="sm" onClick={() => setShowPreview(true)}><Eye /> <span className="hidden sm:inline">Pratinjau</span></Button>
        <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty && !!frameId}><Save /> {dirty || !frameId ? 'Simpan' : 'Tersimpan'}</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: tools + layers */}
        <aside className="flex w-[64px] shrink-0 flex-col border-r border-line bg-surface md:w-[220px]">
          <div className="grid grid-cols-1 gap-1 p-2 md:grid-cols-2">
            {tools.map((t) => {
              const Icon = TYPE_ICON[t.type];
              return (
                <button key={t.type} type="button" onClick={() => add(t.type)} className="flex flex-col items-center justify-center gap-1 rounded-[10px] py-2.5 text-[11px] font-semibold text-ink-2 hover:bg-ink/5 hover:text-ink" title={t.label}>
                  <Icon className="size-5" />
                  <span className="hidden md:block">{t.label}</span>
                </button>
              );
            })}
            <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] py-2.5 text-[11px] font-semibold text-ink-2 hover:bg-ink/5', uploading && 'pointer-events-none opacity-50')} title="Upload gambar / overlay PNG">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadImage('new', f); e.target.value = ''; }} />
              {uploading ? <Spinner className="size-5" /> : <ImagePlus className="size-5" />}
              <span className="hidden md:block">Gambar</span>
            </label>
            <button type="button" onClick={() => setTemplatesOpen(true)} className="flex flex-col items-center justify-center gap-1 rounded-[10px] py-2.5 text-[11px] font-semibold text-ink-2 hover:bg-ink/5 md:hidden" title="Template"><LayoutTemplate className="size-5" /></button>
          </div>
          <div className="hidden min-h-0 flex-1 flex-col border-t border-line md:flex">
            <p className="px-4 pt-3 pb-2 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Lapisan</p>
            <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {[...design.elements].reverse().map((el) => {
                const Icon = TYPE_ICON[el.type];
                const label = el.type === 'photo' ? `Foto ${el.slot + 1}` : el.type === 'text' ? el.text.split('\n')[0] || 'Teks' : el.name || el.type;
                return (
                  <li key={el.id}>
                    <div className={cn('group flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px]', el.id === selectedId ? 'bg-brand-soft font-semibold text-brand-ink' : 'text-ink-2 hover:bg-ink/5')}>
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(el.id)}>
                        <Icon className="size-3.5 shrink-0" />
                        <span className={cn('truncate', el.hidden && 'opacity-40')}>{label}</span>
                      </button>
                      {el.locked ? <Lock className="size-3 shrink-0 text-muted" /> : null}
                      <button type="button" onClick={() => editor.updateElement(el.id, { hidden: !el.hidden })} className="text-muted opacity-0 group-hover:opacity-100 data-[on=true]:opacity-100" data-on={el.hidden} aria-label={el.hidden ? 'Tampilkan' : 'Sembunyikan'}>
                        {el.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </li>
                );
              })}
              <li className="mt-1 flex h-8 items-center gap-2 px-2 text-[13px] text-muted"><Square className="size-3.5" /> Latar</li>
            </ul>
          </div>
        </aside>

        {/* Stage */}
        <div ref={stageWrap} className="relative min-w-0 flex-1 overflow-auto bg-[#E7E9EF] [background-image:radial-gradient(rgb(14_20_36/0.08)_1px,transparent_1px)] [background-size:16px_16px]" onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
          <div className="flex min-h-full min-w-full items-center justify-center p-8" style={{ width: 'max-content', height: 'max-content' }} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
            <EditorStage editor={editor} zoom={zoom} photos={photos} assets={assets} tokens={tokens} />
          </div>
        </div>

        {/* Right: properties */}
        <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-line bg-surface sm:block">
          <PropertiesPanel editor={editor} onUploadImage={(t, f) => void onUploadImage(t, f)} uploading={uploading} />
          {frameId ? (
            <div className="flex items-center justify-between border-t border-line px-4 py-4">
              <span><span className="block text-sm font-semibold">Aktif</span><span className="text-xs text-muted">Nonaktif = disembunyikan dari semua booth</span></span>
              <Switch checked={active} onChange={setActive} label="Aktif" />
            </div>
          ) : null}
        </aside>
      </div>

      {/* Mobile properties (portrait iPad / phones) */}
      {selected ? (
        <div className="max-h-[45vh] shrink-0 overflow-y-auto border-t border-line bg-surface sm:hidden">
          <PropertiesPanel editor={editor} onUploadImage={(t, f) => void onUploadImage(t, f)} uploading={uploading} />
        </div>
      ) : null}

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen} size="xl" title="Mulai dari template" description="Template mengganti desain saat ini (bisa dibatalkan dengan Undo).">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {FRAME_TEMPLATES.map((t) => (
            <TemplateCard key={t.id} name={t.name} description={t.description} build={t.build} tokens={tokens} onPick={(d) => { editor.commit(d); setSelectedId(null); setTemplatesOpen(false); if (!name.trim() || name === 'Frame baru') setName(t.name); }} />
          ))}
        </div>
      </Dialog>

      <Dialog open={showPreview} onOpenChange={setShowPreview} size="lg" title="Pratinjau hasil" description="Begini hasil akhirnya setelah foto tamu masuk (render sama dengan booth & cetak).">
        <div className="flex justify-center rounded-[12px] bg-[#E7E9EF] p-6">
          <FrameCanvas design={design} photos={samplePhotos(Math.max(1, slotCount), aspectOfSlot(design, 0))} tokens={tokens} maxRenderWidth={900} className="max-h-[65vh] w-auto shadow-[0_20px_50px_-20px_rgba(14,20,36,0.45)]" style={{ maxHeight: '65vh' }} />
        </div>
        <p className="mt-3 text-center text-xs text-muted">Asset: {collectAssets(design).length} gambar · Token teks diganti otomatis: {'{event}'} {'{date}'} {'{time}'} {'{code}'}</p>
      </Dialog>
    </div>
  );
}

function TemplateCard({ name, description, build, tokens, onPick }: { name: string; description: string; build: () => FrameDesign; tokens: Record<string, string>; onPick: (d: FrameDesign) => void }) {
  const design = useMemo(() => build(), [build]);
  const photos = useMemo(() => samplePhotos(Math.max(1, slotCountOf(design)), aspectOfSlot(design, 0)), [design]);
  return (
    <button type="button" onClick={() => onPick(build())} className="group flex flex-col overflow-hidden rounded-[12px] border border-line text-left transition hover:border-brand hover:shadow-pop">
      <div className="flex h-56 items-center justify-center bg-[#EEF0F4] p-3">
        <FrameCanvas design={design} photos={photos} tokens={tokens} maxRenderWidth={300} className="max-h-full w-auto shadow-[0_8px_20px_-10px_rgba(0,0,0,0.4)]" style={{ maxHeight: '100%' }} />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-bold">{name}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
    </button>
  );
}

function sameKeys(a: Map<string, unknown>, b: Map<string, unknown>) {
  if (a.size !== b.size) return false;
  for (const k of b.keys()) if (!a.has(k)) return false;
  return true;
}
