'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Film, ImageIcon, Settings2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { AttractView } from '@/components/booth/AttractView';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { compressImage } from '@/lib/compress';
import { defaultTokens } from '@/lib/frames/render';
import type { EventConfig } from '@/lib/events';
import type { FrameRecord } from '@/lib/frames/types';
import { cn } from '@/lib/utils';

export type HomeForm = Pick<EventConfig, 'code' | 'name' | 'status' | 'welcomeTitle' | 'welcomeSubtitle' | 'printMode' | 'attractMediaPath' | 'attractMediaType' | 'attractCta' | 'attractShowText'>;

const MAX_BYTES = 50 * 1024 * 1024;

export async function uploadEventMedia(code: string, kind: 'attract' | 'stickers', file: File): Promise<string> {
  // Images are compressed in the browser first (videos are uploaded as-is):
  // home-screen images ≤ 2400 px, stickers ≤ 512 px WebP with transparency.
  let blob: Blob = file;
  let type = file.type;
  if (file.type.startsWith('image/')) {
    const packed = await compressImage(file, kind === 'stickers' ? { maxSide: 512, quality: 0.9, type: 'image/webp' } : { maxSide: 2400, quality: 0.86 });
    // Stickers must stay transparent: if the browser could only make a JPEG,
    // upload the original PNG/WebP instead.
    if (!(kind === 'stickers' && packed.type === 'image/jpeg')) {
      blob = packed.blob;
      type = packed.type;
    }
  }
  const res = await api<{ path: string; uploadUrl: string }>(`/api/events/${code}/media`, { method: 'POST', json: { kind, contentType: type } });
  await uploadToSignedUrl(res.uploadUrl, blob, type);
  return res.path;
}

export function HomeScreenSection({
  form,
  set,
  mediaUrl,
  frames,
}: {
  form: HomeForm;
  set: <K extends keyof HomeForm>(k: K, v: HomeForm[K]) => void;
  /** Signed URL of the saved media (when the path hasn't changed). */
  mediaUrl: string | null;
  frames: FrameRecord[];
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [local, setLocal] = useState<{ path: string; url: string } | null>(null);
  const tokens = useMemo(() => defaultTokens(form.name, form.code), [form.name, form.code]);
  const url = form.attractMediaPath ? (local?.path === form.attractMediaPath ? local.url : mediaUrl) : null;

  useEffect(() => () => {
    if (local) URL.revokeObjectURL(local.url);
  }, [local]);

  async function onFile(file: File) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return toast('Pilih file video (MP4) atau gambar', 'error');
    if (file.size > MAX_BYTES) return toast('Maksimal 50 MB. Kompres video ke 1080p / H.264 dulu.', 'error');
    setUploading(true);
    try {
      const path = await uploadEventMedia(form.code, 'attract', file);
      setLocal({ path, url: URL.createObjectURL(file) });
      set('attractMediaPath', path);
      set('attractMediaType', isVideo ? 'video' : 'image');
      toast('Terunggah — tekan Simpan untuk memakai di booth');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload gagal', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3">
        <ScaledPreview>
          <AttractView event={form} frames={frames} tokens={tokens} mediaUrl={url} preview corner={<span className="flex size-11 items-center justify-center rounded-full bg-white/80 text-ink/50"><Settings2 className="size-5" /></span>} />
        </ScaledPreview>
        <p className="text-xs text-muted">Pratinjau persis seperti di booth. Tamu mengetuk layar di mana saja untuk mulai; tahan ikon pengaturan 1 detik untuk menu operator.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="Latar layar awal" hint="Video diputar tanpa suara dan berulang. Disarankan MP4 (H.264), 1080p, ≤ 50 MB — paling lancar di iPad.">
          <div className="flex flex-col gap-2 rounded-[12px] border border-dashed border-line-strong p-3">
            {form.attractMediaPath ? (
              <div className="flex items-center gap-2 text-sm">
                {form.attractMediaType === 'video' ? <Film className="size-4 text-muted" /> : <ImageIcon className="size-4 text-muted" />}
                <span className="flex-1 font-semibold">{form.attractMediaType === 'video' ? 'Video sendiri' : 'Gambar sendiri'}</span>
                <Button size="xs" variant="ghost" onClick={() => { set('attractMediaPath', null); set('attractMediaType', null); }}><Trash2 /> Hapus</Button>
              </div>
            ) : (
              <p className="text-sm text-muted">Tampilan bawaan Photovoks</p>
            )}
            <FileButton accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp" onFile={(f) => void onFile(f)} disabled={uploading}>
              {uploading ? <Spinner className="size-4" /> : <Upload className="size-4" />} {form.attractMediaPath ? 'Ganti file' : 'Upload video / gambar'}
            </FileButton>
          </div>
        </Field>
        <Field label="Judul" hint="Kosong = bawaan"><Input value={form.welcomeTitle ?? ''} onChange={(e) => set('welcomeTitle', e.target.value)} maxLength={80} placeholder="Foto sekarang, cetak kemudian." /></Field>
        <Field label="Subjudul"><Input value={form.welcomeSubtitle ?? ''} onChange={(e) => set('welcomeSubtitle', e.target.value)} maxLength={160} placeholder={form.name} /></Field>
        <Field label="Ajakan"><Input value={form.attractCta ?? ''} onChange={(e) => set('attractCta', e.target.value)} maxLength={60} placeholder="Ketuk layar untuk mulai" /></Field>
        <SwitchRow title="Tampilkan teks" description={form.attractMediaPath ? 'Judul & subjudul di atas video.' : 'Langkah-langkah (pilih frame, bergaya, …).'} checked={form.attractShowText} onChange={(v) => set('attractShowText', v)} />
      </div>
    </div>
  );
}

/** Renders children at 1280×800 and scales to the available width. */
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-[14px] border border-line bg-black shadow-panel" style={{ aspectRatio: '1280 / 800' }}>
      <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ width: 1280, height: 800, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

export function FileButton({ accept, onFile, disabled, multiple, children, className }: { accept: string; onFile: (f: File) => void; disabled?: boolean; multiple?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-ctl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-canvas', disabled && 'pointer-events-none opacity-50', className)}>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach(onFile);
          e.target.value = '';
        }}
      />
      {children}
    </label>
  );
}
