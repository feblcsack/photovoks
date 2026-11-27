import { describe, expect, it, vi } from 'vitest';

// next/font only works inside the Next compiler.
vi.mock('@/app/fonts', () => {
  const f = { style: { fontFamily: 'sans-serif' }, variable: '' };
  return { jakarta: f, playfair: f, spaceMono: f, bebas: f, caveat: f, patrickHand: f, pacifico: f, bagel: f, specialElite: f, gochi: f, pixelify: f, nunito: f, anton: f, archivoBlack: f, orbitron: f, fontVariables: '' };
});

import { PIXEL_ICONS, pixelRects, pixelSvg, type PixelIconName } from '@/lib/pixel-icons';
import { MASCOTS, MASCOT_IDS, isMascotId, mascotLine, randomMascot, type GuideMoment } from '@/lib/mascots';
import { LOCATION, directionsUrl, googleMapsUrl, osmEmbedUrl } from '@/lib/location';
import { frameCategory } from '@/components/booth/XmbFramePicker';

describe('pixel icons', () => {
  const names = Object.keys(PIXEL_ICONS) as PixelIconName[];
  it('are all 16×16 grids', () => {
    for (const n of names) {
      expect(PIXEL_ICONS[n]).toHaveLength(16);
      for (const row of PIXEL_ICONS[n]) expect(row).toHaveLength(16);
    }
  });
  it('only use palette colours (every non-blank pixel becomes a rect)', () => {
    for (const n of names) {
      const painted = PIXEL_ICONS[n].join('').replace(/\./g, '').length;
      const covered = pixelRects(n).reduce((s, r) => s + r.w, 0);
      expect(covered).toBe(painted);
    }
  });
  it('render to well-formed SVG', () => {
    const doc = new DOMParser().parseFromString(pixelSvg('folder'), 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('rect').length).toBeGreaterThan(5);
  });
});

describe('buddies', () => {
  const moments: GuideMoment[] = ['hello', 'frames', 'ready', 'countdown', 'saved', 'review', 'processing', 'done', 'error', 'guest', 'guest-tools', 'zine', 'idle'];
  it('every buddy has a line for every moment and four stats 0–10', () => {
    for (const id of MASCOT_IDS) {
      for (const m of moments) expect(MASCOTS[id].lines[m].length).toBeGreaterThan(0);
      expect(MASCOTS[id].stats).toHaveLength(4);
      for (const [, v] of MASCOTS[id].stats) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });
  it('rotates lines (also for negative / large n)', () => {
    const list = MASCOTS.kaget.lines.hello;
    expect(mascotLine('kaget', 'hello', 0)).toBe(list[0]);
    expect(mascotLine('kaget', 'hello', list.length)).toBe(list[0]);
    expect(mascotLine('kaget', 'hello', -1)).toBe(list[list.length - 1]);
  });
  it('validates ids from links / storage', () => {
    expect(isMascotId('licik')).toBe(true);
    expect(isMascotId('mario')).toBe(false);
    expect(isMascotId(null)).toBe(false);
  });
  it('random pick avoids the excluded buddy', () => {
    for (let i = 0; i < 40; i++) expect(randomMascot('bokek')).not.toBe('bokek');
  });
});

describe('location (fixed: UI Depok)', () => {
  it('marker sits inside the map view', () => {
    const [w, s, e, n] = LOCATION.bbox;
    expect(LOCATION.lng).toBeGreaterThan(w);
    expect(LOCATION.lng).toBeLessThan(e);
    expect(LOCATION.lat).toBeGreaterThan(s);
    expect(LOCATION.lat).toBeLessThan(n);
  });
  it('builds map links for the campus', () => {
    expect(osmEmbedUrl()).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?bbox=.+&marker=-6\.36/);
    expect(googleMapsUrl()).toContain('-6.3603157');
    expect(directionsUrl()).toContain('destination=');
  });
});

describe('console frame picker categories', () => {
  const d = (width: number, height: number) => ({ design: { width, height } }) as Parameters<typeof frameCategory>[0];
  it('sorts frames by shape', () => {
    expect(frameCategory(d(600, 1800))).toBe('strip');
    expect(frameCategory(d(1200, 1800))).toBe('portrait');
    expect(frameCategory(d(1200, 1200))).toBe('portrait');
    expect(frameCategory(d(1800, 1200))).toBe('landscape');
  });
});
