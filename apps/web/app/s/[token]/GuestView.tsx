'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, Download, Film, ImageIcon, MessageSquareText, Palette, Printer, Sticker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { AiStudio } from '@/components/session/AiStudio';
import { StickerStudio } from '@/components/session/StickerStudio';
import { useGuestSession } from '@/components/session/useGuestSession';
import { LivePlayer } from '@/components/gallery/LivePlayer';
import { api, formatDateTime } from '@/lib/fetcher';
import type { AiGenerationView, GuestSessionData } from '@/lib/session-types';

type View = 'strip' | 'live' | 'shots';

export function GuestView({ token, initial }: { token: string; initial: GuestSessionData }) {
  const toast = useToast();
  const { data, refresh } = useGuestSession(token, initial);
  const d = data ?? initial;
  const { session, event } = d;
  const [view, setView] = useState<View>(session.urls.gif ? 'live' : 'strip');
  const [queueing, setQueueing] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);

  const used = session.printJobs.filter((p) => p.source.startsWith('guest') && p.status !== 'cancelled').reduce((s, p) => s + p.copies, 0);
  const printsLeft = Math.max(0, event.maxGuestPrints - used);
  const canPrint = event.printMode !== 'off' && printsLeft > 0;
  const activeJob = session.printJobs.find((p) => p.status === 'queued' || p.status === 'printing');

  async function queuePrint(type: 'strip' | 'ai', aiId?: string) {
    setQueueing(true);
    try {
      await api(`/api/s/${token}/print`, { method: 'POST', json: { mode: 'queue', type, aiId, copies: 1 } });
      toast('Terkirim ke printer penyelenggara');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal mengirim ke printer', 'error');
    } finally {
      setQueueing(false);
    }
  }

  // Phones can't reach the booth printer: every print goes to the owner's queue.
  function startPrint(type: 'strip' | 'ai', url: string | null, aiId?: string) {
    if (!url) return;
    void queuePrint(type, aiId);
  }
  const printHint = event.printMode === 'off' ? 'Cetak tidak tersedia di event ini' : printsLeft === 0 ? 'Jatah cetak dari HP sudah habis' : '';

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 pt-[max(20px,env(safe-area-inset-top))] pb-16 sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-widest text-muted uppercase">Photovoks</p>
          <h1 className="truncate text-xl font-extrabold tracking-tight">{event.name}</h1>
        </div>
        <span className="text-xs text-muted">{formatDateTime(session.createdAt)}</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section>
          <Segmented<View>
            className="mb-3"
            value={view}
            onChange={setView}
            options={[
              { value: 'strip', label: <><ImageIcon className="size-3.5" /> Foto</> },
              ...(session.urls.gif || session.urls.live ? [{ value: 'live' as View, label: <><Film className="size-3.5" /> Live</> }] : []),
              { value: 'shots', label: `Semua (${session.urls.shots.length})` },
            ]}
          />
          <div className="rounded-[18px] bg-surface p-3 shadow-panel">
            {view === 'strip' && session.urls.strip ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.urls.strip} alt="Hasil photobooth" className="mx-auto block max-h-[70vh] w-auto rounded-[8px]" />
            ) : view === 'live' ? (
              <div className="flex flex-col gap-4">
                {session.urls.gif ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.urls.gif} alt="Foto bergerak" className="mx-auto block max-h-[60vh] w-auto rounded-[8px]" />
                ) : null}
                {session.urls.live && session.liveFrames ? <LivePlayer spriteUrl={session.urls.live} frames={session.liveFrames} shots={session.shotCount} className="mx-auto w-full max-w-xs" /> : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {session.urls.shots.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-[10px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`Foto ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                    <span className="absolute right-2 bottom-2 rounded-full bg-black/55 p-1.5 text-white opacity-90"><Download className="size-3.5" /></span>
                  </a>
                ))}
              </div>
            )}
          </div>
          {event.stickersEnabled && session.urls.strip ? (
            <Button variant="sun" size="lg" className="mt-3 w-full" onClick={() => setStickerOpen(true)}>
              <Sticker /> Hias dengan stiker
            </Button>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            {session.urls.strip ? (
              <a href={session.urls.strip} download="photovoks.png" target="_blank" rel="noreferrer">
                <Button variant="primary" size="lg" className="w-full"><Download /> Unduh foto</Button>
              </a>
            ) : null}
            {session.urls.gif ? (
              <a href={session.urls.gif} download="photovoks-live.gif" target="_blank" rel="noreferrer">
                <Button variant="secondary" size="lg" className="w-full"><Film /> Unduh GIF</Button>
              </a>
            ) : null}
          </div>
          {event.printMode !== 'off' ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-surface px-4 py-3 shadow-panel">
              <div className="min-w-0 text-sm">
                {activeJob ? (
                  <span className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-warn" /> {activeJob.status === 'printing' ? 'Sedang dicetak…' : 'Menunggu antrean cetak…'}</span>
                ) : session.printCount > 0 ? (
                  <span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-ok" /> Sudah dicetak {session.printCount}×</span>
                ) : (
                  <span className="text-muted">Cetak di booth</span>
                )}
                <span className="block text-xs text-muted">{event.maxGuestPrints > 0 ? `Dikirim ke printer penyelenggara · sisa ${printsLeft}` : 'Cetak dari HP tidak diizinkan'}</span>
              </div>
              <Button variant="secondary" disabled={!canPrint || queueing} loading={queueing} onClick={() => startPrint('strip', session.urls.strip)}>
                <Printer /> Kirim ke printer
              </Button>
            </div>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {event.aiEnabled ? (
            <section className="rounded-[18px] bg-surface p-5 shadow-panel">
              <div className="mb-4 flex items-center gap-2">
                <Palette className="size-5 text-ink-2" />
                <h2 className="text-base font-extrabold">Ubah gaya foto</h2>
              </div>
              <AiStudio token={token} data={d} refresh={refresh} onPrint={canPrint ? (g: AiGenerationView) => startPrint('ai', g.url, g.id) : undefined} />
            </section>
          ) : null}
          {event.guestbookToken ? (
            <Link href={`/m/${event.guestbookToken}`} className="flex items-center gap-4 rounded-[18px] bg-surface p-5 shadow-panel transition hover:shadow-pop">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white"><MessageSquareText className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">Tulis di buku tamu</span>
                <span className="block text-sm text-muted">Tinggalkan pesan & kesan untuk {event.name}</span>
              </span>
              <ArrowRight className="size-5 text-muted" />
            </Link>
          ) : null}
        </div>
      </div>

      {d.expiresAt ? <p className="mt-8 text-center text-xs text-muted">Foto disimpan sampai {formatDateTime(d.expiresAt)}. Unduh sebelum dihapus otomatis.</p> : null}

      {stickerOpen && session.urls.strip ? (
        <StickerStudio
          imageUrl={session.urls.strip}
          eventStickers={event.stickers}
          canPrint={canPrint}
          printHint={printHint}
          token={token}
          onClose={() => setStickerOpen(false)}
          onQueued={() => void refresh()}
        />
      ) : null}
    </main>
  );
}
