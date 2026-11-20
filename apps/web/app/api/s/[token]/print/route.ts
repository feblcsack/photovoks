/**
 * POST /api/s/[token]/print
 *
 * { mode: 'queue',   type: 'strip'|'ai'|'edit', aiId?, editPath?, copies } → send to
 *                                                          the owner's print queue
 * { mode: 'browser', type: 'strip'|'ai', copies, paper }  → record a print made
 *                                                          from this browser
 *
 * Guests are limited by event.max_guest_prints; booth operators / admins
 * (event cookie on this device) are not.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveGuest } from '@/lib/guest-guard';
import { readJson, jsonError } from '@/lib/http';
import { isUuid } from '@/lib/security';
import { enqueuePrint, guestPrintsUsed, recordBrowserPrint } from '@/lib/print/server';
import { paperById } from '@/lib/print/papers';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const guest = await resolveGuest(token);
  if (!guest) return jsonError('Sesi tidak ditemukan', 404);
  const { session, event, role } = guest;

  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);
  const mode = body.mode === 'browser' ? 'browser' : 'queue';
  const type = body.type === 'ai' ? 'ai' : body.type === 'edit' ? 'edit' : 'strip';
  const copies = Number.isInteger(body.copies) ? Math.min(10, Math.max(1, body.copies as number)) : 1;

  if (event.printMode === 'off' && role === null) return jsonError('Cetak tidak aktif untuk event ini', 403);
  // Guests' phones can't reach the booth printer: their requests always go to
  // the owner's queue (Print Station), whatever the booth's own print mode.

  const supabase = createServerClient();
  if (role === null) {
    const used = await guestPrintsUsed(supabase, session.id);
    if (used + copies > event.maxGuestPrints) {
      return jsonError(
        event.maxGuestPrints === 0 ? 'Cetak dari HP tamu tidak diizinkan' : `Batas cetak tercapai (${event.maxGuestPrints} lembar per sesi)`,
        429,
      );
    }
  }
  const source = role ? 'booth' : 'guest';

  if (mode === 'browser') {
    const paper = paperById(typeof body.paper === 'string' ? body.paper : event.printPaper).id;
    await recordBrowserPrint(supabase, session.id, event.id, type, copies, paper, source);
    return NextResponse.json({ ok: true });
  }

  if (type === 'ai' && !isUuid(body.aiId)) return jsonError('aiId wajib', 400);
  if (type === 'edit' && typeof body.editPath !== 'string') return jsonError('editPath wajib', 400);
  const result = await enqueuePrint(supabase, {
    sessionId: session.id,
    eventId: event.id,
    type,
    copies,
    source,
    paper: event.printPaper,
    aiGenerationId: type === 'ai' ? (body.aiId as string) : undefined,
    editPath: type === 'edit' ? (body.editPath as string) : undefined,
  });
  if ('error' in result) return jsonError(result.error, 400);
  return NextResponse.json({ ok: true, printJobId: result.id });
}
