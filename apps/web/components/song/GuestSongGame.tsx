'use client';

/**
 * TebakLagu.exe on the guest's photo page (post-purchase): one mystery
 * song per session (configurable), a few guesses, a voucher if correct.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Music2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WinInput } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { PixelIcon, WinPanel, WinWindow } from '@/components/os/retro';
import { WordArt } from '@/components/brand/WordArt';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/fetcher';
import { sfx } from '@/lib/sfx';
import { MysteryPlayer } from './MysteryPlayer';

export interface SongRound {
  id: string;
  spotifyId: string;
  status: 'playing' | 'won' | 'lost' | 'skipped';
  guesses: number;
  guessesLeft: number;
  hint: string | null;
  reveal: { title: string; artist: string | null } | null;
  voucher: { code: string; prize: string; redeemed: boolean } | null;
}

interface State {
  rounds: SongRound[];
  canStart: boolean;
  enabled: boolean;
  prize: string;
  guessesPerRound: number;
}

export function GuestSongGame({ token }: { token: string }) {
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await api<State>(`/api/s/${token}/song`));
    } catch {
      setState(null);
    }
  }, [token]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  if (!state || !state.enabled) return null;
  const round = [...state.rounds].reverse().find((r) => r.status === 'playing') ?? state.rounds[state.rounds.length - 1] ?? null;
  const won = state.rounds.find((r) => r.status === 'won');

  async function start() {
    setBusy(true);
    try {
      await api(`/api/s/${token}/song`, { method: 'POST', json: { action: 'start' } });
      sfx.select();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal memulai', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!round || !guess.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ correct: boolean; round: SongRound }>(`/api/s/${token}/song`, { method: 'POST', json: { action: 'guess', roundId: round.id, guess } });
      if (res.correct) sfx.tada();
      else {
        sfx.error();
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
      setGuess('');
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinWindow title="TebakLagu.exe" icon="tv" bodyClassName="flex flex-col gap-3 p-3 sm:p-4" status={<span>Hadiah: {state.prize}</span>}>
      {!round ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <WordArt variant="grape" className="text-[34px]">Tebak Lagu!</WordArt>
          <p className="max-w-sm text-sm text-ink-2">
            Dengarkan lagu misteri, tebak judulnya. Benar = dapat <b>{state.prize}</b>. Kamu punya {state.guessesPerRound} kesempatan.
          </p>
          <Button variant="win-go" size="lg" onClick={() => void start()} loading={busy}><Music2 /> Putar lagu misteri</Button>
        </div>
      ) : (
        <>
          <MysteryPlayer key={round.id} spotifyId={round.spotifyId} revealed={round.status !== 'playing'} />
          {round.status === 'playing' ? (
            <form onSubmit={submit} className="flex flex-col gap-2">
              <div className={shake ? 'animate-[pop_0.3s]' : undefined}>
                <WinInput value={guess} onChange={(e) => setGuess(e.target.value)} maxLength={120} placeholder="Judul lagunya apa hayo…" aria-label="Tebakan judul lagu" autoComplete="off" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-pixel text-[13px] text-ink-2">
                  Sisa {round.guessesLeft}× · {round.hint ?? 'Ejaan tidak harus sempurna'}
                </p>
                <Button type="submit" variant="win-primary" loading={busy} disabled={!guess.trim()}><Send /> Tebak!</Button>
              </div>
            </form>
          ) : round.status === 'won' && round.voucher ? (
            <WinPanel className="flex flex-col items-center gap-2 py-3 text-center">
              <WordArt variant="rainbow" className="text-[40px]">BENAR!</WordArt>
              <p className="text-sm">Lagunya <b>{round.reveal?.title}</b>{round.reveal?.artist ? ` — ${round.reveal.artist}` : ''}</p>
              <p className="font-pixel text-[13px] text-ink-2">Tunjukkan kode ini ke kasir / operator:</p>
              <div className="flex gap-1.5" aria-label={`Kode voucher ${round.voucher.code}`}>
                {round.voucher.code.split('').map((ch, i) => (
                  <span key={i} className={ch === '-' ? 'self-center font-bold' : 'bevel-in flex size-11 items-center justify-center bg-win-light font-techno text-2xl font-black'}>{ch}</span>
                ))}
              </div>
              <p className="text-sm font-bold">{round.voucher.prize}</p>
              {round.voucher.redeemed ? <p className="font-pixel text-[12px] text-ok">✓ Sudah ditukar</p> : null}
            </WinPanel>
          ) : (
            <WinPanel className="flex items-start gap-3 py-3">
              <PixelIcon name="warning" className="size-9 shrink-0" />
              <div className="text-sm">
                <p className="font-pixel text-[15px] font-bold">Yah, belum beruntung!</p>
                <p className="text-ink-2">Jawabannya: <b>{round.reveal?.title}</b>{round.reveal?.artist ? ` — ${round.reveal.artist}` : ''}</p>
                {state.canStart && !won ? (
                  <Button className="mt-2" variant="win" onClick={() => void start()} loading={busy}><Music2 /> Coba lagu lain</Button>
                ) : (
                  <p className="mt-1 text-xs text-muted">Foto lagi di booth untuk kesempatan berikutnya ✶</p>
                )}
              </div>
            </WinPanel>
          )}
        </>
      )}
      {busy && !round ? <Spinner className="mx-auto size-5" /> : null}
    </WinWindow>
  );
}
