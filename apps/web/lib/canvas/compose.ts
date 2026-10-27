/**
 * Canvas composition utilities for the Photovoks booth.
 *
 * All composition runs client-side on the iPad using OffscreenCanvas where
 * available, falling back to a regular HTMLCanvasElement.
 *
 * Exports:
 *  - composeStrip   — three photos + frame PNG → 600×1800 px PNG Blob
 *  - composeSheet   — two strip instances side-by-side → ~1205×1795 px JPEG Blob
 *  - composeSketchCard  — sketch blob → 600×1800 px PNG Blob
 *  - composeSketchSheet — sketch card + blank right half → ~1205×1795 px JPEG Blob
 *
 * Requirements: 6.1, 6.2
 */

import type { SlotGeometry } from '@photovoks/shared-types';

// ── Strip & Sheet dimensions ──────────────────────────────────────────────────

/** Canonical strip width in pixels (Requirement 6.1) */
export const STRIP_W = 600;
/** Canonical strip height in pixels (Requirement 6.1) */
export const STRIP_H = 1800;

/** Sheet width in pixels — two strips side-by-side (Requirement 6.2) */
export const SHEET_W = 1205;
/** Sheet height in pixels (Requirement 6.2) */
export const SHEET_H = 1795;

/** Default tear-line x-position (Requirement 6.2) */
export const DEFAULT_TEAR_LINE_X = 602;

/** JPEG export quality for sheet output (≥ 0.9 per Requirement 6.2) */
export const SHEET_JPEG_QUALITY = 0.92;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Loads a Blob as an ImageBitmap.
 * Works in both browser main thread and OffscreenCanvas contexts.
 */
async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/**
 * Creates a canvas of the given dimensions, preferring OffscreenCanvas.
 * Returns a tuple of [canvas, context].
 */
function createCanvas(
  width: number,
  height: number,
): [OffscreenCanvas | HTMLCanvasElement, OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D] {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');
    return [canvas, ctx];
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context from HTMLCanvasElement');
  return [canvas, ctx];
}

/**
 * Converts a canvas to a Blob with the given MIME type and quality.
 */
async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    const options: ImageEncodeOptions = { type };
    if (quality !== undefined) options.quality = quality;
    return canvas.convertToBlob(options);
  }

  // Fallback for HTMLCanvasElement
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      },
      type,
      quality,
    );
  });
}

/**
 * Draws an image into a destination rectangle using "object-fit: cover"
 * semantics: the image is scaled proportionally and centred so that it fills
 * the destination rectangle, clipping any overflow.
 */
