/**
 * Server-side image composition for the AI doodle (SERVER ONLY).
 *
 * Uses `sharp` (prebuilt binaries — no native toolchain needed, unlike
 * node-canvas).
 *
 *  - composeSketchCardServer  — any image → 600×1800 PNG (cover-crop)
 *  - composeSketchSheetServer — card → 1205×1795 JPEG print sheet
 *    (card on the left of the tear line, right half white)
 */
import sharp from 'sharp';

const STRIP_W = 600;
const STRIP_H = 1800;
const SHEET_W = 1205;
const SHEET_H = 1795;
const DEFAULT_TEAR_LINE_X = 602;

export async function composeSketchCardServer(sketchBuffer: Buffer): Promise<Buffer> {
  return sharp(sketchBuffer)
    .rotate() // honour EXIF orientation
    .resize(STRIP_W, STRIP_H, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
}

export async function composeSketchSheetServer(
  cardBuffer: Buffer,
  tearLineOffsetPx: number,
): Promise<Buffer> {
  const tearX = Math.max(1, Math.min(SHEET_W, DEFAULT_TEAR_LINE_X + Math.round(tearLineOffsetPx || 0)));
  const visibleW = Math.min(STRIP_W, tearX);
  const visibleH = Math.min(STRIP_H, SHEET_H);

  const card = await sharp(cardBuffer)
    .resize(STRIP_W, STRIP_H, { fit: 'cover' })
    .extract({ left: 0, top: 0, width: visibleW, height: visibleH })
    .png()
    .toBuffer();

  return sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: '#ffffff' },
  })
    .composite([{ input: card, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
