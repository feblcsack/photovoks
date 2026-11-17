// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeSketchCardServer, composeSketchSheetServer } from '../canvas/server-compose';

describe('server-compose (sharp)', () => {
  it('produces a 600×1800 PNG card from any input size', async () => {
    const input = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer();
    const card = await composeSketchCardServer(input);
    const meta = await sharp(card).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 600, 1800]);
  });

  it('produces a 1205×1795 JPEG sheet with a white right half', async () => {
    const input = await sharp({ create: { width: 600, height: 1800, channels: 3, background: '#000000' } })
      .png()
      .toBuffer();
    const sheet = await composeSketchSheetServer(input, 0);
    const meta = await sharp(sheet).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1205, 1795]);

    const { data, info } = await sharp(sheet).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    expect(px(100, 900)).toBeLessThan(30); // card area (black)
    expect(px(1000, 900)).toBeGreaterThan(225); // right half (white)
  });
});
