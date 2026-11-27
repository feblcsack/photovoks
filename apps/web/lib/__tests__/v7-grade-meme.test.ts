import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/fonts', () => {
  const f = { style: { fontFamily: 'sans-serif' }, variable: '' };
  return { jakarta: f, playfair: f, spaceMono: f, bebas: f, caveat: f, patrickHand: f, pacifico: f, bagel: f, specialElite: f, gochi: f, pixelify: f, nunito: f, anton: f, archivoBlack: f, orbitron: f, fontVariables: '' };
});

import { ADJUST_SLIDERS, combine, isNeutral, NO_ADJUST, PRESETS, sanitizeAdjust } from '@/lib/booth/grade';
import { allowedFilterList, FILTERS } from '@/lib/booth/media';
import { isMemeStyle, MEME_STYLES } from '@/lib/booth/meme';
import { isWordArtStyle } from '@/lib/wordart';

describe('grading engine', () => {
  it('every filter has a preset', () => {
    for (const f of FILTERS) expect(PRESETS[f.id], f.id).toBeDefined();
  });
  it('sanitizeAdjust clamps, rounds and drops junk', () => {
    const a = sanitizeAdjust({ exposure: 500, fade: -20, contrast: 12.6, warmth: Number.NaN } as never);
    expect(a.exposure).toBe(100);
    expect(a.fade).toBe(0);
    expect(a.contrast).toBe(13);
    expect(a.warmth).toBe(0);
    expect(Object.keys(a).sort()).toEqual(ADJUST_SLIDERS.map((s) => s.key).sort());
  });
  it('isNeutral', () => {
    expect(isNeutral(NO_ADJUST)).toBe(true);
    expect(isNeutral(undefined)).toBe(true);
    expect(isNeutral({ ...NO_ADJUST, grain: 5 })).toBe(false);
  });
  it('combine adds user adjustments on top of the preset', () => {
    const g = combine(PRESETS.cinema, { ...NO_ADJUST, exposure: 20 });
    expect(g.exposure).toBe((PRESETS.cinema.exposure ?? 0) + 20);
    expect(g.splitShadow).toEqual(PRESETS.cinema.splitShadow);
  });
});

describe('filters', () => {
  it('bold family unlocks with vivid', () => {
    const ids = allowedFilterList(['original', 'vivid']).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['vivid', 'cinema', 'chrome', 'digicam', 'polaroid', 'lomo', 'pinky']));
    expect(ids).not.toContain('noir');
  });
});

describe('memes', () => {
  it('has the new templates with unique ids', () => {
    const ids = MEME_STYLES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['freaky', 'swag', 'cukup', 'simulasi', 'kabur', 'offdulu', 'pagi', 'demotivasi', 'gorengan', 'vaporwave']) expect(isMemeStyle(id), id).toBe(true);
    expect(isMemeStyle('nope')).toBe(false);
  });
  it('new WordArt styles registered', () => {
    for (const id of ['gold', 'lime', 'ice']) expect(isWordArtStyle(id)).toBe(true);
  });
});
