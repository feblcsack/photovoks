'use client';

/**
 * Guest softfile page (opened from the QR on the print) — Y2K "photo passport".
 *  1. The strip prints out of a photo-machine slot ("PHOTOS DELIVERED HERE").
 *  2. A scrapbook passport card with the event details + stamps.
 *  3. Things to do next: stickers, live-wall stickers, minizine, AI, print.
 *
 * Egress: only the strip (or its thumb) loads up front; raw shots + GIF load
 * only when their tab is opened.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Download, Film, ImageIcon, MessageSquareText, Palette, Printer, RotateCcw, Sticker as StickerIcon, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { AiStudio } from '@/components/session/AiStudio';
import { StickerStudio } from '@/components/session/StickerStudio';
import { WallStickerEditor } from '@/components/session/WallStickerEditor';
import { useGuestSession } from '@/components/session/useGuestSession';
import { LivePlayer } from '@/components/gallery/LivePlayer';
import { Doodle, LogoBadge, Logo, PaperClip, PhotoMachineSlot, Stamp, Sticker, Tape } from '@/components/brand/scrap';
import { ZineStudio, type ZinePhoto } from '@/components/zine/ZineStudio';
import { FoldGuide } from '@/components/zine/FoldGuide';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/fetcher';
import type { AiGenerationView, GuestSessionData } from '@/lib/session-types';
import type { WallSticker } from '@/lib/y2k-stickers';
import { cn } from '@/lib/utils';

type View = 'strip' | 'live' | 'shots';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function GuestView({ token, initial }: { token: string; initial: GuestSessionData }) {
  const toast = useToast();
  const { data, refresh } = useGuestSession(token, initial);
  const d = data ?? initial;
  const { session, event } = d;
  const isZine = session.kind === 'zine';
  const [view, setView] = useState<View>('strip');
  const [queueing, setQueueing] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [zineOpen, setZineOpen] = useState(false);
  const [foldOpen, setFoldOpen] = useState(false);
  const [wallStickers, setWallStickers] = useState<WallSticker[]>(d.wallStickers ?? []);
  // Print-out animation: starts once the strip image has decoded.
  const [loaded, setLoaded] = useState(false);
  const [printRun, setPrintRun] = useState(0);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setPrinted(true), 3500);
    return () => clearTimeout(t);
  }, [loaded, printRun]);

  const used = session.printJobs.filter((p) => p.source.startsWith('guest') && p.status !== 'cancelled').reduce((s, p) => s + p.copies, 0);
  const printsLeft = Math.max(0, event.maxGuestPrints - used);
  const canPrint = event.printMode !== 'off' && printsLeft > 0;
  const activeJob = session.printJobs.find((p) => p.status === 'queued' || p.status === 'printing');
  const aspect = session.stripWidth && session.stripHeight ? session.stripWidth / session.stripHeight : 1 / 3;
  const passportNo = session.id.replace(/-/g, '').slice(0, 9).toUpperCase();

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
  const printHint = event.printMode === 'off' ? 'Cetak tidak tersedia di event ini' : printsLeft === 0 ? 'Jatah cetak dari HP sudah habis' : '';

  const zinePhotos = useMemo<ZinePhoto[]>(
    () => [
      ...session.urls.shots.map((u, i) => ({ key: `shot-${i}`, src: u, label: `#${i + 1}` })),
      ...(session.urls.strip && !isZine ? [{ key: 'strip', src: session.urls.strip, label: 'Strip' }] : []),
    ],
    [session.urls.shots, session.urls.strip, isZine],
  );

  const replay = () => {
    setPrinted(false);
    setPrintRun((n) => n + 1);
  };

  return (
    <main className="relative mx-auto min-h-dvh max-w-5xl overflow-x-hidden px-4 pt-[max(16px,env(safe-area-inset-top))] pb-16 sm:px-6">
      {/* Floating doodles */}
      <Doodle kind="stars" className="pointer-events-none absolute top-16 -right-4 w-24 text-brand/70" />
      <Doodle kind="swirl" className="pointer-events-none absolute top-[520px] -left-6 w-24 text-cobalt/50" />

      <header className="relative mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <LogoBadge className="size-14 shrink-0 -rotate-6" />
          <div className="min-w-0">
            <p className="font-type text-[11px] tracking-[0.2em] text-muted uppercase">Photo passport</p>
            <h1 className="truncate text-2xl leading-tight sm:text-3xl">{event.name}</h1>
          </div>
        </div>
        <Stamp rotate={8} className="hidden shrink-0 text-[10px] sm:inline-flex" color="#2747C9">
          <span>{fmtDate(session.createdAt)}</span>
          <span>{fmtTime(session.createdAt)}</span>
        </Stamp>
      </header>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        {/* ── Photo machine ───────────────────────────────────────────── */}
        <section>
          <div className="relative overflow-hidden rounded-[26px] border-2 border-ink bg-brand px-4 pt-6 pb-8 shadow-[5px_5px_0_var(--color-ink)]">
            <span className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(0,0,0,0.25)_1px,transparent_1px)] [background-size:5px_5px]" />
            {view === 'strip' && session.urls.strip ? (
              <PhotoMachineSlot printing={loaded} label={isZine ? 'Zine delivered here' : 'Photos delivered here'} sub="dalam 3 detik">
                <div key={printRun} className={cn(loaded ? 'print-out' : 'translate-y-[-104%]')}>
                  <div className="relative mx-auto w-fit bg-white p-1.5 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.7)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      // An image cached before hydration never fires onLoad → check `complete` too.
                      ref={(el) => {
                        if (el?.complete && el.naturalWidth && !loaded) setTimeout(() => setLoaded(true), 0);
                      }}
                      src={session.urls.strip}
                      alt="Hasil photobooth"
                      onLoad={() => setLoaded(true)}
                      className={cn('block max-h-[62vh] w-auto max-w-full', loaded && 'developing')}
                    />
                    {printed && !isZine
                      ? wallStickers.map((s, i) => (
                          <Sticker key={i} id={s.id} rotate={s.r} className="drop-in absolute" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%`, translate: '-50% -50%' }} />
                        ))
                      : null}
                  </div>
                </div>
              </PhotoMachineSlot>
            ) : (
              <div className="paper-card relative mx-auto max-w-sm rounded-[6px] p-3">
                <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-3" tone="pink" />
                {view === 'live' ? (
                  <div className="flex flex-col gap-4">
                    {session.urls.gif ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={session.urls.gif} alt="Foto bergerak" className="mx-auto block max-h-[60vh] w-auto" />
                    ) : null}
                    {session.urls.live && session.liveFrames ? <LivePlayer spriteUrl={session.urls.live} frames={session.liveFrames} shots={session.shotCount} className="mx-auto w-full max-w-xs" /> : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-1">
                    {session.urls.shots.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className={cn('group relative block bg-white p-1.5 pb-6 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]', i % 2 ? 'rotate-2' : '-rotate-2')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={`Foto ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                        <span className="absolute bottom-1 left-2 font-hand text-sm text-ink-2">#{i + 1}</span>
                        <span className="absolute right-2 bottom-1 text-ink-2"><Download className="size-3.5" /></span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
            {printed && view === 'strip' ? (
              <>
                <Sticker id="sparkle" className="drop-in pointer-events-none absolute top-24 left-3 w-12" rotate={-12} />
                <Sticker id="flash" className="drop-in pointer-events-none absolute right-2 bottom-16 w-16" rotate={10} />
              </>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Segmented<View>
              value={view}
              onChange={(v) => {
                setView(v);
                if (v === 'strip') replay();
              }}
              options={[
                { value: 'strip', label: <><ImageIcon className="size-3.5" /> {isZine ? 'Zine' : 'Foto'}</> },
                ...(session.urls.gif || session.urls.live ? [{ value: 'live' as View, label: <><Film className="size-3.5" /> Live</> }] : []),
                { value: 'shots', label: `Semua (${session.urls.shots.length})` },
              ]}
            />
            {view === 'strip' ? <Button size="sm" variant="ghost" onClick={replay}><RotateCcw /> Cetak ulang</Button> : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {session.urls.strip ? (
              <a href={session.urls.strip} download={isZine ? 'photovoks-zine.jpg' : 'photovoks.jpg'} target="_blank" rel="noreferrer">
                <Button variant="primary" size="lg" className="w-full"><Download /> Unduh foto</Button>
              </a>
            ) : null}
            {session.urls.gif ? (
              <a href={session.urls.gif} download="photovoks-live.gif" target="_blank" rel="noreferrer">
                <Button variant="secondary" size="lg" className="w-full"><Film /> Unduh GIF</Button>
              </a>
            ) : isZine ? (
              <Button variant="secondary" size="lg" className="w-full" onClick={() => setFoldOpen(true)}><BookOpen /> Cara lipat</Button>
            ) : null}
          </div>
        </section>

        {/* ── Passport + actions ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-7">
          <section className="paper-card relative rotate-[0.6deg] rounded-[4px] px-5 pt-6 pb-5 sm:px-7">
            <PaperClip className="-top-5 left-8 rotate-[8deg]" />
            <Tape className="-top-3 -right-5 rotate-[24deg]" tone="blue" />
            <p className="border-b border-ink/20 pb-2 text-center font-type text-[11px] tracking-[0.25em] text-ink-2 uppercase">Photovoks · It takes a village &amp; a half</p>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
              <div className="min-w-0">
                <Field label="Pemegang paspor">
                  <span className="font-hand text-3xl leading-none text-cobalt">Jujurrr udah kalcer!</span>
                </Field>
                <Field label="Event">{event.name}</Field>
                <div className="grid grid-cols-2 gap-x-4">
                  <Field label="Tanggal">{fmtDate(session.createdAt)}</Field>
                  <Field label="Jam">{fmtTime(session.createdAt)}</Field>
                  <Field label="No. paspor">{passportNo}</Field>
                  <Field label={isZine ? 'Jenis' : 'Pose'}>{isZine ? 'MINIZINE' : `${session.shotCount} × KLIK`}</Field>
                </div>
                {session.frameName ? <Field label="Frame">{session.frameName}</Field> : null}
              </div>
              <div className="relative w-24 shrink-0 sm:w-28">
                <div className="rotate-3 bg-white p-1 pb-4 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]">
                  {session.urls.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.urls.thumb} alt="" className="aspect-[3/4] w-full object-cover object-top" />
                  ) : (
                    <div className="aspect-[3/4] w-full bg-ink/10" />
                  )}
                </div>
                <Sticker id="star" className="absolute -right-3 -bottom-3 w-10" rotate={14} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Stamp round rotate={-12} className="size-24 text-[10px]">
                <span className="font-bold">{event.code}</span>
                <span>✶ visa ✶</span>
                <span>{fmtDate(session.createdAt).slice(3)}</span>
              </Stamp>
              <Stamp rotate={6} color="#3F7360" className="text-sm">Approved ✓</Stamp>
              {session.printCount > 0 ? <Stamp rotate={-4} color="#2747C9" className="text-xs">Printed {session.printCount}×</Stamp> : null}
              <Logo size="sm" className="ml-auto w-16 rotate-6 opacity-90" alt="" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <p className="font-type text-xs tracking-[0.2em] text-muted uppercase">Halaman visa · mau ngapain lagi?</p>
            {event.stickersEnabled && session.urls.strip && !isZine ? (
              <Ticket icon={<StickerIcon />} color="bg-bubble" title="Hias dengan stiker" body="Tempel stiker & teks, lalu simpan atau cetak" onClick={() => setStickerOpen(true)} />
            ) : null}
            {event.liveEnabled && session.urls.strip && !isZine ? (
              <Ticket icon={<Tv />} color="bg-sky" title="Tempel ke live wall" body={wallStickers.length ? `${wallStickers.length} stiker sudah tertempel — ubah?` : 'Fotomu tampil di layar kulkas event, lengkap dengan stiker Y2K'} onClick={() => setWallOpen(true)} />
            ) : null}
            {event.zineEnabled && !isZine ? (
              <Ticket icon={<BookOpen />} color="bg-lime" title="Bikin minizine" body="8 halaman dari 1 lembar kertas — pakai foto ini atau foto baru dari HP" onClick={() => setZineOpen(true)} />
            ) : null}
            {event.printMode !== 'off' ? (
              <div className="flex items-center justify-between gap-3 rounded-[18px] border-2 border-ink bg-surface px-4 py-3 shadow-[3px_3px_0_var(--color-ink)]">
                <div className="min-w-0 text-sm">
                  {activeJob ? (
                    <span className="flex items-center gap-2 font-bold"><Clock className="size-4 text-warn" /> {activeJob.status === 'printing' ? 'Sedang dicetak…' : 'Menunggu antrean cetak…'}</span>
                  ) : session.printCount > 0 ? (
                    <span className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-ok" /> Sudah dicetak {session.printCount}×</span>
                  ) : (
                    <span className="font-bold">Cetak di booth</span>
                  )}
                  <span className="block font-type text-xs text-muted">{event.maxGuestPrints > 0 ? `Ke printer penyelenggara · sisa ${printsLeft}` : 'Cetak dari HP tidak diizinkan'}</span>
                </div>
                <Button variant="sun" disabled={!canPrint || queueing} loading={queueing} onClick={() => void queuePrint('strip')}>
                  <Printer /> Cetak
                </Button>
              </div>
            ) : null}
            {event.guestbookToken ? (
              <Link href={`/m/${event.guestbookToken}`} className="contents">
                <Ticket icon={<MessageSquareText />} color="bg-sun" title="Tulis di buku tamu" body={`Tinggalkan pesan & kesan untuk ${event.name}`} />
              </Link>
            ) : null}
          </section>

          {event.aiEnabled && !isZine ? (
            <section className="rounded-[20px] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)]">
              <div className="mb-4 flex items-center gap-2">
                <Palette className="size-5 text-cobalt" />
                <h2 className="font-display text-xl">Ubah gaya foto</h2>
              </div>
              <AiStudio token={token} data={d} refresh={refresh} onPrint={canPrint ? (g: AiGenerationView) => g.url && void queuePrint('ai', g.id) : undefined} />
            </section>
          ) : null}
        </div>
      </div>

      <footer className="mt-12 flex flex-col items-center gap-2 text-center">
        <Logo size="sm" className="w-20" alt="" />
        {d.expiresAt ? <p className="font-type text-xs text-muted">Foto disimpan sampai {fmtDate(d.expiresAt)}. Unduh sebelum dihapus otomatis.</p> : null}
      </footer>

      {stickerOpen && session.urls.strip ? (
        <StickerStudio imageUrl={session.urls.strip} eventStickers={event.stickers} canPrint={canPrint} printHint={printHint} token={token} onClose={() => setStickerOpen(false)} onQueued={() => void refresh()} />
      ) : null}
      {wallOpen && (session.urls.thumb || session.urls.strip) ? (
        <WallStickerEditor open={wallOpen} onOpenChange={setWallOpen} token={token} imageUrl={(session.urls.thumb || session.urls.strip)!} aspect={aspect} initial={wallStickers} onSaved={setWallStickers} />
      ) : null}
      {zineOpen ? <ZineStudio photos={zinePhotos} title={event.name} subtitle={`${event.name} · ${fmtDate(session.createdAt)}\nmade at photovoks ✶`} onClose={() => setZineOpen(false)} /> : null}
      <Dialog open={foldOpen} onOpenChange={setFoldOpen} title="Cara melipat minizine" size="md">
        <FoldGuide />
      </Dialog>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-ink/15 py-1.5">
      <p className="font-type text-[9px] tracking-[0.2em] text-muted uppercase">{label}</p>
      <div className="truncate font-type text-[15px] text-ink">{children}</div>
    </div>
  );
}

function Ticket({ icon, color, title, body, onClick }: { icon: React.ReactNode; color: string; title: string; body: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-stretch overflow-hidden rounded-[18px] border-2 border-ink bg-surface text-left shadow-[3px_3px_0_var(--color-ink)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
      <span className={cn('flex w-16 shrink-0 items-center justify-center border-r-2 border-dashed border-ink [&_svg]:size-6', color)}>{icon}</span>
      <span className="min-w-0 flex-1 px-4 py-3">
        <span className="block font-display text-lg leading-tight">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{body}</span>
      </span>
      <span className="flex items-center pr-4 text-ink-2 transition group-hover:translate-x-1"><ArrowRight className="size-5" /></span>
    </button>
  );
}
