/**
 * Admin "Tebak Lagu" console.
 *   GET    → { tracks, vouchers, settings }
 *   POST   { action: 'add', links: string }                 add Spotify links (one per line)
 *          { action: 'round', playerName? }                 random track for a visitor
 *          { action: 'guess', roundId, guess }              check a typed guess
 *          { action: 'mark', roundId }                      host marks a spoken answer correct
 *          { action: 'skip', roundId }                      end round without winner
 *          { action: 'redeem', code }                       mark a voucher as used
 *   PATCH  { id, title?, artist?, aliases?, isActive? }
 *   DELETE ?id=<uuid>
 */
import { NextRequest, NextResponse } from 'next/server';
import { isUuid, requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { getSettings } from '@/lib/settings';
import { addTracks, deleteTrack, endHostRound, listTracks, listVouchers, redeemVoucher, startHostRound, submitGuess, updateTrack } from '@/lib/song';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const [tracks, vouchers, settings] = await Promise.all([listTracks(), listVouchers(), getSettings()]);
  return NextResponse.json({ ...tracks, vouchers, settings: settings.song }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  try {
    switch (body.action) {
      case 'add':
        return NextResponse.json(await addTracks(String(body.links ?? '').split(/\s*[\n,]\s*/)));
      case 'round':
        return NextResponse.json({ round: await startHostRound(typeof body.playerName === 'string' ? body.playerName : null, isUuid(body.eventId) ? (body.eventId as string) : null) });
      case 'guess':
      case 'mark': {
        if (!isUuid(body.roundId)) return jsonError('Ronde tidak valid', 400);
        const guess = typeof body.guess === 'string' ? body.guess.slice(0, 200) : '';
        if (body.action === 'guess' && !guess.trim()) return jsonError('Tulis tebakannya dulu', 400);
        return NextResponse.json(await submitGuess(body.roundId as string, body.action === 'mark' ? '(ditandai benar oleh admin)' : guess, { mode: 'host' }, body.action === 'mark'));
      }
      case 'skip':
        if (!isUuid(body.roundId)) return jsonError('Ronde tidak valid', 400);
        await endHostRound(body.roundId as string);
        return NextResponse.json({ ok: true });
      case 'redeem': {
        const v = await redeemVoucher(String(body.code ?? ''));
        return v ? NextResponse.json({ voucher: v }) : jsonError('Kode tidak ditemukan atau sudah dipakai', 404);
      }
      default:
        return jsonError('Aksi tidak dikenal', 400);
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal', 400);
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  if (!body || !isUuid(body.id)) return jsonError('Body tidak valid', 400);
  try {
    await updateTrack(body.id as string, {
      title: typeof body.title === 'string' ? body.title : undefined,
      artist: body.artist === null || typeof body.artist === 'string' ? (body.artist as string | null) : undefined,
      aliases: Array.isArray(body.aliases) ? (body.aliases as string[]) : undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal', 400);
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get('id');
  if (!isUuid(id)) return jsonError('id tidak valid', 400);
  await deleteTrack(id);
  return NextResponse.json({ ok: true });
}
