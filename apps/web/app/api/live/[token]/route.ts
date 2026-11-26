/**
 * GET /api/live/[token]?after=<iso>&msgAfter=<iso>
 * Public feed for the live gallery screen (polled every few seconds).
 */
import { NextRequest, NextResponse } from 'next/server';
import { eventByPublicToken, guestbookEntries, isIsoDate, liveItems, wallStickers } from '@/lib/community';
import { isUuid } from '@/lib/security';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const ev = await eventByPublicToken(token);
  if (!ev || !ev.liveEnabled) return jsonError('Galeri live tidak aktif', 404);
  const after = request.nextUrl.searchParams.get('after');
  const msgAfter = request.nextUrl.searchParams.get('msgAfter');
  // Sessions already on screen: only their (tiny) sticker JSON is refreshed,
  // so guests' stickers appear without re-downloading any photo.
  const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').filter(isUuid).slice(0, 60);
  const [items, messages, stickers] = await Promise.all([
    liveItems(ev.id, isIsoDate(after) ? after : null, isIsoDate(after) ? 20 : 30),
    ev.guestbookEnabled ? guestbookEntries(ev.id, { after: isIsoDate(msgAfter) ? msgAfter : null, limit: 20 }) : Promise.resolve([]),
    wallStickers(ids),
  ]);
  return NextResponse.json({ items, messages, guestbook: ev.guestbookEnabled, stickers: Object.fromEntries(stickers) }, { headers: { 'Cache-Control': 'no-store' } });
}
