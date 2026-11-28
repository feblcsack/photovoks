import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/app/fonts', () => {
  const f = { style: { fontFamily: 'sans-serif' }, variable: '' };
  return { jakarta: f, playfair: f, spaceMono: f, bebas: f, caveat: f, patrickHand: f, pacifico: f, bagel: f, specialElite: f, gochi: f, pixelify: f, nunito: f, anton: f, archivoBlack: f, orbitron: f, unifraktur: f, grenze: f, jacquard: f, instrument: f, fontVariables: '' };
});

import { presignUrl, rfc3986 } from '@/lib/storage/sigv4';
import { isMediaPath, mediaSig, mediaUrl, verifyMediaSig } from '@/lib/storage/media-url';
import { nearestMediaWidth, variant } from '@/lib/media-variant';
import { DEFAULT_SETTINGS, formatRupiah, mergeSettings } from '@/lib/settings-shared';
import { buildEventUpdate, mapEvent } from '@/lib/events';
import { verifyAulaaSignature } from '@/lib/payments/aulaa';
import { WORDART_STYLES, cssExtrusion, cssGradient, isWordArtStyle } from '@/lib/wordart';
import { autoFill, blankPage, slotCount, ZINE_THEMES } from '@/lib/zine/layout';
import { sanitizeWallStickers, Y2K_STICKERS, y2kStickerUrl } from '@/lib/y2k-stickers';
import { createHash, createHmac } from 'node:crypto';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40);
});

describe('SigV4 (S3 / Cloudflare R2)', () => {
  it('matches the official AWS pre-signed URL test vector', () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = presignUrl(
      { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
      'GET',
      new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      86400,
      new Date('2013-05-24T00:00:00Z'),
    );
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
  it('encodes per RFC 3986', () => {
    expect(rfc3986("a b!'()*")).toBe('a%20b%21%27%28%29%2A');
  });
});

describe('stable /media URLs (egress fix)', () => {
  it('is deterministic — the same file always gets the same URL (cacheable)', () => {
    const a = mediaUrl('sessions', 'sessions/2f9a1e4c-1111-4222-8333-444455556666/strip.jpg');
    const b = mediaUrl('sessions', 'sessions/2f9a1e4c-1111-4222-8333-444455556666/strip.jpg');
    expect(a).toBe(b);
    expect(a).toMatch(/^\/media\/sessions\/sessions\/.+\/strip\.jpg\?s=[A-Za-z0-9_-]{22}$/);
  });
  it('verifies signatures and rejects tampering', () => {
    const p = 'frames/assets/abc.png';
    const sig = mediaSig('frames', p);
    expect(verifyMediaSig('frames', p, sig)).toBe(true);
    expect(verifyMediaSig('frames', 'frames/assets/abd.png', sig)).toBe(false);
    expect(verifyMediaSig('sessions', p, sig)).toBe(false);
    expect(verifyMediaSig('frames', p, null)).toBe(false);
  });
  it('rejects traversal and unknown buckets', () => {
    expect(isMediaPath('frames', '../etc/passwd')).toBe(false);
    expect(isMediaPath('frames', 'a/../b.png')).toBe(false);
    expect(isMediaPath('secrets', 'a.png')).toBe(false);
    expect(mediaUrl('frames', '')).toBeNull();
  });
  it('print worker computes the same signature', () => {
    const key = createHmac('sha256', process.env.ADMIN_SESSION_SECRET!).update('photovoks-media-v1').digest();
    const p = 'sessions/x/sheet.jpg';
    expect(createHmac('sha256', key).update(`sessions/${p}`).digest('base64url').slice(0, 22)).toBe(mediaSig('sessions', p));
  });
  it('builds resized WebP variants only for /media URLs', () => {
    expect(variant('/media/sessions/a/b.jpg?s=x', { w: 300 })).toBe('/media/sessions/a/b.jpg?s=x&w=320&f=webp');
    expect(variant('blob:abc', { w: 300 })).toBe('blob:abc');
    expect(variant(null)).toBe('');
    expect(variant('/media/a/b.jpg?s=x', { download: 'foto 1.jpg' })).toBe('/media/a/b.jpg?s=x&dl=foto%201.jpg');
    expect(nearestMediaWidth(5000)).toBe(1600);
  });
});

describe('runtime settings', () => {
  it('falls back to defaults and clamps invalid values', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_SETTINGS);
    const s = mergeSettings({ performance: { livePollSeconds: 1, imageQuality: 'ultra' }, storage: { driver: 'ftp' }, payments: { defaultAiPrice: -5 } });
    expect(s.performance.livePollSeconds).toBe(3);
    expect(s.performance.imageQuality).toBe('balanced');
    expect(s.storage.driver).toBe('supabase');
    expect(s.payments.defaultAiPrice).toBe(0);
  });
  it('formats rupiah', () => {
    expect(formatRupiah(1500)).toBe('Rp 1.500');
  });
});

