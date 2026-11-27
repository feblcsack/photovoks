/**
 * POST /api/admin/dev/storage-migrate { from, to, bucket, after }
 * Copies one batch of files between storage providers. The panel calls it
 * repeatedly (resumable: `after` = last copied path). Originals are kept.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { migrateBatch } from '@/lib/devtools';
import { BUCKETS, type BucketName } from '@/lib/storage/drivers';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  const from = body?.from === 's3' ? 's3' : 'supabase';
  const to = body?.to === 's3' ? 's3' : 'supabase';
  const bucket = String(body?.bucket) as BucketName;
  if (!BUCKETS.includes(bucket)) return jsonError('Bucket tidak valid', 400);
  try {
    return NextResponse.json(await migrateBatch(from, to, bucket, typeof body?.after === 'string' ? body.after : null, 25));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal', 500);
  }
}
