/**
 * GET    /api/admin/frames/[id]  — frame with resolved asset URLs
 * PATCH  /api/admin/frames/[id]  { name?, design?, isActive?, category?, thumbnailPath? }
 * DELETE /api/admin/frames/[id]  — removes frame (sessions keep their files)
 * POST   /api/admin/frames/[id]  { action: 'duplicate' } — copy as new frame
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isUuid, requireAdmin } from '@/lib/security';
import { readJson, jsonError } from '@/lib/http';
import { FRAME_COLUMNS, hydrateFrames, rowToDesign } from '@/lib/frames/server';
import { FRAME_ASSET_RE, sanitizeDesign, slotCountOf } from '@/lib/frames/types';

type Ctx = { params: Promise<{ frameId: string }> };

async function load(frameId: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('frames').select(FRAME_COLUMNS).eq('id', frameId).maybeSingle();
  return { supabase, row: data };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { frameId } = await ctx.params;
  if (!isUuid(frameId)) return jsonError('Frame tidak ditemukan', 404);
  const { supabase, row } = await load(frameId);
  if (!row) return jsonError('Frame tidak ditemukan', 404);
  const [frame] = await hydrateFrames(supabase, [row]);
  return NextResponse.json({ frame });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { frameId } = await ctx.params;
  if (!isUuid(frameId)) return jsonError('Frame tidak ditemukan', 404);
  const body = await readJson(request);
  if (!body) return jsonError('Body tidak valid', 400);

  const update: Record<string, unknown> = {};
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!name) return jsonError('Nama frame wajib diisi', 400);
    update.name = name;
  }
  if ('design' in body) {
    const design = sanitizeDesign(body.design);
    if (!design) return jsonError('Desain frame tidak valid', 400);
    const slots = slotCountOf(design);
    if (slots < 1) return jsonError('Frame butuh minimal 1 slot foto', 400);
    Object.assign(update, { design, width: design.width, height: design.height, slot_count: slots });
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') return jsonError('isActive tidak valid', 400);
    update.is_active = body.isActive;
  }
  if ('category' in body && typeof body.category === 'string') update.category = body.category.slice(0, 20);
  if ('thumbnailPath' in body) {
    const p = body.thumbnailPath;
    if (typeof p !== 'string' || !FRAME_ASSET_RE.test(p) || p.includes('..')) return jsonError('thumbnailPath tidak valid', 400);
    update.thumbnail_path = p;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase.from('frames').update(update).eq('id', frameId).select('id').maybeSingle();
  if (error) return jsonError('Gagal menyimpan frame', 500);
  if (!data) return jsonError('Frame tidak ditemukan', 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { frameId } = await ctx.params;
  if (!isUuid(frameId)) return jsonError('Frame tidak ditemukan', 404);
  const supabase = createServerClient();
  const { error } = await supabase.from('frames').delete().eq('id', frameId);
  if (error) return jsonError('Gagal menghapus frame', 500);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { frameId } = await ctx.params;
  if (!isUuid(frameId)) return jsonError('Frame tidak ditemukan', 404);
  const body = await readJson(request);
  if (body?.action !== 'duplicate') return jsonError('Aksi tidak dikenal', 400);
  const { supabase, row } = await load(frameId);
  if (!row) return jsonError('Frame tidak ditemukan', 404);
  const design = rowToDesign(row);
  const { data, error } = await supabase
    .from('frames')
    .insert({
      name: `${row.name} (salinan)`.slice(0, 80),
      design,
      width: design.width,
      height: design.height,
      slot_count: slotCountOf(design),
      slot_geometry: [],
      category: row.category,
      thumbnail_path: row.thumbnail_path,
      is_active: false,
    })
    .select('id')
    .single();
  if (error || !data) return jsonError('Gagal menduplikasi', 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
