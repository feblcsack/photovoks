'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize, Minimize } from 'lucide-react';
import type { GuestbookEntryView, LiveItem } from '@/lib/community';
import type { LiveTheme } from '@/lib/events';
import type { WallSticker } from '@/lib/y2k-stickers';
import { LogoBadge, Magnet, PaperClip, PhotoMachineSlot, Sticker } from '@/components/brand/scrap';
import { cn } from '@/lib/utils';
import { PixelIcon, Taskbar, TaskItem } from '@/components/os/retro';
import { LOCATION } from '@/lib/location';
import { variant } from '@/lib/media-variant';
import { WordArt } from '@/components/brand/WordArt';

const POLL_MS = 5000;
const FULL_REFRESH_MS = 30 * 60 * 1000; // resync order/hidden items (media URLs never expire)
const SPOTLIGHT_MS = 7000;
const MESSAGE_MS = 8000;
const noopSubscribe = () => () => {};

function merge<T extends { id: string }>(fresh: T[], old: T[], max: number): T[] {
  const seen = new Set(fresh.map((x) => x.id));
  return [...fresh, ...old.filter((x) => !seen.has(x.id))].slice(0, max);
}

/**
 * Full-screen wall for a projector / TV. New sessions appear within a few
 * seconds (polling — works behind any network without websockets).
 */
