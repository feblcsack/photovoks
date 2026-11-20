/** GET /api/s/[token] — guest session data (polled by the guest page + booth). */
import { NextRequest, NextResponse } from 'next/server';
import { getGuestSession } from '@/lib/sessions';
import { jsonError } from '@/lib/http';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const data = await getGuestSession(token);
  if (!data) return jsonError('Sesi tidak ditemukan atau sudah kedaluwarsa', 404);
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
