/** POST /api/admin/dev/storage-test { driver } — write/read/delete a tiny file. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { readJson } from '@/lib/http';
import { storageRoundTrip } from '@/lib/devtools';

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  return NextResponse.json(await storageRoundTrip(body?.driver === 's3' ? 's3' : 'supabase'));
}
