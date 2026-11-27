/**
 * Low-poly pals: ids, labels, per-shot placement and baking into a photo.
 * No three.js here (the models live in components/lowpoly/pals.ts and are
 * only loaded when the feature is on).
 */

export const PAL_IDS = ['bebek', 'merpati', 'ayam', 'domba', 'monyet', 'kepiting', 'hiu', 'camar'] as const;
export type PalId = (typeof PAL_IDS)[number];

export const PAL_LABELS: Record<PalId, string> = {
  bebek: 'Bebek',
  merpati: 'Merpati',
  ayam: 'Ayam',
  domba: 'Domba',
  monyet: 'Monyet',
  kepiting: 'Kepiting',
  hiu: 'Hiu',
  camar: 'Camar',
};

// ── Placement + baking into photos ───────────────────────────────────────────

export interface PalPlacement {
  id: PalId;
  /** Centre, as fractions of the photo. */
  x: number;
  y: number;
  /** Width as a fraction of the photo width. */
  w: number;
  flip: boolean;
  rot: number;
}

/** Deterministic, varied placement for a shot (corners, never over the face centre). */
export function palFor(seedValue: number, shotIndex: number): PalPlacement {
  let s = Math.floor(seedValue * 1e6) + shotIndex * 7919;
  const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const id = PAL_IDS[Math.floor(r() * PAL_IDS.length)];
  const corner = Math.floor(r() * 3); // bottom-left, bottom-right, top-right
  const w = 0.32 + r() * 0.08;
  const x = corner === 0 ? 0.21 : 0.79;
  const y = corner === 2 ? 0.2 : 0.79;
  // Pals face right; the ones in the right-hand corners turn to face inwards.
  return { id, x, y, w, flip: corner !== 0, rot: (r() - 0.5) * 14 };
}

/** Draws the pal onto a photo canvas in place (photo pixels). */
export function bakePal(target: HTMLCanvasElement, sprite: HTMLCanvasElement, p: PalPlacement) {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  // Width is a fraction of the photo; height keeps the sprite's own shape,
  // capped so tall pals never cover more than ~45 % of the photo height.
  let w = target.width * p.w;
  let h = (w * sprite.height) / sprite.width;
  const maxH = target.height * 0.45;
  if (h > maxH) {
    w *= maxH / h;
    h = maxH;
  }
  ctx.save();
  ctx.translate(target.width * p.x, target.height * p.y);
  ctx.rotate((p.rot * Math.PI) / 180);
  if (p.flip) ctx.scale(-1, 1);
  // soft drop shadow so the pal sits "in" the photo
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = w * 0.05;
  ctx.shadowOffsetY = w * 0.03;
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  ctx.restore();
}
