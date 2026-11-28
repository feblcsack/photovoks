'use client';

/**
 * "Lagu misteri" player: a Spotify embed whose cover, title and artist are
 * hidden under a cassette label until the round is over. Playback is
 * controlled from our own big button through Spotify's iFrame API; the
 * embed's own controls (bottom-right) stay reachable as a fallback.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { spotifyEmbedUrl } from '@/lib/song/match';
import { cn } from '@/lib/utils';

interface Controller {
  togglePlay: () => void;
  loadUri: (uri: string) => void;
  addListener: (ev: 'playback_update' | 'ready', cb: (e: { data: { isPaused: boolean; position: number; duration: number } }) => void) => void;
  destroy: () => void;
}
interface IFrameAPI {
  createController: (el: HTMLElement, opts: { uri: string; width: string | number; height: number }, cb: (c: Controller) => void) => void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void;
    __spotifyApi?: IFrameAPI;
  }
}

let apiPromise: Promise<IFrameAPI | null> | null = null;
function loadApi(): Promise<IFrameAPI | null> {
  if (window.__spotifyApi) return Promise.resolve(window.__spotifyApi);
  apiPromise ??= new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    window.onSpotifyIframeApiReady = (api) => {
      clearTimeout(timer);
      window.__spotifyApi = api;
      resolve(api);
    };
    const s = document.createElement('script');
    s.src = 'https://open.spotify.com/embed/iframe-api/v1';
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      apiPromise = null;
      resolve(null);
    };
    document.body.appendChild(s);
  });
  return apiPromise;
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export function MysteryPlayer({ spotifyId, revealed = false, label = 'LAGU MISTERI', className }: { spotifyId: string; revealed?: boolean; label?: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const [mode, setMode] = useState<'loading' | 'api' | 'plain'>('loading');
  const [state, setState] = useState({ paused: true, position: 0, duration: 0 });

  useEffect(() => {
    let alive = true;
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';
    const mount = document.createElement('div');
    el.appendChild(mount);
    void loadApi().then((api) => {
      if (!alive) return;
      if (!api) return setMode('plain');
      api.createController(mount, { uri: `spotify:track:${spotifyId}`, width: '100%', height: 152 }, (c) => {
        if (!alive) return c.destroy();
        ctl.current = c;
        setMode('api');
        c.addListener('playback_update', (e) => alive && setState({ paused: e.data.isPaused, position: e.data.position, duration: e.data.duration }));
      });
    });
    return () => {
      alive = false;
      ctl.current?.destroy();
      ctl.current = null;
    };
  }, [spotifyId]);

  const pct = state.duration ? (state.position / state.duration) * 100 : 0;
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="relative overflow-hidden rounded-[12px] border-2 border-ink bg-[#1F1F1F]" style={{ height: 152 }}>
        {mode === 'plain' ? (
          <iframe title="Lagu misteri" src={spotifyEmbedUrl(spotifyId)} width="100%" height={152} allow="autoplay; clipboard-write; encrypted-media" loading="lazy" className="block" />
        ) : (
          <div ref={host} className="size-full" />
        )}
        {!revealed ? (
          // Cassette label over cover + title + artist; bottom-right left open for the embed's own play button.
          <div className="pointer-events-auto absolute inset-0 [clip-path:polygon(0_0,100%_0,100%_calc(100%-58px),calc(100%-86px)_calc(100%-58px),calc(100%-86px)_100%,0_100%)]">
            <div className="flex size-full items-center gap-3 bg-[linear-gradient(135deg,#FFD43B,#FF9BD2)] px-3">
              <div className="relative flex h-[104px] w-[150px] shrink-0 items-center justify-around rounded-[10px] border-2 border-ink bg-[#2B2F3A] px-3 shadow-[3px_3px_0_var(--color-ink)]">
                {[0, 1].map((i) => (
                  <span key={i} className={cn('flex size-11 items-center justify-center rounded-full border-4 border-[#F4EDDC] bg-[#1A1410]', !state.paused && 'animate-spin-slow')}>
                    <span className="size-3 rounded-full bg-[#F4EDDC]" />
                  </span>
                ))}
                <span className="absolute inset-x-6 bottom-1.5 h-2 rounded-full bg-[#5B5E66]" />
              </div>
              <div className="min-w-0">
                <p className="font-techno text-[13px] font-bold tracking-[0.2em] text-ink">{label}</p>
                <p className="font-display text-[26px] leading-none text-ink">??? ???</p>
                <p className="mt-1 font-pixel text-[12px] text-ink-2">Judul & penyanyi dirahasiakan</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {mode === 'api' ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => ctl.current?.togglePlay()} className="bevel-out flex size-12 shrink-0 items-center justify-center bg-sun active:bevel-pressed" aria-label={state.paused ? 'Putar' : 'Jeda'}>
            {state.paused ? <Play className="size-6 fill-current" /> : <Pause className="size-6 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="bevel-in h-4 bg-win-light p-[2px]">
              <div className="h-full bg-[repeating-linear-gradient(90deg,var(--color-cobalt)_0_10px,transparent_10px_12px)] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-0.5 flex justify-between font-pixel text-[12px] text-ink-2">
              <span>{state.paused ? (state.position ? 'Dijeda' : 'Tekan ▶ untuk memutar') : 'Sedang diputar…'}</span>
              <span className="tabular-nums">{fmt(state.position)} / {state.duration ? fmt(state.duration) : '0:30'}</span>
            </p>
          </div>
        </div>
      ) : mode === 'plain' ? (
        <p className="font-pixel text-[12px] text-ink-2">Tekan ▶ di pojok kanan bawah pemutar untuk mendengarkan.</p>
      ) : (
        <p className="font-pixel text-[12px] text-ink-2">Menyiapkan pemutar…</p>
      )}
    </div>
  );
}
