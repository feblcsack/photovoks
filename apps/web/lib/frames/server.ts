/**
 * Frame loading for the server: legacy conversion + signed asset URLs.
 * SERVER ONLY.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SlotGeometry } from '@photovoks/shared-types';
import type { FrameDesign, FrameRecord } from './types';
import { applyQrPlacement, collectAssets, sanitizeDesign, sanitizeQrPlacement, slotCountOf } from './types';

export const FRAME_COLUMNS =
  'id, name, category, is_active, width, height, slot_count, design, storage_path, slot_geometry, thumbnail_path, sort_order, updated_at';

/** Legacy frames: PNG overlay (600×1800) + fractional slot geometry. */
export function legacyToDesign(storagePath: string | null, geometry: SlotGeometry[] | null): FrameDesign {
  const W = 600;
  const H = 1800;
  const slots = Array.isArray(geometry) ? geometry : [];
  return {
    version: 2,
    width: W,
    height: H,
    background: { color: '#ffffff' },
    elements: [
      ...slots.map((s, i) => ({
        id: `slot${i}`,
        type: 'photo' as const,
        slot: i,
        x: s.x * W,
        y: s.y * H,
        w: s.w * W,
        h: s.h * H,
        radius: 0,
        borderWidth: 0,
        borderColor: '#000000',
      })),
      ...(storagePath
        ? [{ id: 'overlay', name: 'Overlay PNG', type: 'image' as const, asset: { path: storagePath }, x: 0, y: 0, w: W, h: H, fit: 'stretch' as const, radius: 0 }]
        : []),
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToDesign(row: any): FrameDesign {
  const stored = row.design ? sanitizeDesign(row.design) : null;
  return stored ?? legacyToDesign(row.storage_path ?? null, row.slot_geometry ?? []);
}

/** Converts DB rows to FrameRecords with signed asset + thumbnail URLs. */
export async function hydrateFrames(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  ttlSeconds = 6 * 3600,
): Promise<FrameRecord[]> {
  const designs = rows.map(rowToDesign);
  const paths = new Set<string>();
  designs.forEach((d) => collectAssets(d).forEach((a) => paths.add(a.path)));
  rows.forEach((r) => r.thumbnail_path && paths.add(r.thumbnail_path));

  const urls = new Map<string, string>();
  const list = Array.from(paths);
  if (list.length) {
    const { data } = await supabase.storage.from('frames').createSignedUrls(list, ttlSeconds);
    data?.forEach((entry) => {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
    });
  }

  return rows.map((row, i) => {
    const design = designs[i];
    if (design.background.image) design.background.image.url = urls.get(design.background.image.path);
    for (const el of design.elements) if (el.type === 'image') el.asset.url = urls.get(el.asset.path);
    return {
      id: row.id,
      name: row.name,
      category: row.category ?? 'strip',
      isActive: row.is_active,
      width: design.width,
      height: design.height,
      slotCount: slotCountOf(design),
      design,
      thumbnailUrl: row.thumbnail_path ? urls.get(row.thumbnail_path) ?? null : null,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Frames assigned to an event, in event order, with the event's session-QR
 * placement attached. `applyQr` bakes the placement into the design (booth).
 */
export async function framesForEvent(supabase: SupabaseClient, eventId: string, onlyActive = true, applyQr = false): Promise<FrameRecord[]> {
  const { data: links } = await supabase
    .from('event_frames')
    .select('frame_id, sort_order, qr')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });
  const placements = new Map((links ?? []).map((l) => [l.frame_id as string, sanitizeQrPlacement(l.qr)]));
  const ids = (links ?? []).map((l) => l.frame_id as string);
  if (!ids.length) return [];
  let q = supabase.from('frames').select(FRAME_COLUMNS).in('id', ids);
  if (onlyActive) q = q.eq('is_active', true);
  const { data: rows } = await q;
  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = (rows ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const frames = await hydrateFrames(supabase, sorted);
  return frames.map((f) => {
    const qrPlacement = placements.get(f.id) ?? null;
    // Stored thumbnails don't include the event's QR override → render live instead.
    return applyQr && qrPlacement
      ? { ...f, qrPlacement, design: applyQrPlacement(f.design, qrPlacement), thumbnailUrl: null }
      : { ...f, qrPlacement };
  });
}
