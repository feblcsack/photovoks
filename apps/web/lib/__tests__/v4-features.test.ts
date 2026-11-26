import { describe, expect, it, vi } from 'vitest';

// next/font only works inside the Next compiler.
vi.mock('@/app/fonts', () => {
  const f = { style: { fontFamily: 'sans-serif' }, variable: '' };
  return { jakarta: f, playfair: f, spaceMono: f, bebas: f, caveat: f, patrickHand: f, pacifico: f, bagel: f, specialElite: f, gochi: f, fontVariables: '' };
});

import { ZINE_CELLS, ZINE_PAPERS, autoFill, blankPage, pageSizeMm } from '@/lib/zine/layout';
import { sanitizeWallStickers, MAX_WALL_STICKERS } from '@/lib/y2k-stickers';
import { autoLayoutSlots } from '@/components/frame-builder/useEditor';
import { slotCountOf, type FrameDesign, type PhotoElement } from '@/lib/frames/types';
import { allowedFilterList } from '@/lib/booth/media';

describe('mini zine fold map', () => {
  it('uses every cell of the 4×2 sheet exactly once', () => {
    const keys = new Set(ZINE_CELLS.map((c) => `${c.col},${c.row}`));
    expect(keys.size).toBe(8);
  });
  it('prints the top row upside-down and the bottom row upright', () => {
    for (const c of ZINE_CELLS) expect(c.flipped).toBe(c.row === 0);
  });
  it('places back + front covers side by side on the bottom row, pages 1–2 next to them', () => {
    expect(ZINE_CELLS[7]).toMatchObject({ col: 0, row: 1 }); // back
    expect(ZINE_CELLS[0]).toMatchObject({ col: 1, row: 1 }); // front
    expect(ZINE_CELLS[1]).toMatchObject({ col: 2, row: 1 });
    expect(ZINE_CELLS[2]).toMatchObject({ col: 3, row: 1 });
    // Top row right→left continues 3,4,5,6.
    expect([3, 4, 5, 6].map((i) => ZINE_CELLS[i].col)).toEqual([3, 2, 1, 0]);
  });
  it('A4 pages are A7-ish (74×105 mm)', () => {
    const a4 = ZINE_PAPERS.find((p) => p.id === 'a4')!;
    const s = pageSizeMm(a4);
    expect(Math.round(s.w)).toBe(74);
    expect(Math.round(s.h)).toBe(105);
  });
  it('autoFill puts photos on photo pages and skips text pages', () => {
    const pages = autoFill(Array.from({ length: 8 }, (_, i) => blankPage(i, 'T', 'S')), ['a', 'b']);
    expect(pages[0].images[0]).toBe('a');
    expect(pages[7].images[0]).toBeNull(); // back cover = text
  });
});

describe('wall stickers', () => {
  it('drops unknown ids, clamps values and caps the count', () => {
    const out = sanitizeWallStickers([
      { id: 'star', x: 5, y: -3, s: 9, r: 999 },
      { id: '<script>', x: 0.5, y: 0.5, s: 0.2, r: 0 },
      ...Array.from({ length: 20 }, () => ({ id: 'heart', x: 0.5, y: 0.5, s: 0.2, r: 0 })),
    ]);
    expect(out[0]).toEqual({ id: 'star', x: 1.2, y: -0.2, s: 0.8, r: 180 });
    expect(out.every((s) => s.id !== '<script>')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_WALL_STICKERS);
  });
  it('returns [] for garbage', () => {
    expect(sanitizeWallStickers('x')).toEqual([]);
    expect(sanitizeWallStickers(null)).toEqual([]);
  });
});

describe('twin slots (one photo in several slots)', () => {
  const base: FrameDesign = { version: 2, width: 1200, height: 1800, background: { color: '#fff' }, elements: [] };
  it('repeat across 2 columns → 6 slots but only 3 photos', () => {
    const d = autoLayoutSlots(base, { count: 3, cols: 2, padding: 40, gap: 20, footer: 100, radius: 0, repeat: true });
    const photos = d.elements.filter((e): e is PhotoElement => e.type === 'photo');
    expect(photos).toHaveLength(6);
    expect(slotCountOf(d)).toBe(3);
    // Left and right of each row share the same photo.
    expect(photos.map((p) => p.slot)).toEqual([0, 0, 1, 1, 2, 2]);
  });
  it('without repeat keeps one photo per slot', () => {
    const d = autoLayoutSlots(base, { count: 4, cols: 2, padding: 40, gap: 20, footer: 100, radius: 0 });
    expect(slotCountOf(d)).toBe(4);
  });
});

describe('vintage filter family', () => {
  it('enabling "vintage" unlocks the whole family', () => {
    const ids = allowedFilterList(['original', 'vintage']).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['sepia', 'noir', 'film', 'flash']));
  });
  it('without "vintage" the family stays hidden', () => {
    const ids = allowedFilterList(['original', 'bw']).map((f) => f.id);
    expect(ids).not.toContain('sepia');
  });
});

describe('Y2K sticker SVGs', () => {
  it('every sticker is well-formed XML (a broken SVG renders as a missing image)', async () => {
    const { Y2K_STICKERS } = await import('@/lib/y2k-stickers');
    const { JSDOM } = await import('jsdom');
    const parser = new new JSDOM('').window.DOMParser();
    for (const s of Y2K_STICKERS) {
      const doc = parser.parseFromString(s.svg, 'image/svg+xml');
      expect(doc.getElementsByTagName('parsererror').length, s.id).toBe(0);
    }
  });
});
