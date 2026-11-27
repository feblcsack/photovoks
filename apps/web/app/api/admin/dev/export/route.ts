/** GET /api/admin/dev/export — JSON backup of the configuration (download). */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { exportConfig } from '@/lib/devtools';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const data = await exportConfig();
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="photovoks-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
