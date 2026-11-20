'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize, Minimize } from 'lucide-react';
import type { GuestbookEntryView, LiveItem } from '@/lib/community';
import { cn } from '@/lib/utils';

const POLL_MS = 5000;
const FULL_REFRESH_MS = 25 * 60 * 1000; // signed URLs live 1 h
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
export function LiveWall({ token, eventName, initialItems, initialMessages, guestbook }: { token: string; eventName: string; initialItems: LiveItem[]; initialMessages: GuestbookEntryView[]; guestbook: boolean }) {
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
    }
    try {
      const res = await fetch(`/api/live/${token}?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: LiveItem[]; messages: GuestbookEntryView[] };
      setOffline(false);
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
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

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

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0B0C10] text-white">
      <header className="flex shrink-0 items-center justify-between gap-6 px-8 pt-6 pb-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
            <span className={cn('size-2 rounded-full', offline ? 'bg-white/30' : 'animate-pulse bg-[#FF3B30]')} /> {offline ? 'Menyambung ulang…' : 'Live'}
          </p>
          <h1 className="truncate text-[clamp(22px,3vw,40px)] font-extrabold tracking-tight">{eventName}</h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="hidden text-right text-sm text-white/50 sm:block">{items.length} foto</p>
          <button
            type="button"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
            aria-label={full ? 'Keluar layar penuh' : 'Layar penuh'}
          >
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </header>

      {items.length ? (
        <div className="grid min-h-0 flex-1 gap-6 px-8 pb-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="relative flex min-h-0 items-center justify-center">
            {current ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.id}
                src={current.gif ?? current.strip ?? current.thumb ?? ''}
                alt=""
                className={cn('max-h-full max-w-full animate-pop rounded-[6px] object-contain shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]', fresh === current.id && 'ring-4 ring-sun')}
              />
            ) : null}
            {fresh === current?.id ? <span className="absolute top-3 left-3 rounded-full bg-sun px-3 py-1 text-sm font-bold text-ink">Baru!</span> : null}
          </div>
          <div className="hidden min-h-0 grid-cols-3 content-start gap-3 overflow-hidden lg:grid xl:grid-cols-4">
            {rest.map((it) => (
              <div key={it.id} className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.04] p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb ?? it.strip ?? ''} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-3xl font-extrabold">Belum ada foto</p>
          <p className="text-white/50">Foto dari booth muncul di sini beberapa detik setelah selesai.</p>
        </div>
      )}

      {guestbook ? (
        <footer className="flex shrink-0 items-center gap-6 border-t border-white/10 px-8 py-4">
          <div className="min-w-0 flex-1">
            {msg ? (
              <p key={msg.id} className="animate-fade-in truncate text-[clamp(16px,1.6vw,22px)]">
                <span className="font-bold">{msg.name}</span>
                <span className="text-white/40"> · </span>
                <span className="text-white/85">{msg.message}</span>
              </p>
            ) : (
              <p className="text-white/50">Belum ada pesan. Scan QR untuk menulis di buku tamu.</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="text-right text-sm leading-tight text-white/60">Tulis pesan<br />& kesan</p>
            <div className="rounded-[8px] bg-white p-1.5"><QRCodeSVG value={`${origin}/m/${token}`} size={72} marginSize={0} /></div>
          </div>
        </footer>
      ) : null}
    </main>
  );
}
