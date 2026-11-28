'use client';

/**
 * Guest softfile page (opened from the QR on the print) — "Photovoks 98"
 * desktop with the guest's buddy as guide:
 *  1. Foto_kamu.jpg — the strip prints out of a photo-machine slot.
 *  2. Paspor.txt — scrapbook passport card with the event details + stamps.
 *  0. SKCK.exe — the "Surat Keterangan Cukup Kalcer" photozine (headline feature).
 *  3. Mau ngapain lagi? — stickers, live wall, minizine, print, guestbook, AI.
 *     TebakLagu.exe — guess the mystery song, win a voucher.
 *  4. Lokasi — postcard with a live map of the venue (UI Depok).
 *  5. Dot-matrix footer.
 * The buddy comes from the booth (?b=…) or is chosen here once (stored on the
 * phone).
 *
 * Egress: only the strip (or its thumb) loads up front; raw shots + GIF load
 * only when their tab is opened.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp, BookOpen, CheckCircle2, Clock, Download, Film, ImageIcon, Palette, Printer, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Buddy } from '@/components/os/Buddy';
import { CharacterSelect } from '@/components/os/CharacterSelect';
import { HillsWallpaper, PixelIcon, WinPanel, WinWindow } from '@/components/os/retro';
import { DotsFooter } from '@/components/brand/DotsFooter';
import { LocationCard } from '@/components/location/LocationCard';
import { BUDDY_STORAGE_KEY, isMascotId, randomMascot, type MascotId } from '@/lib/mascots';
import { LOCATION } from '@/lib/location';
import type { PixelIconName } from '@/lib/pixel-icons';
import { useToast } from '@/components/ui/toast';
import { AiStudio } from '@/components/session/AiStudio';
import { StickerStudio } from '@/components/session/StickerStudio';
import { WallStickerEditor } from '@/components/session/WallStickerEditor';
import { useGuestSession } from '@/components/session/useGuestSession';
import { LivePlayer } from '@/components/gallery/LivePlayer';
import { LogoBadge, Logo, PaperClip, PhotoMachineSlot, Stamp, Sticker, Tape } from '@/components/brand/scrap';
import { ZineStudio, type ZinePhoto } from '@/components/zine/ZineStudio';
import { FoldGuide } from '@/components/zine/FoldGuide';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/fetcher';
import type { AiGenerationView, GuestSessionData } from '@/lib/session-types';
import type { WallSticker } from '@/lib/y2k-stickers';
import { cn } from '@/lib/utils';
import { variant } from '@/lib/media-variant';
import { BikunProgress } from '@/components/brand/BikunProgress';
import { SkckPromo } from '@/components/skck/SkckPromo';
import { SkckStudio } from '@/components/skck/SkckStudio';
import { GuestSongGame } from '@/components/song/GuestSongGame';
import { BikunDrive, PlanePath, RektoratScene } from '@/components/brand/campus';

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
  const [simOpen, setSimOpen] = useState(false);
  // Stable across polls (same URLs → same array) so the SKCK studio doesn't reload photos.
  const shotsKey = d.session.urls.shots.join('|');
  const simPhotos = useMemo(() => (shotsKey ? shotsKey.split('|') : []).map((u, i) => ({ key: `shot-${i}`, src: variant(u, { w: 1080 }) })), [shotsKey]);
  const [wallStickers, setWallStickers] = useState<WallSticker[]>(d.wallStickers ?? []);
  // Print-out animation: starts once the strip image has decoded.
  const [loaded, setLoaded] = useState(false);
  const [printRun, setPrintRun] = useState(0);
  const [printed, setPrinted] = useState(false);
  // Buddy: from the booth link (?b=), else remembered on this phone, else ask.
  const [buddy, setBuddy] = useState<MascotId | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [guideMoment, setGuideMoment] = useState<'guest' | 'guest-tools'>('guest');
  useEffect(() => {
    let id: MascotId | null = null;
    const fromLink = new URLSearchParams(window.location.search).get('b');
    try {
      if (isMascotId(fromLink)) localStorage.setItem(BUDDY_STORAGE_KEY, fromLink);
      const stored = localStorage.getItem(BUDDY_STORAGE_KEY);
      id = isMascotId(fromLink) ? fromLink : isMascotId(stored) ? stored : null;
    } catch {
      id = isMascotId(fromLink) ? fromLink : null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state once
    if (id) setBuddy(id);
    else setChoosing(true);
  }, []);
  const pickBuddy = (id: MascotId) => {
    try {
      localStorage.setItem(BUDDY_STORAGE_KEY, id);
    } catch {
      /* private mode */
    }
    setBuddy(id);
    setChoosing(false);
  };
  useEffect(() => {
    if (!printed) return;
    const t = setTimeout(() => setGuideMoment('guest-tools'), 14_000);
    return () => clearTimeout(t);
  }, [printed]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setPrinted(true), 3500);
    return () => clearTimeout(t);
  }, [loaded, printRun]);
  // Bikun progress: the bus leaves Stasiun UI when the print starts and
  // arrives at the Rektorat when it's done (same 3.5 s as the print-out).
  const [ride, setRide] = useState(0);
  useEffect(() => {
    if (!loaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the ride for each print run
    setRide(0);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setRide(100)));
    return () => cancelAnimationFrame(raf);
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

  const viewTab = (v: View, label: React.ReactNode) => (
    <button
      type="button"
      onClick={() => {
        setView(v);
        if (v === 'strip') replay();
      }}
      className={cn('flex h-9 items-center gap-1.5 px-3 font-pixel text-[14px]', view === v ? 'bevel-in -mb-[3px] bg-win-light font-bold' : 'bevel-out bg-win')}
    >
      {label}
    </button>
  );

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="fixed inset-0 -z-10">
        <HillsWallpaper />
        {/* UI Depok campus on the horizon (large screens; phones get the strip below) */}
        <PlanePath className="absolute top-[5%] right-[3%] hidden w-[min(34vw,460px)] xl:block" label="Universitas Indonesia" />
        <RektoratScene compact className="absolute right-[1%] bottom-0 hidden w-[min(19vw,300px)] xl:block" />
      </div>

      <main className="relative mx-auto max-w-5xl px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        {/* Title bar */}
        <header className="bevel-out mb-4 flex items-center gap-3 bg-win p-1.5 pr-3">
          <span className="win-title flex min-w-0 flex-1 items-center gap-2 self-stretch px-2 py-1.5 text-white">
            <LogoBadge className="size-9 shrink-0" />
            <span className="min-w-0">
              <span className="block font-pixel text-[11px] tracking-[0.18em] uppercase opacity-85">Paspor foto · Photovoks 98</span>
              <span className="block truncate font-display text-xl leading-tight sm:text-2xl">{event.name}</span>
            </span>
          </span>
          <Stamp rotate={8} className="hidden shrink-0 text-[10px] sm:inline-flex" color="#2747C9">
            <span>{fmtDate(session.createdAt)}</span>
            <span>{fmtTime(session.createdAt)}</span>
          </Stamp>
        </header>

        {/* ── SKCK: the headline gimmick ────────────────────────────────── */}
        {session.urls.shots.length ? (
          <SkckPromo className="mb-5" onOpen={() => setSimOpen(true)} thumbs={session.urls.shots.slice(0, 3).map((u) => variant(u, { w: 160 }))} />
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          {/* ── Foto_kamu.jpg ───────────────────────────────────────────── */}
          <WinWindow title={isZine ? 'Zine_kamu.jpg' : 'Foto_kamu.jpg'} icon="camera" bodyClassName="p-2" status={<><span>{session.shotCount} pose</span><span className="bevel-in ml-auto px-1.5">{fmtDate(session.createdAt)}</span></>}>
            <div className="flex gap-1 px-1 pt-1">
              {viewTab('strip', <><ImageIcon className="size-4" /> {isZine ? 'Zine' : 'Foto'}</>)}
              {session.urls.gif || session.urls.live ? viewTab('live', <><Film className="size-4" /> Live</>) : null}
              {viewTab('shots', `Semua (${session.urls.shots.length})`)}
            </div>
            <div className="bevel-in relative overflow-hidden bg-brand px-4 pt-6 pb-8">
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
                        src={variant(session.urls.strip, { w: 1080 })}
                        alt="Hasil photobooth"
                        onLoad={() => setLoaded(true)}
                        className={cn('block max-h-[62vh] w-auto max-w-full', loaded && 'developing')}
                      />
                      {printed && !isZine
                        ? wallStickers.map((st, i) => (
                            <Sticker key={i} id={st.id} rotate={st.r} className="drop-in absolute" style={{ left: `${st.x * 100}%`, top: `${st.y * 100}%`, width: `${st.s * 100}%`, translate: '-50% -50%' }} />
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
                        <img src={variant(session.urls.gif, { w: 720 })} alt="Foto bergerak" className="mx-auto block max-h-[60vh] w-auto" />
                      ) : null}
                      {session.urls.live && session.liveFrames ? <LivePlayer spriteUrl={session.urls.live} frames={session.liveFrames} shots={session.shotCount} className="mx-auto w-full max-w-xs" /> : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 p-1">
                      {session.urls.shots.map((u, i) => (
                        <a key={u} href={variant(u, { download: `photovoks-foto-${i + 1}.jpg` })} target="_blank" rel="noreferrer" className={cn('group relative block bg-white p-1.5 pb-6 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]', i % 2 ? 'rotate-2' : '-rotate-2')}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={variant(u, { w: 480 })} alt={`Foto ${i + 1}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
                          <span className="absolute bottom-1 left-2 font-pixel text-[12px] text-ink-2">Foto_{String(i + 1).padStart(2, '0')}.jpg</span>
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

            {view === 'strip' && session.urls.strip ? (
              <WinPanel className="mt-2 px-2 pt-2 pb-1">
                <BikunProgress
                  value={loaded ? ride : null}
                  durationMs={3400}
                  label={loaded ? (isZine ? 'Bikun mengantar zine-mu ke Rektorat…' : 'Bikun mengantar fotomu ke Rektorat…') : 'Bikun menjemput fotomu di Stasiun UI…'}
                  done={<span className="flex items-center gap-1 text-ok"><CheckCircle2 className="size-3.5" /> Sampai di Rektorat — {isZine ? 'zine' : 'foto'}mu siap!</span>}
                />
              </WinPanel>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              {session.urls.strip ? (
                <a href={variant(session.urls.strip, { download: isZine ? 'photovoks-zine.jpg' : 'photovoks.jpg' })} download={isZine ? 'photovoks-zine.jpg' : 'photovoks.jpg'} target="_blank" rel="noreferrer">
                  <Button variant="win-go" size="lg" className="w-full"><Download /> Unduh foto</Button>
                </a>
              ) : null}
              {session.urls.gif ? (
                <a href={variant(session.urls.gif, { download: 'photovoks-live.gif' })} download="photovoks-live.gif" target="_blank" rel="noreferrer">
                  <Button variant="win" size="lg" className="w-full"><Film /> Unduh GIF</Button>
                </a>
              ) : isZine ? (
                <Button variant="win" size="lg" className="w-full" onClick={() => setFoldOpen(true)}><BookOpen /> Cara lipat</Button>
              ) : view === 'strip' ? (
                <Button variant="win" size="lg" className="w-full" onClick={replay}><RotateCcw /> Cetak ulang</Button>
              ) : null}
            </div>
          </WinWindow>

          <div className="flex min-w-0 flex-col gap-5">
            {/* ── Paspor.txt ─────────────────────────────────────────────── */}
            <WinWindow title="Paspor.txt" icon="book" bodyClassName="bg-[#9ED8FF] p-3 pt-6 sm:p-5 sm:pt-7 [background-image:radial-gradient(rgb(39_71_201/0.25)_1px,transparent_1px)] [background-size:10px_10px]">
              <section className="paper-card relative rotate-[0.6deg] rounded-[4px] px-5 pt-6 pb-5 sm:px-7">
                <PaperClip className="-top-5 left-8 rotate-[8deg]" />
                <Tape className="-top-3 -right-5 rotate-[24deg]" tone="blue" />
                <p className="border-b border-ink/20 pb-2 text-center font-type text-[11px] tracking-[0.25em] text-ink-2">Photovoks · SBB · Semarak Bazaar BC! </p>

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
                    <Field label="Lokasi">{LOCATION.name.toUpperCase()}</Field>
                    {session.frameName ? <Field label="Frame">{session.frameName}</Field> : null}
                  </div>
                  <div className="relative w-24 shrink-0 sm:w-28">
                    <div className="rotate-3 bg-white p-1 pb-4 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)]">
                      {session.urls.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={variant(session.urls.thumb, { w: 320 })} alt="" className="aspect-[3/4] w-full object-cover object-top" />
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
            </WinWindow>

            {/* ── Mau ngapain lagi? ──────────────────────────────────────── */}
            <WinWindow title="Mau ngapain lagi?" icon="folder" menu={['File', 'Edit', 'Lihat', 'Bantuan']} bodyClassName="p-2" status={<span>Ketuk salah satu untuk membuka</span>}>
              <WinPanel className="flex flex-col gap-1 p-1">
                {session.urls.shots.length ? (
                  <ActionRow icon="star" title="Bikin SKCK — Surat Keterangan Cukup Kalcer" body="Photozine lipat dari fotomu: pas foto, sidik kalcer & stempel lulus. Fitur unggulan!" onClick={() => setSimOpen(true)} />
                ) : null}
                {event.stickersEnabled && session.urls.strip && !isZine ? (
                  <ActionRow icon="star" title="Hias dengan stiker" body="Tempel stiker & teks, lalu simpan atau cetak" onClick={() => setStickerOpen(true)} />
                ) : null}
                {event.liveEnabled && session.urls.strip && !isZine ? (
                  <ActionRow icon="tv" title="Tempel ke live wall" body={wallStickers.length ? `${wallStickers.length} stiker sudah tertempel — ubah?` : 'Fotomu tampil di layar kulkas event, lengkap dengan stiker Y2K'} onClick={() => setWallOpen(true)} />
                ) : null}
                {event.zineEnabled && !isZine ? (
                  <ActionRow icon="book" title="Bikin minizine" body="8 halaman dari 1 lembar kertas — pakai foto ini atau foto baru dari HP" onClick={() => setZineOpen(true)} />
                ) : null}
                {event.guestbookToken ? (
                  <Link href={`/m/${event.guestbookToken}`} className="contents">
                    <ActionRow icon="info" title="Tulis di buku tamu" body={`Tinggalkan pesan & kesan untuk ${event.name}`} />
                  </Link>
                ) : null}
                <ActionRow icon="pin" title="Lihat lokasi" body={`${LOCATION.name}, ${LOCATION.area}`} onClick={() => document.getElementById('lokasi')?.scrollIntoView({ behavior: 'smooth' })} />
              </WinPanel>
              {event.printMode !== 'off' ? (
                <div className="bevel-in mt-2 flex items-center justify-between gap-3 bg-win-light px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3 text-sm">
                    <PixelIcon name="printer" className="size-8" />
                    <div className="min-w-0">
                      {activeJob ? (
                        <span className="flex items-center gap-2 font-bold"><Clock className="size-4 text-warn" /> {activeJob.status === 'printing' ? 'Sedang dicetak…' : 'Menunggu antrean cetak…'}</span>
                      ) : session.printCount > 0 ? (
                        <span className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-ok" /> Sudah dicetak {session.printCount}×</span>
                      ) : (
                        <span className="font-bold">Cetak di booth</span>
                      )}
                      <span className="block font-pixel text-xs text-ink-2">{event.maxGuestPrints > 0 ? `Ke printer penyelenggara · sisa ${printsLeft}` : 'Cetak dari HP tidak diizinkan'}</span>
                    </div>
                  </div>
                  <Button variant="win-go" disabled={!canPrint || queueing} loading={queueing} onClick={() => void queuePrint('strip')}>
                    <Printer /> Cetak
                  </Button>
                </div>
              ) : null}
            </WinWindow>

            <GuestSongGame token={token} />

            {event.aiEnabled && !isZine ? (
              <WinWindow title="Ubah gaya.exe" icon={<Palette className="size-4" />} bodyClassName="p-4">
                <AiStudio token={token} data={d} refresh={refresh} onPrint={canPrint ? (g: AiGenerationView) => g.url && void queuePrint('ai', g.id) : undefined} />
              </WinWindow>
            ) : null}
          </div>
        </div>

        {/* ── Salam dari kampus ─────────────────────────────────────────── */}
        <section className="mt-5" aria-label="Kampus UI Depok">
          <WinWindow title="Kampus_UI.bmp" icon="tv" bodyClassName="relative h-[240px] overflow-hidden bg-[linear-gradient(#9ED8FF,#DDF3FF_70%)] sm:h-[270px]">
            <PlanePath className="absolute top-2 left-[4%] w-[min(70%,440px)]" label="Universitas Indonesia" />
            <RektoratScene compact className="absolute right-[6%] bottom-[52px] w-[140px] sm:right-[12%] sm:w-[180px]" />
            <p className="absolute bottom-[90px] left-4 max-w-[52%] rotate-[-2deg] bg-white/85 px-2 py-1 font-hand text-[clamp(18px,4.5vw,26px)] leading-tight text-ink shadow-[2px_2px_0_var(--color-ink)]">
              Salam dari Depok! Naik bikun, foto, pulang bawa kenangan ✶
            </p>
            <BikunDrive className="bottom-0 h-[64px]" speed={14} />
          </WinWindow>
        </section>

        {/* ── Lokasi ─────────────────────────────────────────────────────── */}
        <section id="lokasi" className="mt-5 scroll-mt-4">
          <WinWindow title="Lokasi — UI Depok" icon="pin" bodyClassName="bg-[#9ED8FF] p-3 sm:p-5 [background-image:radial-gradient(rgb(39_71_201/0.25)_1px,transparent_1px)] [background-size:10px_10px]">
            <LocationCard eventName={event.name} dateLabel={fmtDate(session.createdAt)} />
          </WinWindow>
        </section>
      </main>

      <DotsFooter>
        <div className="mx-auto grid max-w-5xl gap-8 px-5 pt-6 pb-4 sm:grid-cols-[1.3fr_1fr_1fr] sm:px-8">
          <div>
            <div className="flex items-center gap-3">
              <LogoBadge className="size-14 -rotate-6" />
              <p className="font-display text-3xl leading-none">photovoks</p>
            </div>
            <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-[#FBF5E6]/85">Photobooth event dari browser. Foto, cetak, tempel stiker, bikin zine — semua dari satu QR.</p>
            {d.expiresAt ? <p className="mt-3 inline-block rounded-full border-2 border-[#FBF5E6] px-3 py-1 font-pixel text-[12px]">Disimpan sampai {fmtDate(d.expiresAt)}</p> : null}
          </div>
          <nav className="flex flex-col gap-2 font-pixel text-[15px]">
            <p className="text-[11px] tracking-[0.25em] text-lime uppercase">Pintasan</p>
            {session.urls.strip ? <a href={session.urls.strip} download target="_blank" rel="noreferrer" className="hover:underline">↓ Unduh foto</a> : null}
            {session.urls.gif ? <a href={session.urls.gif} download target="_blank" rel="noreferrer" className="hover:underline">↓ Unduh GIF</a> : null}
            {event.guestbookToken ? <Link href={`/m/${event.guestbookToken}`} className="hover:underline">✎ Buku tamu</Link> : null}
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-1 text-left hover:underline"><ArrowUp className="size-4" /> Kembali ke atas</button>
          </nav>
          <div className="font-pixel text-[15px]">
            <p className="text-[11px] tracking-[0.25em] text-lime uppercase">Lokasi</p>
            <p className="mt-2">{LOCATION.name}</p>
            <p className="text-[#FBF5E6]/80">{LOCATION.area}</p>
            <a href="#lokasi" className="mt-2 inline-flex items-center gap-1 hover:underline">Lihat peta <ArrowRight className="size-4" /></a>
          </div>
        </div>
        <p className="overflow-hidden px-3 text-center font-display text-[clamp(64px,19vw,220px)] leading-[0.85] whitespace-nowrap text-[#FBF5E6]/95 select-none">photovoks</p>
        <p className="pt-2 text-center font-pixel text-[12px] text-[#FBF5E6]/75">© 2026 · dibuat tulus dari Depok ✶</p>
      </DotsFooter>

      {buddy && !choosing ? <Buddy id={buddy} moment={guideMoment} side="right" className="bottom-[calc(env(safe-area-inset-bottom)+12px)]" onChangeBuddy={() => setChoosing(true)} /> : null}
      {choosing ? (
        <CharacterSelect
          initial={buddy ?? undefined}
          subtitle="Pilih pemandu yang menemanimu di halaman ini"
          onPick={pickBuddy}
          onBack={() => pickBuddy(buddy ?? randomMascot())}
          className="z-50"
        />
      ) : null}

      {stickerOpen && session.urls.strip ? (
        <StickerStudio imageUrl={session.urls.strip} eventStickers={event.stickers} libraryStickers={event.libraryStickers} canPrint={canPrint} printHint={printHint} token={token} onClose={() => setStickerOpen(false)} onQueued={() => void refresh()} />
      ) : null}
      {wallOpen && (session.urls.thumb || session.urls.strip) ? (
        <WallStickerEditor open={wallOpen} onOpenChange={setWallOpen} token={token} imageUrl={(session.urls.thumb || session.urls.strip)!} aspect={aspect} initial={wallStickers} onSaved={setWallStickers} />
      ) : null}
      {simOpen ? (
        <SkckStudio
          photos={simPhotos}
          eventName={event.name}
          seed={session.id}
          qrValue={typeof window !== 'undefined' ? `${window.location.origin}/s/${token}` : `/s/${token}`}
          onClose={() => setSimOpen(false)}
        />
      ) : null}
      {zineOpen ? <ZineStudio photos={zinePhotos} title={event.name} subtitle={`${event.name} · ${fmtDate(session.createdAt)}\nmade at photovoks ✶`} onClose={() => setZineOpen(false)} libraryStickers={event.libraryStickers} /> : null}
      <Dialog win winIcon={<PixelIcon name="book" className="size-4" />} open={foldOpen} onOpenChange={setFoldOpen} title="Cara melipat minizine" size="md">
        <FoldGuide />
      </Dialog>
    </div>
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

function ActionRow({ icon, title, body, onClick }: { icon: PixelIconName; title: string; body: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 px-2 py-2 text-left hover:bg-win-select hover:text-white focus-visible:bg-win-select focus-visible:text-white">
      <PixelIcon name={icon} className="size-9" />
      <span className="min-w-0 flex-1">
        <span className="block font-pixel text-[16px] leading-tight font-bold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-2 group-hover:text-white/85">{body}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 transition group-hover:translate-x-1" />
    </button>
  );
}
