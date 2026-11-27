'use client';

/**
 * Admin "Tebak Lagu" console:
 *  1. Panggung — host a round for a visitor who hasn't bought yet: random
 *     mystery track, type (or mark) their guess, hand out the voucher.
 *  2. Daftar lagu — paste Spotify links; titles are filled in from Spotify.
 *  3. Voucher — winners' codes, mark redeemed.
 *  4. Pengaturan — on/off for both modes, guesses, prizes.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Music2, Plus, RefreshCcw, SkipForward, Ticket, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shell/PortalShell';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Switch, SwitchRow } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { WordArt } from '@/components/brand/WordArt';
import { api, formatDateTime } from '@/lib/fetcher';
import { sfx } from '@/lib/sfx';
import type { AppSettings } from '@/lib/settings-shared';
import { MysteryPlayer } from './MysteryPlayer';
import type { SongRound } from './GuestSongGame';
import { cn } from '@/lib/utils';

interface Track { id: string; spotifyId: string; title: string; artist: string | null; aliases: string[]; isActive: boolean }
interface Voucher { id: string; code: string; prize: string; mode: 'host' | 'guest'; playerName: string | null; title: string; redeemedAt: string | null; createdAt: string }
interface Data { ok: boolean; tracks: Track[]; vouchers: Voucher[]; settings: AppSettings['song'] }

export function SongConsole() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [links, setLinks] = useState('');
  const [adding, setAdding] = useState(false);
  const [player, setPlayer] = useState('');
  const [round, setRound] = useState<SongRound | null>(null);
  const [guess, setGuess] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [cfg, setCfg] = useState<AppSettings['song'] | null>(null);

  const load = useCallback(async () => {
    const res = await api<Data>('/api/admin/songs');
    setData(res);
    setCfg((c) => c ?? res.settings);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load().catch((e) => toast(e.message, 'error'));
  }, [load, toast]);

  const post = async <T,>(json: Record<string, unknown>, key: string): Promise<T | null> => {
    setBusy(key);
    try {
      return await api<T>('/api/admin/songs', { method: 'POST', json });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  async function addLinks() {
    setAdding(true);
    const res = await post<{ added: number; skipped: string[] }>({ action: 'add', links }, 'add');
    setAdding(false);
    if (!res) return;
    toast(`${res.added} lagu ditambahkan${res.skipped.length ? ` · ${res.skipped.length} dilewati` : ''}`);
    if (res.skipped.length) toast(res.skipped.slice(0, 3).join(' · '), 'error');
    setLinks('');
    await load();
  }

  async function newRound() {
    const res = await post<{ round: SongRound }>({ action: 'round', playerName: player }, 'round');
    if (res) {
      setRound(res.round);
      setGuess('');
      sfx.select();
    }
  }

  async function check(mark = false) {
    if (!round) return;
    const res = await post<{ correct: boolean; round: SongRound }>({ action: mark ? 'mark' : 'guess', roundId: round.id, guess }, mark ? 'mark' : 'guess');
    if (!res) return;
    setRound(res.round);
    if (res.correct) sfx.tada();
    else sfx.error();
    setGuess('');
    if (res.round.status !== 'playing') await load();
  }

  async function skip() {
    if (!round) return;
    await post({ action: 'skip', roundId: round.id }, 'skip');
    setRound(null);
  }

  async function redeem(code: string) {
    const res = await post<{ voucher: Voucher }>({ action: 'redeem', code }, `redeem-${code}`);
    if (res) {
      toast(`Voucher ${res.voucher.code} ditukar · ${res.voucher.prize}`);
      setRedeemCode('');
      await load();
    }
  }

  async function patchTrack(id: string, body: Record<string, unknown>) {
    try {
      await api('/api/admin/songs', { method: 'PATCH', json: { id, ...body } });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    }
  }

  async function saveCfg() {
    if (!cfg) return;
    setBusy('cfg');
    try {
      await api('/api/admin/dev/settings', { method: 'PATCH', json: { group: 'song', value: cfg } });
      toast('Pengaturan tebak lagu tersimpan');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Gagal', 'error');
    } finally {
      setBusy(null);
    }
  }

  const activeCount = data?.tracks.filter((t) => t.isActive).length ?? 0;

  return (
    <div>
      <PageHeader
        title={<WordArt variant="grape" className="text-[34px]">Tebak Lagu</WordArt>}
        description="Game buat pengunjung: dengar lagu misteri (Spotify), tebak judulnya, menang hadiah."
        actions={<Button variant="secondary" onClick={() => void load()}><RefreshCcw /> Refresh</Button>}
      />
      {data && !data.ok ? <p className="mb-5 rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn">Tabel tebak lagu belum ada — jalankan migrasi <code>…11_v6_song_guess.sql</code>.</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        {/* ── Panggung ─────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Panggung (pengunjung belum beli)" icon={<Music2 />} description={`Putar lagu acak dari ${activeCount} lagu aktif. Ketik jawaban pengunjung, atau tandai benar kalau dijawab lisan.`} />
          <div className="flex flex-col gap-4 p-5">
            {!data?.settings.hostEnabled ? <p className="rounded-[10px] bg-warn-soft px-3 py-2 text-xs text-warn">Mode panggung sedang dimatikan (lihat Pengaturan di bawah).</p> : null}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Nama pengunjung (opsional)" className="min-w-0 flex-1">
                <Input value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={60} placeholder="mis. Rara FIB" />
              </Field>
              <Button variant="primary" onClick={() => void newRound()} loading={busy === 'round'} disabled={!activeCount}><Music2 /> {round ? 'Lagu berikutnya' : 'Putar lagu acak'}</Button>
            </div>
            {round ? (
              <div className="flex flex-col gap-3 rounded-[14px] border-2 border-ink bg-win p-3 shadow-[3px_3px_0_var(--color-ink)]">
                <MysteryPlayer key={round.id} spotifyId={round.spotifyId} revealed={round.status !== 'playing'} />
                {round.status === 'playing' ? (
                  <>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (guess.trim()) void check();
                      }}
                    >
                      <Input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Tebakan pengunjung…" className="flex-1" autoComplete="off" />
                      <Button type="submit" variant="secondary" loading={busy === 'guess'} disabled={!guess.trim()}>Cek</Button>
                    </form>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted">Sisa {round.guessesLeft}× {round.hint ? `· ${round.hint}` : ''}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => void check(true)} loading={busy === 'mark'}><Check /> Tandai benar</Button>
                        <Button size="sm" variant="ghost" onClick={() => void skip()} loading={busy === 'skip'}><SkipForward /> Selesai</Button>
                      </div>
                    </div>
                  </>
                ) : round.status === 'won' && round.voucher ? (
                  <div className="flex flex-col items-center gap-1 py-2 text-center">
                    <WordArt variant="rainbow" className="text-[44px]">MENANG!</WordArt>
                    <p className="text-sm">{round.reveal?.title}{round.reveal?.artist ? ` — ${round.reveal.artist}` : ''}</p>
                    <p className="font-techno text-3xl font-black tracking-widest">{round.voucher.code}</p>
                    <p className="text-sm font-bold">{round.voucher.prize}</p>
                  </div>
                ) : (
                  <p className="py-2 text-center text-sm">Jawabannya: <b>{round.reveal?.title}</b>{round.reveal?.artist ? ` — ${round.reveal.artist}` : ''}</p>
                )}
              </div>
            ) : (
              <EmptyState icon={<Music2 />} title="Belum ada ronde" description="Tekan “Putar lagu acak”, lalu tekan ▶ di pemutar. Judul tetap tersembunyi sampai ronde selesai." />
            )}
          </div>
        </Panel>

        {/* ── Voucher ──────────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Voucher pemenang" icon={<Ticket />} description="Pemenang dari panggung & dari halaman foto tamu. Tandai saat hadiah diberikan." />
          <div className="flex gap-2 border-b border-line p-4">
            <Input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())} placeholder="LAGU-XXXX" className="flex-1 font-mono" />
            <Button variant="secondary" onClick={() => void redeem(redeemCode)} disabled={!redeemCode.trim()} loading={busy === `redeem-${redeemCode}`}>Tukar</Button>
          </div>
          {!data?.vouchers.length ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Belum ada pemenang.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {data.vouchers.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-bold">{v.code} <span className="font-sans text-xs font-normal text-muted">· {v.mode === 'host' ? 'panggung' : 'halaman foto'}{v.playerName ? ` · ${v.playerName}` : ''}</span></p>
                    <p className="truncate text-xs text-muted">{v.prize} · “{v.title}” · {formatDateTime(v.createdAt)}</p>
                  </div>
                  {v.redeemedAt ? <Badge tone="ok" dot>Ditukar</Badge> : <Button size="sm" variant="secondary" onClick={() => void redeem(v.code)} loading={busy === `redeem-${v.code}`}>Tukar</Button>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Daftar lagu ──────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Daftar lagu" icon={<Plus />} description="Tempel link lagu Spotify (satu per baris). Judul diambil otomatis; tambahkan penyanyi & jawaban alternatif bila perlu." />
          <div className="flex flex-col gap-2 border-b border-line p-4">
            <Textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder={'https://open.spotify.com/track/...\nhttps://open.spotify.com/track/...'} />
            <Button className="self-end" variant="primary" onClick={() => void addLinks()} loading={adding} disabled={!links.trim()}><Plus /> Tambah lagu</Button>
          </div>
          {!data?.tracks.length ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Belum ada lagu.</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
              {data.tracks.map((t) => (
                <li key={t.id} className={cn('flex flex-col gap-2 px-5 py-3', !t.isActive && 'opacity-55')}>
                  <div className="flex items-center gap-2">
                    <Input defaultValue={t.title} onBlur={(e) => e.target.value !== t.title && void patchTrack(t.id, { title: e.target.value })} aria-label="Judul (jawaban)" className="h-9 flex-1 font-semibold" />
                    <Switch checked={t.isActive} onChange={(v) => void patchTrack(t.id, { isActive: v })} label="Aktif" />
                    <button type="button" onClick={() => void api(`/api/admin/songs?id=${t.id}`, { method: 'DELETE' }).then(load)} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger" aria-label="Hapus lagu"><Trash2 className="size-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input defaultValue={t.artist ?? ''} placeholder="Penyanyi (untuk petunjuk)" onBlur={(e) => e.target.value !== (t.artist ?? '') && void patchTrack(t.id, { artist: e.target.value || null })} className="h-8 text-xs" />
                    <Input defaultValue={t.aliases.join(', ')} placeholder="Jawaban lain, pisah koma" onBlur={(e) => e.target.value !== t.aliases.join(', ') && void patchTrack(t.id, { aliases: e.target.value.split(',') })} className="h-8 text-xs" />
                  </div>
                  <a href={`https://open.spotify.com/track/${t.spotifyId}`} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-brand">Buka di Spotify ↗</a>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Pengaturan ───────────────────────────────────────────────── */}
        <Panel>
          <PanelHeader title="Pengaturan" />
          {cfg ? (
            <div className="flex flex-col gap-1 px-5 pb-4">
              <SwitchRow title="Mode panggung (pengunjung belum beli)" description="Dijalankan admin dari halaman ini." checked={cfg.hostEnabled} onChange={(v) => setCfg({ ...cfg, hostEnabled: v })} />
              <SwitchRow title="Tebak lagu di halaman foto tamu" description="Setelah membeli/foto, tamu bisa ikut dari halaman Foto_kamu." checked={cfg.guestEnabled} onChange={(v) => setCfg({ ...cfg, guestEnabled: v })} />
              <SwitchRow title="Petunjuk setelah salah sekali" description="Nama penyanyi (jika diisi) atau jumlah kata + huruf awal judul." checked={cfg.artistHint} onChange={(v) => setCfg({ ...cfg, artistHint: v })} />
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Field label="Kesempatan menebak / lagu">
                  <Input type="number" min={1} max={10} value={cfg.guessesPerRound} onChange={(e) => setCfg({ ...cfg, guessesPerRound: Number(e.target.value) || 1 })} />
                </Field>
                <Field label="Lagu per sesi foto (tamu)">
                  <Input type="number" min={1} max={5} value={cfg.roundsPerSession} onChange={(e) => setCfg({ ...cfg, roundsPerSession: Number(e.target.value) || 1 })} />
                </Field>
              </div>
              <Field label="Hadiah mode panggung"><Input value={cfg.hostPrize} maxLength={120} onChange={(e) => setCfg({ ...cfg, hostPrize: e.target.value })} /></Field>
              <Field label="Hadiah dari halaman foto"><Input value={cfg.guestPrize} maxLength={120} onChange={(e) => setCfg({ ...cfg, guestPrize: e.target.value })} /></Field>
              <Button className="mt-2 self-end" variant="primary" onClick={() => void saveCfg()} loading={busy === 'cfg'}>Simpan</Button>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
