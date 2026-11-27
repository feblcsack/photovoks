'use client';

/**
 * Admin sticker & icon library. Uploaded once, available to the guests of
 * every event (sticker studio, live-wall stickers, minizine). Files are
 * compressed in the browser: ≤ 512 px WebP with transparency (~10–40 KB).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, uploadToSignedUrl } from '@/lib/fetcher';
import { compressImage, formatBytes } from '@/lib/compress';
import { Y2K_STICKERS, y2kStickerUrl } from '@/lib/y2k-stickers';
import { cn } from '@/lib/utils';

interface Row {
  id: string;
  name: string;
  category: string;
  url: string | null;
  bytes: number | null;
  isActive: boolean;
}

const CATEGORIES = [
  { id: 'y2k', label: 'Y2K' },
  { id: 'lucu', label: 'Lucu' },
  { id: 'teks', label: 'Teks' },
  { id: 'event', label: 'Event' },
  { id: 'custom', label: 'Lainnya' },
];

export function StickerLibrary() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [category, setCategory] = useState('custom');
  const [drag, setDrag] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ stickers: Row[]; migrationNeeded?: boolean }>('/api/admin/stickers');
    setRows(res.stickers);
    setMigrationNeeded(!!res.migrationNeeded);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load().catch(() => setRows([]));
  }, [load]);

  async function uploadOne(file: File) {
    if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error(`${file.name}: pakai PNG / WebP transparan`);
    const packed = await compressImage(file, { maxSide: 512, quality: 0.9, type: 'image/webp' });
    // Keep transparency: if WebP isn't available the helper returns PNG.
    const type = packed.type === 'image/jpeg' ? 'image/png' : packed.type;
    const blob = packed.type === 'image/jpeg' ? file : packed.blob;
    const up = await api<{ path: string; uploadUrl: string }>('/api/admin/stickers', { method: 'POST', json: { action: 'upload-url', contentType: type } });
    await uploadToSignedUrl(up.uploadUrl, blob, type);
    await api('/api/admin/stickers', {
      method: 'POST',
      json: { action: 'create', path: up.path, name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60), category, width: packed.width, height: packed.height, bytes: blob.size },
    });
    return { before: file.size, after: blob.size };
  }

  async function uploadMany(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 30);
    if (!list.length) return;
    setUploading(list.length);
    let before = 0;
    let after = 0;
    for (const f of list) {
      try {
        const r = await uploadOne(f);
        before += r.before;
        after += r.after;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Upload gagal', 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (before) toast(`Terunggah · ${formatBytes(before)} → ${formatBytes(after)}`);
    await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await api('/api/admin/stickers', { method: 'PATCH', json: { id, ...body } }).catch((e) => toast(e.message, 'error'));
    await load();
  }

  async function remove(id: string) {
    await api(`/api/admin/stickers?id=${id}`, { method: 'DELETE' }).catch((e) => toast(e.message, 'error'));
    await load();
  }

  return (
    <div>
      <PageHeader title="Stiker & Ikon" description="Upload ikon/stiker sendiri. Langsung bisa dipakai tamu semua event untuk menghias photostrip, live wall, dan minizine." />
      {migrationNeeded ? <p className="mb-5 rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">Tabel stiker belum ada — jalankan migrasi v5 (lihat Developer).</p> : null}

      <Panel className="mb-6">
        <PanelHeader title="Upload" description="PNG / WebP transparan. Otomatis dikecilkan ke 512 px WebP — tetap tajam di HP & cetak strip." />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold" htmlFor="sticker-cat">Kategori</label>
            <Select id="sticker-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="w-40">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void uploadMany(e.dataTransfer.files);
            }}
            className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand bg-brand-soft' : 'border-line-strong hover:border-faint')}
          >
            {uploading ? <Spinner className="size-6" /> : <ImagePlus className="size-7 text-muted" />}
            <span className="text-sm font-semibold">{uploading ? `Mengunggah ${uploading} file…` : 'Tarik file ke sini atau klik untuk memilih'}</span>
            <span className="text-xs text-muted">Maks. 30 file sekali upload</span>
            <input type="file" accept="image/png,image/webp" multiple className="sr-only" onChange={(e) => e.target.files && void uploadMany(e.target.files)} disabled={!!uploading} />
          </label>
        </div>
      </Panel>

      <Panel className="mb-6">
        <PanelHeader title="Library kamu" description={rows ? `${rows.length} stiker` : 'Memuat…'} />
        {!rows ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !rows.length ? (
          <EmptyState icon={<ImagePlus />} title="Belum ada stiker" description="Upload ikon event, logo sponsor, atau stiker lucu buatanmu." />
        ) : (
          <div className="grid grid-cols-3 gap-3 p-5 sm:grid-cols-5 lg:grid-cols-8">
            {rows.map((r) => (
              <div key={r.id} className={cn('group relative flex flex-col items-center gap-1 rounded-[12px] border border-line p-2', !r.isActive && 'opacity-45')}>
                <div className="flex aspect-square w-full items-center justify-center rounded-[8px] bg-[repeating-conic-gradient(#EEE6D3_0_25%,#FFFCF4_0_50%)] bg-[length:14px_14px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.url ? <img src={r.url} alt={r.name} className="max-h-full max-w-full object-contain p-1" loading="lazy" /> : null}
                </div>
                <p className="w-full truncate text-center text-[11px] font-semibold">{r.name}</p>
                <Select value={r.category} onChange={(e) => void patch(r.id, { category: e.target.value })} className="h-7 w-full text-[11px]">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
                <p className="text-[10px] text-muted">{r.bytes ? formatBytes(r.bytes) : ''}</p>
                <div className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
                  <button type="button" onClick={() => void patch(r.id, { isActive: !r.isActive })} className="flex size-6 items-center justify-center rounded-full bg-ink text-white" aria-label={r.isActive ? 'Sembunyikan' : 'Tampilkan'}>
                    {r.isActive ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                  <button type="button" onClick={() => void remove(r.id)} className="flex size-6 items-center justify-center rounded-full bg-danger text-white" aria-label="Hapus"><Trash2 className="size-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Stiker bawaan Y2K" description="Selalu tersedia untuk tamu (digambar sebagai SVG — ringan, tajam di ukuran apa pun)." />
        <div className="grid grid-cols-5 gap-3 p-5 sm:grid-cols-8 lg:grid-cols-12">
          {Y2K_STICKERS.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={y2kStickerUrl(s.id)} alt={s.label} className="aspect-square w-full object-contain" />
              <span className="truncate text-[10px] text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
