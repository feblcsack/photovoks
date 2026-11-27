/** GET /api/admin/dev/status — everything the developer panel shows. */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { devOverview } from '@/lib/devtools';

export const maxDuration = 30;

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await devOverview(), { headers: { 'Cache-Control': 'no-store' } });
}
