/**
 * Server-side canvas composition utilities for the Photovoks sketch worker.
 *
 * Uses the `canvas` npm package (node-canvas) since OffscreenCanvas is a
 * browser API and is not available in the Vercel Node.js runtime.
 *
 * Exports:
 *  - composeSketchCardServer  — sketch buffer → 600×1800 px PNG Buffer
 *  - composeSketchSheetServer — card buffer   → ~1205×1795 px JPEG Buffer
 *
 * Requirements: 10.12, 12.3
 */

import { createCanvas, loadImage, Canvas as NodeCanvas } from 'canvas';

// ── Types ─────────────────────────────────────────────────────────────────────
// node-canvas's CanvasRenderingContext2D accepts its own Image/Canvas types for
// drawImage(), which conflicts with the global DOM CanvasRenderingContext2D when
// TypeScript has "dom" in lib. We cast via the NodeCanvas type to avoid the conflict.
type NodeCanvasCtx = ReturnType<InstanceType<typeof NodeCanvas>['getContext']>;

// ── Dimensions (mirror client-side constants from compose.ts) ─────────────────

/** Canonical strip / sketch-card width in pixels */
const STRIP_W = 600;
/** Canonical strip / sketch-card height in pixels */
const STRIP_H = 1800;

/** Sheet width in pixels — two cards side-by-side */
const SHEET_W = 1205;
/** Sheet height in pixels */
const SHEET_H = 1795;

/** Default tear-line x-position in pixels */
const DEFAULT_TEAR_LINE_X = 602;

/** JPEG quality for sheet output (≥ 0.9 per Requirement 6.2 / 12.3) */
const SHEET_JPEG_QUALITY = 0.92;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compose a print-ready sketch card at exactly 600×1800 px.
 *
 * The input sketch image is scaled to cover the full 600×1800 canvas using
 * object-fit:cover semantics (centred crop). The output is a PNG Buffer.
 *
 * Requirement 10.12
 *
 * @param sketchBuffer  Raw image Buffer from the Gemini API response.
 * @returns             PNG Buffer, exactly 600×1800 px.
 */
export async function composeSketchCardServer(sketchBuffer: Buffer): Promise<Buffer> {
  const canvas = createCanvas(STRIP_W, STRIP_H);
  const ctx = canvas.getContext('2d') as unknown as NodeCanvasCtx;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // Load sketch image
  const img = await loadImage(sketchBuffer);

  // Draw using object-fit: cover — scale proportionally and centre-crop
  const srcAspect = img.width / img.height;
  const destAspect = STRIP_W / STRIP_H;

  let srcX = 0;
  let srcY = 0;
  let srcW = img.width;
  let srcH = img.height;

  if (srcAspect > destAspect) {
    // Image is wider — crop horizontally
    srcW = Math.round(img.height * destAspect);
    srcX = Math.round((img.width - srcW) / 2);
  } else if (srcAspect < destAspect) {
    // Image is taller — crop vertically
    srcH = Math.round(img.width / destAspect);
    srcY = Math.round((img.height - srcH) / 2);
  }

  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, STRIP_W, STRIP_H);

  return canvas.toBuffer('image/png');
}

/**
 * Compose the sketch print sheet.
 *
 * Layout:
 *  - Left half  (x = 0):                sketch card content
 *  - Right half (x ≥ tearLine):          white fill
 *
 * Output: ~1205×1795 px JPEG at quality 0.92.
 *
 * Requirement 12.3
 *
 * @param cardBuffer       PNG Buffer of the 600×1800 sketch card.
 * @param tearLineOffsetPx Fine-tune offset from the 602 px default tear line.
 * @returns                JPEG Buffer, ~1205×1795 px.
 */
export async function composeSketchSheetServer(
  cardBuffer: Buffer,
  tearLineOffsetPx: number,
): Promise<Buffer> {
  const canvas = createCanvas(SHEET_W, SHEET_H);
  const ctx = canvas.getContext('2d') as unknown as NodeCanvasCtx;

  // White background (covers the right half and any gap)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  // Load the sketch card
  const card = await loadImage(cardBuffer);

  // Compute the tear line
  const tearX = DEFAULT_TEAR_LINE_X + tearLineOffsetPx;

  // Draw sketch card on the left half only (clipped to tearX)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, tearX, SHEET_H);
  ctx.clip();
  ctx.drawImage(card, 0, 0, STRIP_W, STRIP_H);
  ctx.restore();

  // The right half is already white from the background fill.

  return canvas.toBuffer('image/jpeg', { quality: SHEET_JPEG_QUALITY });
}
