'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, ImageIcon, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { api, timeAgo, uploadToSignedUrl } from '@/lib/fetcher';
import type { GuestbookEntryView } from '@/lib/community';
import { variant } from '@/lib/media-variant';

const NAME_KEY = 'photovoks.guestName';

/** Downscales a phone photo to ≤1600px JPEG before upload. */
async function compress(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses foto'))), 'image/jpeg', 0.85));
}

export function GuestbookMicrosite({ token, eventName, initial, galleryToken, liveEnabled }: { token: string; eventName: string; initial: GuestbookEntryView[]; galleryToken: string | null; liveEnabled: boolean }) {
  const toast = useToast();
  const [entries, setEntries] = useState(initial);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(initial.length >= 30);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore from localStorage after hydration
    if (saved) setName(saved);
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Pilih file foto', 'error');
    try {
      const blob = await compress(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Foto tidak bisa dibaca', 'error');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return toast('Isi nama dan pesan dulu', 'error');
    setSending(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const up = await api<{ path: string; uploadUrl: string }>(`/api/m/${token}/upload`, { method: 'POST' });
        await uploadToSignedUrl(up.uploadUrl, photo.blob, 'image/jpeg');
        photoPath = up.path;
      }
      const res = await api<{ entry: GuestbookEntryView }>(`/api/m/${token}`, { method: 'POST', json: { name: name.trim(), message: message.trim(), photoPath } });
      localStorage.setItem(NAME_KEY, name.trim());
      setEntries((xs) => [res.entry, ...xs]);
      setMessage('');
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      toast('Terima kasih! Pesanmu sudah tampil.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim', 'error');
    } finally {
      setSending(false);
    }
  }

  async function loadMore() {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await api<{ entries: GuestbookEntryView[] }>(`/api/m/${token}?before=${encodeURIComponent(last.createdAt)}`);
      setEntries((xs) => [...xs, ...res.entries]);
      setMore(res.entries.length >= 30);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#F7F5F0]">
      <div className="mx-auto max-w-5xl px-4 pt-[max(28px,env(safe-area-inset-top))] pb-16 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-bold tracking-[0.2em] text-muted uppercase">Buku tamu</p>
          <h1 className="mt-1 text-[clamp(30px,6vw,52px)] leading-[1.02] font-extrabold tracking-tight text-ink">{eventName}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {galleryToken ? <Link href={`/g/${galleryToken}`}><Button variant="secondary" size="sm"><ImageIcon /> Foto booth</Button></Link> : null}
            {liveEnabled ? <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white px-3 text-xs font-semibold text-ink-2 shadow-panel"><span className="size-1.5 rounded-full bg-[#FF3B30]" /> Pesanmu juga tampil di layar event</span> : null}
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form onSubmit={submit} className="flex flex-col gap-4 self-start rounded-[20px] bg-white p-5 shadow-panel lg:sticky lg:top-6">
            <p className="text-lg font-extrabold">Tinggalkan pesan</p>
            <Field label="Nama"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nama kamu" autoComplete="name" /></Field>
            <Field label="Pesan & kesan">
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Selamat ya! …" className="min-h-28" />
              <span className="self-end text-[11px] text-muted tabular-nums">{message.length}/500</span>
            </Field>
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Foto yang akan dikirim" className="max-h-56 w-full rounded-[12px] object-cover" />
                <button type="button" onClick={() => { URL.revokeObjectURL(photo.url); setPhoto(null); }} className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Hapus foto"><X className="size-4" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-20 items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong text-sm font-semibold text-ink-2 hover:bg-canvas">
                <Camera className="size-4" /> Tambah foto (opsional)
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            <Button type="submit" variant="primary" size="lg" loading={sending}><Send /> Kirim</Button>
          </form>

          <section aria-label="Pesan tamu">
            {entries.length ? (
              <div className="columns-1 gap-4 sm:columns-2">
                {entries.map((e) => (
                  <article key={e.id} className="mb-4 break-inside-avoid overflow-hidden rounded-[18px] bg-white shadow-panel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {e.photo ? <img src={variant(e.photo, { w: 720 })} alt="" loading="lazy" className="w-full" /> : null}
                    <div className="p-4">
                      <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink">{e.message}</p>
                      <p className="mt-3 text-sm"><span className="font-bold">{e.name}</span> <span className="text-muted">· {timeAgo(e.createdAt)}</span></p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-line-strong px-6 py-16 text-center text-muted">Jadilah yang pertama menulis pesan.</div>
            )}
            {more ? (
              <div className="mt-2 flex justify-center">
                <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <Spinner className="size-4" /> : null} Muat lebih banyak</Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