function drawImageCover(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  img: ImageBitmap,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): void {
  const srcAspect = img.width / img.height;
  const destAspect = destW / destH;

  let srcX = 0;
  let srcY = 0;
  let srcW = img.width;
  let srcH = img.height;

  if (srcAspect > destAspect) {
    // Image is wider than destination — crop horizontally
    srcW = Math.round(img.height * destAspect);
    srcX = Math.round((img.width - srcW) / 2);
  } else {
    // Image is taller than destination — crop vertically
    srcH = Math.round(img.width / destAspect);
    srcY = Math.round((img.height - srcH) / 2);
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Composites three photo blobs into a frame PNG at 600×1800 px.
 *
 * Steps:
 * 1. Create OffscreenCanvas 600×1800.
 * 2. For each slot i, draw photos[i] scaled/cropped to cover the slot rect
 *    defined by (slot.x × 600, slot.y × 1800, slot.w × 600, slot.h × 1800).
 * 3. Draw the frame PNG on top at full 600×1800.
 * 4. Return PNG Blob.
 *
 * Requirement 6.1
 *
 * @param photos   Exactly 3 Blobs — the captured photos in slot order.
 * @param frameBlob The frame overlay PNG (600×1800, with alpha channel).
 * @param geometry  Exactly 3 SlotGeometry entries matching the frame's slots.
 */
export async function composeStrip(
  photos: Blob[],
  frameBlob: Blob,
  geometry: SlotGeometry[],
): Promise<Blob> {
  if (photos.length !== 3) {
    throw new Error(`composeStrip expects exactly 3 photos, got ${photos.length}`);
  }
  if (geometry.length !== 3) {
    throw new Error(`composeStrip expects exactly 3 slot geometries, got ${geometry.length}`);
  }

  const [canvas, ctx] = createCanvas(STRIP_W, STRIP_H);

  // Load all images in parallel
  const [frameImg, ...photoImgs] = await Promise.all([
    blobToImageBitmap(frameBlob),
    ...photos.map(blobToImageBitmap),
  ]);

  // 1. Fill background with white (transparent frame areas become white)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // 2. Draw each photo into its slot using cover-fit scaling
  for (let i = 0; i < 3; i++) {
    const slot = geometry[i];
    const destX = Math.round(slot.x * STRIP_W);
    const destY = Math.round(slot.y * STRIP_H);
    const destW = Math.round(slot.w * STRIP_W);
    const destH = Math.round(slot.h * STRIP_H);

    // Clip to slot boundaries so photos don't bleed into adjacent slots
    ctx.save();
    ctx.beginPath();
    ctx.rect(destX, destY, destW, destH);
    ctx.clip();

    drawImageCover(ctx, photoImgs[i], destX, destY, destW, destH);

    ctx.restore();
  }

  // 3. Draw frame on top (preserves frame alpha / artwork overlay)
  ctx.drawImage(frameImg, 0, 0, STRIP_W, STRIP_H);

  // Close ImageBitmaps to free GPU memory
  frameImg.close();
  photoImgs.forEach((img) => img.close());

  return canvasToBlob(canvas, 'image/png');
}

/**
 * Composes the print sheet by placing two strip instances side-by-side.
 *
 * Output: ~1205×1795 px JPEG at quality ≥ 0.9 (configured at 0.92).
 *
 * Layout:
 *  - First copy: drawn at (0, 0)
 *  - Second copy: drawn at (DEFAULT_TEAR_LINE_X + tearLineOffsetPx, 0)
 *
 * Requirement 6.2
 *
 * @param strip           PNG Blob output from composeStrip.
 * @param tearLineOffsetPx Fine-tune offset from the 602 px default tear line.
 */
export async function composeSheet(
  strip: Blob,
  tearLineOffsetPx: number,
): Promise<Blob> {
  const [canvas, ctx] = createCanvas(SHEET_W, SHEET_H);

  const stripImg = await blobToImageBitmap(strip);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  // First strip — left side
  ctx.drawImage(stripImg, 0, 0, STRIP_W, STRIP_H);

  // Second strip — right side starting at the tear line
  const secondX = DEFAULT_TEAR_LINE_X + tearLineOffsetPx;
  ctx.drawImage(stripImg, secondX, 0, STRIP_W, STRIP_H);

  stripImg.close();

  return canvasToBlob(canvas, 'image/jpeg', SHEET_JPEG_QUALITY);
}

/**
 * Composes a print-ready sketch card at 600×1800 px.
 *
 * The sketch image is drawn to fill the full 600×1800 canvas.
 *
 * @param sketchBlob The raw AI-generated sketch image Blob.
 */
export async function composeSketchCard(sketchBlob: Blob): Promise<Blob> {
  const [canvas, ctx] = createCanvas(STRIP_W, STRIP_H);

  const sketchImg = await blobToImageBitmap(sketchBlob);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // Draw sketch to fill the full canvas
  ctx.drawImage(sketchImg, 0, 0, STRIP_W, STRIP_H);

  sketchImg.close();

  return canvasToBlob(canvas, 'image/png');
}

/**
 * Composes the sketch print sheet.
 *
 * Left half (x < tearLine): sketch card content
 * Right half (x ≥ tearLine): white fill
 *
 * Output: ~1205×1795 px JPEG at quality 0.92.
 *
 * Requirement 12.3
 *
 * @param sketchCard      PNG Blob of the 600×1800 sketch card.
 * @param tearLineOffsetPx Fine-tune offset from the 602 px default tear line.
 */
export async function composeSketchSheet(
  sketchCard: Blob,
  tearLineOffsetPx: number,
): Promise<Blob> {
  const [canvas, ctx] = createCanvas(SHEET_W, SHEET_H);

  const cardImg = await blobToImageBitmap(sketchCard);

  // Fill with white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  // Draw sketch card on the left half only
  const tearX = DEFAULT_TEAR_LINE_X + tearLineOffsetPx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, tearX, SHEET_H);
  ctx.clip();
  ctx.drawImage(cardImg, 0, 0, STRIP_W, STRIP_H);
  ctx.restore();

  cardImg.close();

  return canvasToBlob(canvas, 'image/jpeg', SHEET_JPEG_QUALITY);
}