export function LiveWall({ token, eventName, initialItems, initialMessages, guestbook, theme = 'silver', pollMs = POLL_MS }: { token: string; eventName: string; initialItems: LiveItem[]; initialMessages: GuestbookEntryView[]; guestbook: boolean; theme?: LiveTheme; pollMs?: number }) {
  const [items, setItems] = useState(initialItems);
  const [messages, setMessages] = useState(initialMessages);
  const [spot, setSpot] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [full, setFull] = useState(false);
  const lastFull = useRef(0);
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');

  const poll = useCallback(async () => {
    const needFull = Date.now() - lastFull.current > FULL_REFRESH_MS;
    const params = new URLSearchParams();
    if (!needFull) {
      if (items[0]) params.set('after', items[0].at);
      if (messages[0]) params.set('msgAfter', messages[0].createdAt);
      params.set('ids', items.slice(0, 30).map((x) => x.id).join(','));
    }
    try {
      const res = await fetch(`/api/live/${token}?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: LiveItem[]; messages: GuestbookEntryView[]; stickers?: Record<string, WallSticker[]> };
      setOffline(false);
      if (data.stickers && !needFull) {
        const st = data.stickers;
        setItems((old) => {
          let changed = false;
          const next = old.map((it) => {
            const fresh = st[it.id] ?? [];
            if (JSON.stringify(fresh) === JSON.stringify(it.stickers ?? [])) return it;
            changed = true;
            return { ...it, stickers: fresh };
          });
          return changed ? next : old;
        });
      }
      if (needFull) {
        lastFull.current = Date.now();
        setItems(data.items);
        setMessages(data.messages);
        return;
      }
      if (data.items.length) {
        setItems((old) => merge(data.items, old, 60));
        setSpot(0);
        setFresh(data.items[0].id);
      }
      if (data.messages.length) {
        setMessages((old) => merge(data.messages, old, 40));
        setMsgIdx(0);
      }
    } catch {
      setOffline(true);
    }
  }, [items, messages, token]);

  useEffect(() => {
    if (!lastFull.current) lastFull.current = Date.now();
    const t = setInterval(() => {
      if (!document.hidden) void poll();
    }, pollMs);
    return () => clearInterval(t);
  }, [poll, pollMs]);

  // Rotate the spotlight through the newest few when nothing new arrives.
  useEffect(() => {
    const t = setInterval(() => {
      setFresh(null);
      setSpot((i) => (items.length ? (i + 1) % Math.min(items.length, 8) : 0));
    }, SPOTLIGHT_MS);
    return () => clearInterval(t);
  }, [items.length]);

  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % Math.min(messages.length, 12)), MESSAGE_MS);
    return () => clearInterval(t);
  }, [messages.length]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const current = items[spot] ?? items[0] ?? null;
  const rest = items.filter((x) => x.id !== current?.id).slice(0, 12);
  const msg = messages[msgIdx] ?? null;
  const dark = theme === 'red' || theme === 'green' || theme === 'maroon';

  return (
    <main className={cn('relative flex h-dvh flex-col overflow-hidden', `fridge-${theme}`, dark ? 'text-white' : 'text-ink')}>
      {/* Fridge door details: freezer seam + chrome handle */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[9%] h-[3px] bg-black/15 shadow-[0_1px_0_rgba(255,255,255,0.35)]" />
      <span aria-hidden className="pointer-events-none absolute top-[16%] right-3 bottom-[16%] w-4 rounded-full bg-[linear-gradient(90deg,#8c9097,#f4f5f7_40%,#a7abb2_70%,#e2e4e7)] shadow-[2px_4px_8px_rgba(0,0,0,0.35)]" />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-6 px-8 pt-5 pb-3">
        <div className="flex min-w-0 items-center gap-4">
          <LogoBadge className="size-16 shrink-0 -rotate-6" />
          {/* Label-maker tape */}
          <div className="min-w-0 rotate-[-1.5deg] bg-ink px-4 py-1.5 shadow-[2px_3px_0_rgba(0,0,0,0.3)]">
            <h1 className="truncate font-type !font-normal text-[clamp(20px,2.6vw,36px)] tracking-[0.12em] text-white uppercase">{eventName}</h1>
          </div>
          <span className={cn('flex shrink-0 items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1 font-type text-xs font-bold tracking-[0.2em] text-ink uppercase')}>
            <span className={cn('size-2.5 rounded-full', offline ? 'bg-ink/30' : 'animate-pulse bg-brand')} /> {offline ? 'Menyambung…' : 'Live'}
          </span>
        </div>
        <div className="mr-6 flex items-center gap-4">
          <p className="hidden font-type text-sm sm:block">{items.length} foto</p>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
            className="bevel-out flex size-10 items-center justify-center bg-win text-ink hover:bg-sun active:bevel-in"
            aria-label={full ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </header>

      {items.length ? (
        <div className="relative z-10 grid min-h-0 flex-1 gap-6 px-8 pr-14 pb-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
          {/* Spotlight: newest photo prints out of the machine slot */}
          <div className="relative flex min-h-0 flex-col items-center justify-start pt-2">
            {current ? (
              <PhotoMachineSlot key={current.id} printing trayClassName="flex w-full justify-center" label="Photos delivered here" sub="in 3 seconds">
                <div className="print-out pb-6">
                  <Pinned item={current} big fresh={fresh === current.id} />
                </div>
              </PhotoMachineSlot>
            ) : null}
          </div>
          {/* Collage */}
          <div className="hidden min-h-0 grid-cols-3 content-start gap-x-4 gap-y-6 overflow-hidden pt-4 lg:grid xl:grid-cols-4">
            {rest.map((it) => (
              <div key={it.id} className="flex items-start justify-center">
                <Pinned item={it} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <Sticker id="camera" className="w-28 animate-float" />
          <WordArt variant="sky" className="text-[clamp(40px,6vw,72px)]">Kulkas masih kosong!</WordArt>
          <p className="font-type opacity-70">Foto dari booth ditempel di sini beberapa detik setelah selesai.</p>
        </div>
      )}

      {guestbook ? (
        <footer className="relative z-10 mx-8 mr-14 mb-5 flex shrink-0 rotate-[-0.5deg] items-center gap-6 border-2 border-ink bg-[#FFFDF5] px-6 py-3 text-ink shadow-[4px_4px_0_rgba(0,0,0,0.35)] [background-image:repeating-linear-gradient(transparent_0_27px,rgba(39,71,201,0.15)_27px_28px)]">
          <Magnet className="-top-3 left-6" color="#2747C9" />
          <Magnet className="-top-3 right-6" color="#C4201A" />
          <div className="min-w-0 flex-1">
            {msg ? (
              <p key={msg.id} className="animate-fade-in truncate font-hand text-[clamp(20px,2vw,30px)] leading-tight">
                <span className="text-brand">{msg.name}:</span> <span>{msg.message}</span>
              </p>
            ) : (
              <p className="font-hand text-2xl text-muted">Belum ada pesan. Scan QR untuk menulis di buku tamu ✎</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="text-right font-type text-sm leading-tight">Tulis pesan<br />&amp; kesan</p>
            <div className="border-2 border-ink bg-white p-1.5"><QRCodeSVG value={`${origin}/m/${token}`} size={72} marginSize={0} /></div>
          </div>
        </footer>
      ) : null}

      {/* Retro OS taskbar along the bottom of the fridge */}
      <Taskbar className="relative z-10 text-ink" tray={<><PixelIcon name="pin" className="size-4" /><span className="hidden lg:inline">{LOCATION.name}</span></>}>
        <TaskItem icon="tv" active>Live wall</TaskItem>
        <TaskItem icon="folder">{items.length} foto</TaskItem>
        {guestbook ? <TaskItem icon="book">Buku tamu</TaskItem> : null}
      </Taskbar>
    </main>
  );
}

/** Deterministic pseudo-random numbers from an id (stable layout between polls). */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (n: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ n;
    return ((h >>> 0) % 1000) / 1000;
  };
}

const DECOR = ['sparkle', 'star', 'heart', 'cherry', 'smiley', 'butterfly', 'daisy', 'cd', 'bow'];
const MAGNETS = ['#C4201A', '#2747C9', '#FF9BD2', '#C9F25C', '#FFD43B'];

/** One print stuck on the fridge, with its fastener + the guest's stickers. */
function Pinned({ item, big = false, fresh = false }: { item: LiveItem; big?: boolean; fresh?: boolean }) {
  const r = seeded(item.id);
  const rot = big ? (r(1) - 0.5) * 5 : (r(1) - 0.5) * 12;
  const fastener = Math.floor(r(2) * 4);
  const decor = !big && r(3) > 0.55 ? DECOR[Math.floor(r(4) * DECOR.length)] : null;
  // Resized WebP variants: the projector never needs the 300-DPI print file.
  const src = big ? (item.gif ? variant(item.gif, { w: 720 }) : variant(item.strip ?? item.thumb, { w: 1080 })) : variant(item.thumb ?? item.strip, { w: 480 });
  return (
    <div className={cn('relative w-fit', !big && 'drop-in')} style={{ ['--r' as string]: `${rot}deg`, transform: `rotate(${rot}deg)` }}>
      {fastener === 0 ? <Magnet className="-top-3 left-1/2 -translate-x-1/2" color={MAGNETS[Math.floor(r(5) * MAGNETS.length)]} /> : null}
      {fastener === 1 ? <span className="tape absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 rotate-[-6deg]" /> : null}
      {fastener === 2 ? <PaperClip className="-top-6 left-4 w-5" /> : null}
      {fastener === 3 ? (
        <>
          <span className="tape tape-pink absolute -top-2 -left-4 z-10 h-5 w-14 -rotate-45" />
          <span className="tape tape-blue absolute -right-4 -bottom-2 z-10 h-5 w-14 -rotate-45" />
        </>
      ) : null}
      <div className={cn('relative bg-white p-1.5 shadow-[0_14px_22px_-10px_rgba(0,0,0,0.6)]', big ? 'p-2' : '', fresh && 'ring-4 ring-sun')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading={big ? 'eager' : 'lazy'} className={cn('block w-auto object-contain', big ? 'developing max-h-[calc(100dvh-380px)] max-w-full' : 'max-h-[30vh] max-w-[22vw]')} />
        {item.stickers?.map((s, i) => (
          <Sticker key={i} id={s.id} rotate={s.r} className="absolute" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%`, translate: '-50% -50%' }} />
        ))}
      </div>
      {decor ? <Sticker id={decor} rotate={(r(6) - 0.5) * 40} className="absolute -right-5 -bottom-4 w-14" /> : null}
      {fresh ? <Sticker id="flash" rotate={-12} className="drop-in absolute -top-6 -left-8 w-24" /> : null}
    </div>
  );
}
