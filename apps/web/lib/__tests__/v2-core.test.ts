import { afterEach, describe, expect, it, vi } from 'vitest';
import { planSheet, mmToPx } from '@/lib/print/papers';
import { sanitizeDesign, slotCountOf } from '@/lib/frames/types';
import { buildEventUpdate, normalizeEventCode, isValidEventPin, generateEventCode } from '@/lib/events';
import { legacyToDesign } from '@/lib/frames/server';
import { FRAME_TEMPLATES } from '@/lib/frames/presets';
import { openRouterProvider } from '@/lib/ai/openrouter';

describe('planSheet', () => {
  it('puts two 2x6 strips side by side on 4x6 paper (auto)', () => {
    const plan = planSheet('4x6', 600, 1800, 'auto');
    expect(plan.layout).toBe('duplicate');
    expect(plan.widthPx).toBe(mmToPx(101.6));
    expect(plan.heightPx).toBe(mmToPx(152.4));
    expect(plan.placements).toHaveLength(2);
    expect(plan.placements[1].x).toBeGreaterThan(plan.placements[0].x);
  });

  it('rotates the page for landscape images', () => {
    const plan = planSheet('4x6', 1800, 1200, 'fit');
    expect(plan.widthPx).toBeGreaterThan(plan.heightPx);
    expect(plan.placements[0]).toMatchObject({ x: 0, y: 0, fit: 'contain' });
  });

  it('thermal paper keeps width and follows image length', () => {
    const plan = planSheet('thermal80', 576, 1700, 'auto');
    expect(plan.widthPx).toBe(mmToPx(80));
    expect(plan.heightPx).toBeCloseTo((mmToPx(80) * 1700) / 576, -1);
  });

  it('grid never overflows the page', () => {
    const plan = planSheet('a4', 600, 1800, 'grid', 6);
    expect(plan.placements.length).toBeGreaterThanOrEqual(2);
    for (const p of plan.placements) {
      expect(p.x + p.w).toBeLessThanOrEqual(plan.widthPx + 0.5);
      expect(p.y + p.h).toBeLessThanOrEqual(plan.heightPx + 0.5);
    }
  });
});

describe('sanitizeDesign', () => {
  it('accepts every built-in template', () => {
    for (const t of FRAME_TEMPLATES) {
      const d = sanitizeDesign(t.build());
      expect(d, t.id).not.toBeNull();
    }
  });

  it('drops unknown elements, bad asset paths and resolved URLs', () => {
    const d = sanitizeDesign({
      width: 600,
      height: 1800,
      background: { color: 'red', image: { path: '../../etc/passwd', url: 'https://x' } },
      elements: [
        { type: 'photo', slot: 1, x: 0, y: 0, w: 10, h: 10 },
        { type: 'script', x: 0 },
        { type: 'image', asset: { path: 'frames/assets/a.png', url: 'blob:abc' }, x: 0, y: 0, w: 5, h: 5 },
        { type: 'image', asset: { path: 'sessions/x/photo_0.jpg' }, x: 0, y: 0, w: 5, h: 5 },
      ],
    });
    expect(d).not.toBeNull();
    expect(d!.background.color).toBe('#ffffff');
    expect(d!.background.image).toBeNull();
    expect(d!.elements.map((e) => e.type)).toEqual(['photo', 'image']);
    expect(d!.elements[1]).toMatchObject({ asset: { path: 'frames/assets/a.png' } });
    expect((d!.elements[1] as { asset: { url?: string } }).asset.url).toBeUndefined();
    expect(slotCountOf(d!)).toBe(2);
  });

  it('rejects absurd canvas sizes', () => {
    expect(sanitizeDesign({ width: 10, height: 10, elements: [] })).toBeNull();
    expect(sanitizeDesign({ width: 99999, height: 1800, elements: [] })).toBeNull();
  });
});

describe('legacy frames', () => {
  it('converts PNG overlay + fractional slots to a design', () => {
    const d = legacyToDesign('3f6b2c1e-1111-4222-8333-444455556666.png', [
      { x: 0.1, y: 0.1, w: 0.8, h: 0.2, aspectRatio: 1.33 },
      { x: 0.1, y: 0.4, w: 0.8, h: 0.2, aspectRatio: 1.33 },
    ]);
    expect(d.width).toBe(600);
    expect(slotCountOf(d)).toBe(2);
    expect(d.elements.at(-1)).toMatchObject({ type: 'image', w: 600, h: 1800 });
    expect(sanitizeDesign(d)).not.toBeNull();
  });
});

describe('event validation', () => {
  it('normalises codes and pins', () => {
    expect(normalizeEventCode(' qc6xj ')).toBe('QC6XJ');
    expect(normalizeEventCode('a-b')).toBeNull();
    expect(isValidEventPin('1234')).toBe(true);
    expect(isValidEventPin('12a4')).toBe(false);
    expect(generateEventCode()).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('maps camelCase fields and rejects invalid values', () => {
    expect(buildEventUpdate({ shotCount: 4, printMode: 'browser', filters: ['original', 'bw'] })).toEqual({
      update: { shot_count: 4, print_mode: 'browser', filters: ['original', 'bw'] },
    });
    expect(buildEventUpdate({ shotCount: 99 })).toHaveProperty('error');
    expect(buildEventUpdate({ galleryVisibility: 'everyone' })).toHaveProperty('error');
    expect(buildEventUpdate({ pin_hash: 'x' })).toEqual({ update: {} });
  });
});

describe('openrouter provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_MODE;
  });

  it('reports not_configured without a key', async () => {
    const r = await openRouterProvider.generate({ image: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'p' });
    expect(r).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('parses the /images response (b64_json)', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('PNGDATA').toString('base64'), media_type: 'image/png' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openRouterProvider.generate({ image: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'p' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.image.toString()).toBe('PNGDATA');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/images$/);
    const body = JSON.parse(String(init.body));
    expect(body.input_references[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test');
  });

  it('parses the chat completions response (message.images)', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    process.env.OPENROUTER_API_MODE = 'chat';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { images: [{ image_url: { url: `data:image/png;base64,${Buffer.from('IMG').toString('base64')}` } }] } }] }), { status: 200 })));
    const r = await openRouterProvider.generate({ image: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'p' });
    expect(r.ok && r.image.toString()).toBe('IMG');
  });

  it('maps 402 to insufficient_credits and moderation errors to safety', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'no credits' } }), { status: 402 })));
    expect(await openRouterProvider.generate({ image: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'p' })).toMatchObject({ ok: false, reason: 'insufficient_credits' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'flagged by moderation' } }), { status: 400 })));
    expect(await openRouterProvider.generate({ image: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'p' })).toMatchObject({ ok: false, reason: 'safety' });
  });
});
