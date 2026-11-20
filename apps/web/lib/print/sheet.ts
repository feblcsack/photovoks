/**
 * Browser-side print sheet rendering + printing.
 *
 * Printing uses a hidden iframe whose document has an exact `@page` size and
 * zero margins, with the sheet image sized in physical units (mm). This keeps
 * the layout identical inside the print dialog. Browsers still show their own
 * dialog — silent printing is not possible from a web page.
 */
import { createCanvas, canvasToBlob, drawFitted, type Drawable } from '@/lib/frames/render';
import { planSheet, type PrintLayout, type SheetPlan } from './papers';

export interface SheetResult {
  canvas: HTMLCanvasElement;
  plan: SheetPlan;
}

export function renderSheet(image: Drawable & { width?: number; height?: number }, imageW: number, imageH: number, paperId: string, layout: PrintLayout = 'auto', marginMm = 0): SheetResult {
  const plan = planSheet(paperId, imageW, imageH, layout, marginMm);
  const canvas = createCanvas(plan.widthPx, plan.heightPx);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  for (const p of plan.placements) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    drawFitted(ctx, image, p.x, p.y, p.w, p.h, p.fit);
    ctx.restore();
  }
  // Light cut guide between duplicated strips.
  if (plan.layout === 'duplicate' && plan.placements.length === 2) {
    const [a, b] = plan.placements;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    if (b.x > a.x) {
      const x = (a.x + a.w + b.x) / 2;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 24);
      ctx.moveTo(x, canvas.height - 24);
      ctx.lineTo(x, canvas.height);
    } else {
      const y = (a.y + a.h + b.y) / 2;
      ctx.moveTo(0, y);
      ctx.lineTo(24, y);
      ctx.moveTo(canvas.width - 24, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
  }
  return { canvas, plan };
}

export async function sheetToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return canvasToBlob(canvas, 'image/jpeg', 0.93);
}

/**
 * Opens the system print dialog for a rendered sheet.
 * Resolves after the dialog closes (or a timeout on browsers without
 * `afterprint` support).
 */
export async function printSheet(sheet: Blob, plan: SheetPlan, copies = 1): Promise<void> {
  const url = URL.createObjectURL(sheet);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const w = plan.pageWidthMm.toFixed(2);
  const h = plan.pageHeightMm.toFixed(2);
  const pages = Array.from({ length: Math.max(1, Math.min(20, copies)) }, () => `<div class="page"><img src="${url}" alt=""></div>`).join('');
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><title>Photovoks print</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { width: ${w}mm; height: ${h}mm; overflow: hidden; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    img { display: block; width: ${w}mm; height: ${h}mm; object-fit: contain; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>${pages}</body></html>`);
  doc.close();

  const imgs = Array.from(doc.images);
  await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }))));

  const win = iframe.contentWindow!;
  await new Promise<void>((resolve) => {
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 500);
    };
    // Safari may return from print() before the dialog closes, so the iframe
    // is only removed after `afterprint` (or a generous fallback).
    win.addEventListener('afterprint', () => {
      cleanup();
      resolve();
    });
    win.focus();
    win.print(); // Blocks in Chrome until the dialog closes.
    setTimeout(resolve, 1200);
    setTimeout(cleanup, 120_000);
  });
}

/** Loads an image (URL or Blob) into an ImageBitmap for printing. */
export async function loadPrintable(src: string | Blob): Promise<ImageBitmap> {
  const blob = typeof src === 'string' ? await fetch(src).then((r) => {
    if (!r.ok) throw new Error('Gagal memuat gambar');
    return r.blob();
  }) : src;
  return createImageBitmap(blob);
}
