/**
 * Guest "Tebak Lagu" from the photo page (post-purchase).
 *   GET                                → { rounds, canStart, enabled }
 *   POST { action: 'start' }           → { round }
 *   POST { action: 'guess', roundId, guess } → { correct, round }
 * Authorised by the session's QR token; a guest can only touch its own rounds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveGuest } from '@/lib/guest-guard';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { guestRounds, startGuestRound, submitGuess } from '@/lib/song';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  return NextResponse.json(await guestRounds(guest.session.id), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  const body = await readJson(request);
  try {
    if (body?.action === 'start') return NextResponse.json({ round: await startGuestRound(guest.session.id, guest.session.event_id) });
    if (body?.action === 'guess') {
      if (!isUuid(body.roundId)) return jsonError('Ronde tidak valid', 400);
      const guess = typeof body.guess === 'string' ? body.guess.slice(0, 200) : '';
      if (!guess.trim()) return jsonError('Tulis tebakanmu dulu', 400);
      return NextResponse.json(await submitGuess(body.roundId as string, guess, { mode: 'guest', sessionId: guest.session.id }));
    }
    return jsonError('Aksi tidak dikenal', 400);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal', 400);
  }
}
