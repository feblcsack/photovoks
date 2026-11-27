/**
 * Tebak Lagu (SERVER ONLY). The answer (title/aliases) never leaves the
 * server until the round is over; the browser only gets the Spotify track id
 * to play it.
 */
import { randomInt } from 'node:crypto';
import { createServerClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import { log } from '@/lib/logger';
import { isCorrectGuess, parseSpotifyTrackId, voucherCode } from './match';

export interface SongTrackAdmin {
  id: string;
  spotifyId: string;
  title: string;
  artist: string | null;
  aliases: string[];
  isActive: boolean;
}

/** What a player sees. Title/artist only once the round is finished. */
export interface SongRoundView {
  id: string;
  mode: 'host' | 'guest';
  spotifyId: string;
  status: 'playing' | 'won' | 'lost' | 'skipped';
  guesses: number;
  guessesLeft: number;
  hint: string | null;
  reveal: { title: string; artist: string | null } | null;
  voucher: { code: string; prize: string; redeemed: boolean } | null;
  playerName: string | null;
  createdAt: string;
}

const ROUND_COLS = 'id, mode, track_id, session_id, event_id, player_name, guesses, last_guess, status, voucher_code, prize, redeemed_at, created_at, song_tracks(spotify_id, title, artist, aliases)';

export function migrationMissing(message: string | undefined): boolean {
  return !!message && /song_(tracks|rounds)/.test(message);
}

// ── Tracks ───────────────────────────────────────────────────────────────────

/** Title/artist from Spotify's public oEmbed (artist isn't in oEmbed → null). */
async function oembedTitle(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${id}`)}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

export async function listTracks(): Promise<{ ok: boolean; tracks: SongTrackAdmin[] }> {
  const { data, error } = await createServerClient().from('song_tracks').select('id, spotify_id, title, artist, aliases, is_active').order('created_at', { ascending: false }).limit(500);
  if (error) return { ok: false, tracks: [] };
  return { ok: true, tracks: (data ?? []).map((r) => ({ id: r.id, spotifyId: r.spotify_id, title: r.title, artist: r.artist, aliases: r.aliases ?? [], isActive: r.is_active })) };
}

/** Adds tracks from pasted links (one per line). Titles come from Spotify. */
export async function addTracks(lines: string[]): Promise<{ added: number; skipped: string[] }> {
  const supabase = createServerClient();
  const skipped: string[] = [];
  let added = 0;
  for (const line of lines.slice(0, 50)) {
    if (!line.trim()) continue;
    const id = parseSpotifyTrackId(line);
    if (!id) {
      skipped.push(`${line.trim().slice(0, 60)} (bukan link lagu Spotify)`);
      continue;
    }
    const title = await oembedTitle(id);
    if (!title) {
      skipped.push(`${id} (judul tidak ditemukan)`);
      continue;
    }
    const { error } = await supabase.from('song_tracks').upsert({ spotify_id: id, title }, { onConflict: 'spotify_id', ignoreDuplicates: true });
    if (error) {
      if (migrationMissing(error.message)) throw new Error('Jalankan migrasi v6 (tebak lagu) dulu');
      skipped.push(`${id} (${error.message})`);
    } else added++;
  }
  return { added, skipped };
}

export async function updateTrack(id: string, patch: { title?: string; artist?: string | null; aliases?: string[]; isActive?: boolean }) {
  const update: Record<string, unknown> = {};
  if (typeof patch.title === 'string' && patch.title.trim()) update.title = patch.title.trim().slice(0, 200);
  if (patch.artist !== undefined) update.artist = patch.artist ? String(patch.artist).trim().slice(0, 120) : null;
  if (Array.isArray(patch.aliases)) update.aliases = patch.aliases.map((a) => String(a).trim().slice(0, 200)).filter(Boolean).slice(0, 10);
  if (typeof patch.isActive === 'boolean') update.is_active = patch.isActive;
  if (!Object.keys(update).length) return;
  const { error } = await createServerClient().from('song_tracks').update(update).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTrack(id: string) {
  await createServerClient().from('song_tracks').delete().eq('id', id);
}

// ── Rounds ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toView(r: any, guessesPerRound: number, artistHint: boolean): SongRoundView {
  const t = r.song_tracks ?? {};
  const done = r.status !== 'playing';
  return {
    id: r.id,
    mode: r.mode,
    spotifyId: t.spotify_id,
    status: r.status,
    guesses: r.guesses,
    guessesLeft: Math.max(0, guessesPerRound - r.guesses),
    hint: !done && artistHint && r.guesses > 0 && t.artist ? `Penyanyinya: ${t.artist}` : !done && r.guesses > 0 && t.title ? `Judulnya ${String(t.title).split(/\s+/).length} kata, huruf awal “${String(t.title).trim()[0].toUpperCase()}”` : null,
    reveal: done ? { title: t.title, artist: t.artist ?? null } : null,
    voucher: r.voucher_code ? { code: r.voucher_code, prize: r.prize ?? '', redeemed: !!r.redeemed_at } : null,
    playerName: r.player_name ?? null,
    createdAt: r.created_at,
  };
}

/** Random active track, avoiding the ones this player already got. */
async function pickTrack(exclude: string[]): Promise<{ id: string } | null> {
  const { data, error } = await createServerClient().from('song_tracks').select('id').eq('is_active', true).limit(1000);
  if (error) throw new Error(migrationMissing(error.message) ? 'Jalankan migrasi v6 (tebak lagu) dulu' : error.message);
  const pool = (data ?? []).filter((t) => !exclude.includes(t.id));
  const list = pool.length ? pool : data ?? [];
  return list.length ? list[randomInt(list.length)] : null;
}

export async function startHostRound(playerName: string | null, eventId: string | null): Promise<SongRoundView> {
  const { song } = await getSettings();
  if (!song.hostEnabled) throw new Error('Tebak lagu (host) sedang dimatikan');
  const supabase = createServerClient();
  const { data: recent } = await supabase.from('song_rounds').select('track_id').eq('mode', 'host').order('created_at', { ascending: false }).limit(10);
  const track = await pickTrack((recent ?? []).map((r) => r.track_id as string));
  if (!track) throw new Error('Belum ada lagu — tambahkan link Spotify dulu');
  const { data, error } = await supabase
    .from('song_rounds')
    .insert({ mode: 'host', track_id: track.id, player_name: playerName?.trim().slice(0, 60) || null, event_id: eventId })
    .select(ROUND_COLS)
    .single();
  if (error) throw new Error(error.message);
  return toView(data, song.guessesPerRound, song.artistHint);
}

export async function guestRounds(sessionId: string): Promise<{ rounds: SongRoundView[]; canStart: boolean; enabled: boolean; prize: string; guessesPerRound: number }> {
  const { song } = await getSettings();
  const supabase = createServerClient();
  const [{ data, error }, { count: activeTracks }] = await Promise.all([
    supabase.from('song_rounds').select(ROUND_COLS).eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('song_tracks').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  if (error) return { rounds: [], canStart: false, enabled: false, prize: song.guestPrize, guessesPerRound: song.guessesPerRound };
  const rounds = (data ?? []).map((r) => toView(r, song.guessesPerRound, song.artistHint));
  const playing = rounds.some((r) => r.status === 'playing');
  // Hidden until the owner has added at least one song (unless rounds already exist).
  const enabled = song.guestEnabled && ((activeTracks ?? 0) > 0 || rounds.length > 0);
  return { rounds, canStart: enabled && !playing && rounds.length < song.roundsPerSession && (activeTracks ?? 0) > 0, enabled, prize: song.guestPrize, guessesPerRound: song.guessesPerRound };
}

export async function startGuestRound(sessionId: string, eventId: string): Promise<SongRoundView> {
  const { song } = await getSettings();
  if (!song.guestEnabled) throw new Error('Tebak lagu sedang dimatikan');
  const state = await guestRounds(sessionId);
  const open = state.rounds.find((r) => r.status === 'playing');
  if (open) return open;
  if (!state.canStart) throw new Error('Jatah tebak lagu sesi ini sudah habis');
  const supabase = createServerClient();
  const { data: mine } = await supabase.from('song_rounds').select('track_id').eq('session_id', sessionId);
  const track = await pickTrack((mine ?? []).map((r) => r.track_id as string));
  if (!track) throw new Error('Belum ada lagu untuk ditebak');
  const { data, error } = await supabase.from('song_rounds').insert({ mode: 'guest', track_id: track.id, session_id: sessionId, event_id: eventId }).select(ROUND_COLS).single();
  if (error) throw new Error(error.message);
  return toView(data, song.guessesPerRound, song.artistHint);
}

/**
 * Checks a guess. `scope` restricts which rounds the caller may touch
 * (a guest token can only guess its own session's rounds).
 * `forceCorrect` lets the admin host mark a spoken answer as right.
 */
export async function submitGuess(roundId: string, guess: string, scope: { sessionId?: string; mode: 'host' | 'guest' }, forceCorrect = false): Promise<{ correct: boolean; round: SongRoundView }> {
  const { song } = await getSettings();
  const supabase = createServerClient();
  let q = supabase.from('song_rounds').select(ROUND_COLS).eq('id', roundId).eq('mode', scope.mode);
  if (scope.sessionId) q = q.eq('session_id', scope.sessionId);
  const { data: r } = await q.maybeSingle();
  if (!r) throw new Error('Ronde tidak ditemukan');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = r as any;
  if (row.status !== 'playing') return { correct: row.status === 'won', round: toView(row, song.guessesPerRound, song.artistHint) };
  const t = row.song_tracks ?? {};
  const correct = forceCorrect || isCorrectGuess(guess, t.title ?? '', t.aliases ?? []);
  const guesses = row.guesses + 1;
  const update: Record<string, unknown> = { guesses, last_guess: guess.slice(0, 200) };
  if (correct) {
    Object.assign(update, { status: 'won', finished_at: new Date().toISOString(), voucher_code: voucherCode(() => randomInt(1_000_000) / 1_000_000), prize: scope.mode === 'host' ? song.hostPrize : song.guestPrize });
  } else if (guesses >= song.guessesPerRound) {
    Object.assign(update, { status: 'lost', finished_at: new Date().toISOString() });
  }
  // guarded on status so double-submits can't create two vouchers
  const { data: updated, error } = await supabase.from('song_rounds').update(update).eq('id', roundId).eq('status', 'playing').eq('guesses', row.guesses).select(ROUND_COLS).maybeSingle();
  if (error) throw new Error(error.message.includes('voucher') ? 'Coba lagi' : error.message);
  if (!updated) {
    const { data: fresh } = await supabase.from('song_rounds').select(ROUND_COLS).eq('id', roundId).single();
    return { correct: fresh?.status === 'won', round: toView(fresh, song.guessesPerRound, song.artistHint) };
  }
  if (correct) log({ level: 'info', event: 'song.won', details: { roundId, mode: scope.mode } });
  return { correct, round: toView(updated, song.guessesPerRound, song.artistHint) };
}

export async function endHostRound(roundId: string) {
  await createServerClient().from('song_rounds').update({ status: 'skipped', finished_at: new Date().toISOString() }).eq('id', roundId).eq('status', 'playing');
}

// ── Vouchers ─────────────────────────────────────────────────────────────────

export interface VoucherView {
  id: string;
  code: string;
  prize: string;
  mode: 'host' | 'guest';
  playerName: string | null;
  title: string;
  redeemedAt: string | null;
  createdAt: string;
}

export async function listVouchers(): Promise<VoucherView[]> {
  const { data } = await createServerClient()
    .from('song_rounds')
    .select('id, voucher_code, prize, mode, player_name, redeemed_at, created_at, song_tracks(title)')
    .not('voucher_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.voucher_code as string,
    prize: r.prize ?? '',
    mode: r.mode,
    playerName: r.player_name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    title: (r.song_tracks as any)?.title ?? '',
    redeemedAt: r.redeemed_at,
    createdAt: r.created_at,
  }));
}

export async function redeemVoucher(code: string): Promise<VoucherView | null> {
  const clean = code.trim().toUpperCase();
  const { data } = await createServerClient()
    .from('song_rounds')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('voucher_code', clean)
    .is('redeemed_at', null)
    .select('id, voucher_code, prize, mode, player_name, redeemed_at, created_at, song_tracks(title)')
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { id: data.id, code: data.voucher_code as string, prize: data.prize ?? '', mode: data.mode, playerName: data.player_name, title: (data.song_tracks as any)?.title ?? '', redeemedAt: data.redeemed_at, createdAt: data.created_at };
}

export { parseSpotifyTrackId };