describe('payments', () => {
  it('maps event payment fields with safe defaults', () => {
    const ev = mapEvent({ id: '1', code: 'ABC', name: 'x', status: 'active' });
    expect(ev.paymentMode).toBe('off');
    expect(ev.aiPrice).toBe(1500);
    expect(mapEvent({ payment_mode: 'weird' }).paymentMode).toBe('off');
  });
  it('validates prices (0 or ≥ Rp 1.000)', () => {
    expect(buildEventUpdate({ aiPrice: 1500, sessionPrice: 0, paymentMode: 'both' })).toEqual({ update: { ai_price: 1500, session_price: 0, payment_mode: 'both' } });
    expect(buildEventUpdate({ aiPrice: 500 })).toEqual({ error: 'Nilai tidak valid: aiPrice' });
    expect(buildEventUpdate({ paymentMode: 'crypto' })).toEqual({ error: 'Nilai tidak valid: paymentMode' });
  });
  it('verifies the Aulaa webhook signature over the raw body', () => {
    process.env.AULAA_WEBHOOK_SECRET = 'whsec_test';
    const body = '{"order_id":"PV-ABC-1","status":"paid","amount":1500}';
    const sig = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    expect(verifyAulaaSignature(body, sig)).toBe(true);
    expect(verifyAulaaSignature(body + ' ', sig)).toBe(false);
    expect(verifyAulaaSignature(body, null)).toBe(false);
    expect(verifyAulaaSignature(body, 'deadbeef')).toBe(false);
  });
});

describe('WordArt', () => {
  it('has well-formed styles', () => {
    expect(WORDART_STYLES.length).toBeGreaterThanOrEqual(8);
    for (const s of WORDART_STYLES) {
      expect(isWordArtStyle(s.id)).toBe(true);
      expect(cssGradient(s)).toMatch(/^linear-gradient\(/);
      expect(typeof cssExtrusion(s)).toBe('string');
    }
    expect(isWordArtStyle('comic-sans')).toBe(false);
  });
});

describe('minizine v5', () => {
  it('knows how many photos each layout holds', () => {
    expect(slotCount('grid')).toBe(4);
    expect(slotCount('trio')).toBe(3);
    expect(slotCount('text')).toBe(0);
  });
  it('auto-fills multi-photo layouts', () => {
    const pages = Array.from({ length: 8 }, (_, i) => blankPage(i));
    pages[2] = { ...pages[2], layout: 'grid' };
    const filled = autoFill(pages, ['a', 'b', 'c']);
    expect(filled[2].images.filter(Boolean)).toHaveLength(4);
    expect(filled[7]).toEqual(pages[7]);
  });
  it('themes restyle every page but keep photos', () => {
    const pages = autoFill(Array.from({ length: 8 }, (_, i) => blankPage(i)), ['a']);
    const themed = pages.map((p, i) => ZINE_THEMES[1].apply(p, i));
    expect(themed.every((p, i) => p.images[0] === pages[i].images[0])).toBe(true);
    expect(themed[1].pattern).toBeDefined();
  });
});

describe('sticker packs', () => {
  it('includes the kawaii pack with unique ids and valid SVGs', () => {
    const ids = Y2K_STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('kitty');
    expect(Y2K_STICKERS.every((s) => s.svg.startsWith('<svg') && s.category)).toBe(true);
    expect(y2kStickerUrl('boba')).toMatch(/^data:image\/svg\+xml/);
  });
  it('accepts new stickers on the live wall', () => {
    expect(sanitizeWallStickers([{ id: 'gemoy', x: 0.5, y: 0.5, s: 0.2, r: 0 }])).toHaveLength(1);
  });
});

describe('DOKU Checkout', () => {
  it('signs requests per the non-SNAP spec (with and without Digest)', async () => {
    const { dokuSignature } = await import('@/lib/payments/doku');
    const body = '{"order":{"amount":1500,"invoice_number":"PV-1"}}';
    const digest = createHash('sha256').update(body).digest('base64');
    const comp = `Client-Id:C1\nRequest-Id:R1\nRequest-Timestamp:2026-11-27T12:00:00Z\nRequest-Target:/checkout/v1/payment\nDigest:${digest}`;
    expect(dokuSignature({ clientId: 'C1', requestId: 'R1', timestamp: '2026-11-27T12:00:00Z', target: '/checkout/v1/payment', body, secret: 'S' })).toBe(`HMACSHA256=${createHmac('sha256', 'S').update(comp).digest('base64')}`);
    const get = `Client-Id:C1\nRequest-Id:R1\nRequest-Timestamp:T\nRequest-Target:/orders/v1/status/PV-1`;
    expect(dokuSignature({ clientId: 'C1', requestId: 'R1', timestamp: 'T', target: '/orders/v1/status/PV-1', secret: 'S' })).toBe(`HMACSHA256=${createHmac('sha256', 'S').update(get).digest('base64')}`);
  });
  it('verifies notifications against our notify path only', async () => {
    process.env.DOKU_CLIENT_ID = 'C1';
    process.env.DOKU_SECRET_KEY = 'S';
    const { dokuSignature, verifyDokuNotification, DOKU_NOTIFY_PATH } = await import('@/lib/payments/doku');
    const body = '{"order":{"invoice_number":"PV-1","amount":1500},"transaction":{"status":"SUCCESS"}}';
    const sig = dokuSignature({ clientId: 'C1', requestId: 'N1', timestamp: 'T', target: DOKU_NOTIFY_PATH, body, secret: 'S' });
    const h = (s: string) => new Headers({ 'client-id': 'C1', 'request-id': 'N1', 'request-timestamp': 'T', signature: s });
    expect(verifyDokuNotification(h(sig), body)).toBe(true);
    expect(verifyDokuNotification(h(sig), body.replace('1500', '15'))).toBe(false);
    expect(verifyDokuNotification(h('HMACSHA256=nope'), body)).toBe(false);
  });
});

describe('DOKU create checkout payload', () => {
  it('only sends characters DOKU accepts', async () => {
    process.env.DOKU_CLIENT_ID = 'C1';
    process.env.DOKU_SECRET_KEY = 'S';
    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ response: { payment: { url: 'https://sandbox.doku.com/checkout-link-v2/x', token_id: 't' } } }), { status: 200 });
    }));
    const { createDokuCheckout } = await import('@/lib/payments/doku');
    await createDokuCheckout({ invoice: 'PVABC123-LX0ABCDEF', amount: 1000, dueMinutes: 15 });
    vi.unstubAllGlobals();
    const body = JSON.parse(sent);
    const strings: string[] = [];
    JSON.stringify(body, (_k, v) => (typeof v === 'string' && strings.push(v), v));
    expect(strings.every((s) => /^[A-Za-z0-9 .\-/+,=_:'@%()]*$/.test(s))).toBe(true);
    expect(body.payment.payment_method_types).toEqual(['QRIS']);
  });
});

