/**
 * Paper sizes + layout math, shared by the browser print dialog, the booth
 * (print-ready sheet for the print station) and the server (AI prints).
 * All sizes in millimetres; raster output at 300 DPI.
 */

export const PRINT_DPI = 300;

export interface Paper {
  id: string;
  label: string;
  /** Portrait width/height in mm. For thermal rolls height is 0 (= auto). */
  widthMm: number;
  heightMm: number;
  hint: string;
}

export const PAPERS: Paper[] = [
  { id: '4x6', label: '4R · 4×6"', widthMm: 101.6, heightMm: 152.4, hint: 'Kertas foto standar photobooth (DNP, Epson, Selphy KP)' },
  { id: '2x6', label: 'Strip 2×6"', widthMm: 50.8, heightMm: 152.4, hint: 'Strip tunggal (printer yang mendukung potong 2")' },
  { id: '5x7', label: '5×7"', widthMm: 127, heightMm: 177.8, hint: '2L / 5R' },
  { id: 'postcard', label: 'Postcard 100×148mm', widthMm: 100, heightMm: 148, hint: 'Canon Selphy postcard' },
  { id: 'a6', label: 'A6', widthMm: 105, heightMm: 148, hint: '' },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210, hint: '' },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297, hint: 'Printer kantor biasa' },
  { id: 'thermal80', label: 'Struk 80mm', widthMm: 80, heightMm: 0, hint: 'Printer thermal 80mm (panjang otomatis)' },
  { id: 'thermal58', label: 'Struk 58mm', widthMm: 58, heightMm: 0, hint: 'Printer thermal 58mm (panjang otomatis)' },
];

export type PrintLayout = 'auto' | 'fit' | 'fill' | 'duplicate' | 'grid';

export const LAYOUTS: Array<{ id: PrintLayout; label: string; hint: string }> = [
  { id: 'auto', label: 'Otomatis', hint: 'Strip 2×6 → 2 strip per lembar 4×6; selain itu pas satu halaman' },
  { id: 'fit', label: 'Pas (tanpa potong)', hint: 'Seluruh gambar terlihat, sisa kertas putih' },
  { id: 'fill', label: 'Penuh (crop)', hint: 'Memenuhi kertas, tepi bisa terpotong' },
  { id: 'duplicate', label: '2 per lembar', hint: 'Dua salinan berdampingan (strip) untuk digunting' },
  { id: 'grid', label: 'Isi lembar', hint: 'Sebanyak mungkin salinan dalam satu lembar' },
];

export function paperById(id: string | null | undefined): Paper {
  return PAPERS.find((p) => p.id === id) ?? PAPERS[0];
}

export const mmToPx = (mm: number) => Math.round((mm / 25.4) * PRINT_DPI);

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** cover = crop to fill the cell, contain = letterbox */
  fit: 'cover' | 'contain';
}

export interface SheetPlan {
  /** Physical page size actually used (orientation applied). */
  pageWidthMm: number;
  pageHeightMm: number;
  widthPx: number;
  heightPx: number;
  placements: Placement[];
  layout: Exclude<PrintLayout, 'auto'>;
}

/**
 * Computes the page + where each copy of the image goes.
 * `imageW/imageH` only matter for their ratio.
 */
export function planSheet(paperId: string, imageW: number, imageH: number, layout: PrintLayout = 'auto', marginMm = 0): SheetPlan {
  const paper = paperById(paperId);
  const ratio = imageW / imageH;

  // Thermal roll: width fixed, length follows the image.
  if (paper.heightMm === 0) {
    const widthPx = mmToPx(paper.widthMm);
    const m = mmToPx(marginMm);
    const innerW = widthPx - 2 * m;
    const h = Math.round(innerW / ratio);
    const heightPx = h + 2 * m;
    return {
      pageWidthMm: paper.widthMm,
      pageHeightMm: (heightPx / PRINT_DPI) * 25.4,
      widthPx,
      heightPx,
      placements: [{ x: m, y: m, w: innerW, h, fit: 'contain' }],
      layout: 'fit',
    };
  }

  let resolved: SheetPlan['layout'] =
    layout === 'auto'
      ? ratio < 0.45 && paper.widthMm / paper.heightMm > 0.5
        ? 'duplicate'
        : 'fit'
      : layout;

  // Orientation: landscape image on a single-image layout → landscape page.
  let pw = paper.widthMm;
  let ph = paper.heightMm;
  if ((resolved === 'fit' || resolved === 'fill') && ratio > 1.05) [pw, ph] = [ph, pw];
  if (resolved === 'duplicate' && ratio > 1.05) [pw, ph] = [ph, pw];

  const widthPx = mmToPx(pw);
  const heightPx = mmToPx(ph);
  const m = mmToPx(marginMm);
  const innerW = widthPx - 2 * m;
  const innerH = heightPx - 2 * m;

  const placements: Placement[] = [];
  if (resolved === 'fit' || resolved === 'fill') {
    placements.push({ x: m, y: m, w: innerW, h: innerH, fit: resolved === 'fill' ? 'cover' : 'contain' });
  } else if (resolved === 'duplicate') {
    // Two cells side by side (portrait images) or stacked (landscape images).
    const gap = m > 0 ? m : 0;
    if (ratio <= 1.05) {
      const cw = (innerW - gap) / 2;
      placements.push({ x: m, y: m, w: cw, h: innerH, fit: 'contain' }, { x: m + cw + gap, y: m, w: cw, h: innerH, fit: 'contain' });
    } else {
      const ch = (innerH - gap) / 2;
      placements.push({ x: m, y: m, w: innerW, h: ch, fit: 'contain' }, { x: m, y: m + ch + gap, w: innerW, h: ch, fit: 'contain' });
    }
  } else {
    // grid: find the column count that gives the biggest copies.
    let best = { cols: 1, rows: 1, w: 0, h: 0 };
    const gap = Math.max(mmToPx(2), m);
    for (let cols = 1; cols <= 6; cols++) {
      const cw = (innerW - gap * (cols - 1)) / cols;
      const chFromW = cw / ratio;
      const rows = Math.max(1, Math.floor((innerH + gap) / (chFromW + gap)));
      const ch = Math.min(chFromW, (innerH - gap * (rows - 1)) / rows);
      const w = ch * ratio;
      if (w * ch * cols * rows > best.w * best.h * best.cols * best.rows) best = { cols, rows, w, h: ch };
    }
    const totalW = best.cols * best.w + (best.cols - 1) * gap;
    const totalH = best.rows * best.h + (best.rows - 1) * gap;
    const ox = m + (innerW - totalW) / 2;
    const oy = m + (innerH - totalH) / 2;
    for (let r = 0; r < best.rows; r++)
      for (let c = 0; c < best.cols; c++)
        placements.push({ x: ox + c * (best.w + gap), y: oy + r * (best.h + gap), w: best.w, h: best.h, fit: 'contain' });
    resolved = 'grid';
  }

  return { pageWidthMm: pw, pageHeightMm: ph, widthPx, heightPx, placements, layout: resolved };
}
