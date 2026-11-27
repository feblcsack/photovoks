/** PATCH /api/admin/dev/settings { group, value } — save one settings group. */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { saveSettingsGroup, type SettingsGroup } from '@/lib/settings';
import { DEFAULT_SETTINGS } from '@/lib/settings-shared';
import { log } from '@/lib/logger';

export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await readJson(request);
  const group = body?.group as SettingsGroup;
  if (!group || !(group in DEFAULT_SETTINGS) || !body?.value || typeof body.value !== 'object') return jsonError('Body tidak valid', 400);
  try {
    const settings = await saveSettingsGroup(group, body.value as never);
    log({ level: 'info', event: 'settings.saved', details: { group } });
    return NextResponse.json({ settings });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Gagal menyimpan', 500);
  }
}