describe('UI campus fun features', () => {
  it('places low-poly pals in a corner, deterministically, facing inwards', async () => {
    const { palFor, PAL_IDS } = await import('@/lib/booth/pals');
    for (let i = 0; i < 20; i++) {
      const p = palFor(0.42, i);
      expect(p).toEqual(palFor(0.42, i));
      expect(PAL_IDS).toContain(p.id);
      expect([0.21, 0.79]).toContain(p.x);
      expect(p.flip).toBe(p.x > 0.5);
    }
  });
  it('knows the meme looks and defaults fun features on', async () => {
    const { isMemeStyle } = await import('@/lib/booth/meme');
    expect(isMemeStyle('freaky')).toBe(true);
    expect(isMemeStyle('rickroll')).toBe(false);
    expect(mergeSettings({}).fun).toEqual({ lowPoly: true, meme: true });
    expect(mergeSettings({ fun: { lowPoly: false } }).fun).toEqual({ lowPoly: false, meme: true });
  });
});

describe('Tebak Lagu', () => {
  it('parses Spotify track links in every common form', async () => {
    const { parseSpotifyTrackId } = await import('@/lib/song/match');
    const id = '4uLU6hMCjMI75M1A2tKUQC';
    expect(parseSpotifyTrackId(`https://open.spotify.com/track/${id}?si=abc`)).toBe(id);
    expect(parseSpotifyTrackId(`https://open.spotify.com/intl-id/track/${id}`)).toBe(id);
    expect(parseSpotifyTrackId(`spotify:track:${id}`)).toBe(id);
    expect(parseSpotifyTrackId(id)).toBe(id);
    expect(parseSpotifyTrackId('https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC')).toBeNull();
  });
  it('accepts forgiving answers but not wrong ones', async () => {
    const { isCorrectGuess } = await import('@/lib/song/match');
    expect(isCorrectGuess('never gonna give you up', 'Never Gonna Give You Up')).toBe(true);
    expect(isCorrectGuess('Never gona give you up', 'Never Gonna Give You Up')).toBe(true);
    expect(isCorrectGuess('never gonna give you up rick astley', 'Never Gonna Give You Up')).toBe(true);
    expect(isCorrectGuess('Kasih Putih', 'Kasih Putih (feat. Someone) - Remastered 2021')).toBe(true);
    expect(isCorrectGuess('sial', 'Sial', ['Sial Mahalini'])).toBe(true);
    expect(isCorrectGuess('give', 'Never Gonna Give You Up')).toBe(false);
    expect(isCorrectGuess('bohemian rhapsody', 'Never Gonna Give You Up')).toBe(false);
  });
  it('makes unambiguous voucher codes', async () => {
    const { voucherCode } = await import('@/lib/song/match');
    expect(voucherCode()).toMatch(/^LAGU-[ACDEFHJKMNPRTUVWXY34679]{4}$/);
  });
});

describe('SKCK photozine', () => {
  it('derives a stable, lowercase certificate number from the session', async () => {
    const { skckNumber } = await import('@/lib/skck/layout');
    expect(skckNumber('session-a')).toBe(skckNumber('session-a'));
    expect(skckNumber('session-a')).not.toBe(skckNumber('session-b'));
    expect(skckNumber('x')).toMatch(/^\d{4}\/\d{3}\/kck\/\d{4}$/);
  });
});
