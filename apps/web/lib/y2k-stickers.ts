/**
 * Y2K sticker set (client + server safe). Original flat vectors with an ink
 * outline and a white die-cut edge — they read on photos, on the fridge wall
 * and on printed zines. Each is a 200×200 SVG; use `y2kStickerUrl(id)` for an
 * <img>/canvas source. No network requests, no egress.
 */

import { CUTE_STICKERS } from './y2k-stickers-cute';

const CUT = 'stroke="#fff" stroke-width="16" stroke-linejoin="round" paint-order="stroke"';
const ink = (w = 5) => `stroke="#1A1410" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const INK = ink();

function wrap(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

/** Shape drawn twice: thick white die-cut underlay, then ink-outlined fill. */
function cut(shape: (attrs: string) => string, fill: string): string {
  return shape(`fill="#fff" ${CUT}`) + shape(`fill="${fill}" ${INK}`);
}

function starPts(cx: number, cy: number, outer: number, inner: number, n = 5, rot = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const SPARKLE = 'M100 14 C108 70 130 92 186 100 C130 108 108 130 100 186 C92 130 70 108 14 100 C70 92 92 70 100 14Z';
const HEART = 'M100 170C44 130 20 100 20 70c0-26 20-46 44-46 17 0 29 9 36 22 7-13 19-22 36-22 24 0 44 20 44 46 0 30-24 60-80 100z';

function label(text: string, fill: string, color: string, opts: { rot?: number; size?: number; font?: string } = {}): string {
  const rot = opts.rot ?? -8;
  const size = opts.size ?? 44;
  const font = opts.font ?? "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
  return wrap(
    `<g transform="rotate(${rot} 100 100)">` +
      cut((a) => `<rect x="18" y="62" width="164" height="76" rx="38" ${a}/>`, fill) +
      `<text x="100" y="${100 + size * 0.36}" text-anchor="middle" font-family="${font}" font-weight="900" font-size="${size}" fill="${color}" textLength="${Math.min(140, text.length * size * 0.62)}" lengthAdjust="spacingAndGlyphs">${text}</text>` +
      `</g>`,
  );
}

export interface Y2kSticker {
  id: string;
  label: string;
  svg: string;
  /** Picker tab: classic scrapbook, kawaii (v5 pack) or text labels. */
  category?: 'klasik' | 'lucu' | 'teks';
}

const TEXT_IDS = new Set(['xoxo', 'cute', 'click', 'luv', 'gemoy', 'omg', 'bff', 'y2k', 'slay', 'flash']);

const CLASSIC: Y2kSticker[] = [
  { id: 'sparkle', label: 'Kilau', svg: wrap(cut((a) => `<path d="${SPARKLE}" ${a}/>`, '#C9F25C') + `<path d="M150 30 c3 14 8 19 22 22 c-14 3-19 8-22 22 c-3-14-8-19-22-22 c14-3 19-8 22-22z" fill="#FF9BD2" ${ink(4)}/>`) },
  { id: 'star', label: 'Bintang', svg: wrap(cut((a) => `<polygon points="${starPts(100, 106, 88, 40)}" ${a}/>`, '#C4201A') + `<path d="M74 92 q6-8 14 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`) },
  {
    id: 'heart',
    label: 'Hati chrome',
    svg: wrap(
      cut((a) => `<path d="${HEART}" ${a}/>`, 'url(#hg)') + `<path d="M52 62 q10-20 32-12" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".85"/>`,
      `<linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC4E6"/><stop offset=".45" stop-color="#FF6FB8"/><stop offset=".7" stop-color="#FFB3DD"/><stop offset="1" stop-color="#E23D8C"/></linearGradient>`,
    ),
  },
  {
    id: 'butterfly',
    label: 'Kupu-kupu',
    svg: wrap(
      cut((a) => `<path d="M100 98 C70 40 18 36 22 78 C26 112 70 112 96 104 C66 120 52 166 84 166 C104 166 102 128 100 108 C98 128 96 166 116 166 C148 166 134 120 104 104 C130 112 174 112 178 78 C182 36 130 40 100 98Z" ${a}/>`, '#9ED8FF') +
        `<circle cx="58" cy="78" r="12" fill="#2747C9"/><circle cx="142" cy="78" r="12" fill="#2747C9"/><path d="M100 70 v70" ${INK}/><path d="M100 72 q-10-26-22-30 M100 72 q10-26 22-30" fill="none" ${ink(4)}/>`,
    ),
  },
  {
    id: 'smiley',
    label: 'Smiley',
    svg: wrap(cut((a) => `<circle cx="100" cy="100" r="80" ${a}/>`, '#FFD43B') + `<ellipse cx="74" cy="84" rx="9" ry="15" fill="#1A1410"/><ellipse cx="126" cy="84" rx="9" ry="15" fill="#1A1410"/><path d="M58 112 q42 46 84 0" fill="none" ${ink(8)}/>`),
  },
  {
    id: 'daisy',
    label: 'Bunga',
    svg: wrap(
      Array.from({ length: 8 }, (_, i) => `<ellipse cx="100" cy="52" rx="22" ry="40" transform="rotate(${i * 45} 100 100)" fill="#fff" ${CUT}/>`).join('') +
        Array.from({ length: 8 }, (_, i) => `<ellipse cx="100" cy="52" rx="22" ry="40" transform="rotate(${i * 45} 100 100)" fill="#FF9BD2" ${ink(4)}/>`).join('') +
        `<circle cx="100" cy="100" r="26" fill="#FFD43B" ${INK}/>`,
    ),
  },
  {
    id: 'flip',
    label: 'HP lipat',
    svg: wrap(
      `<g transform="rotate(-12 100 100)">` +
        cut((a) => `<rect x="58" y="14" width="84" height="172" rx="22" ${a}/>`, '#C9C9D6') +
        `<rect x="70" y="30" width="60" height="58" rx="8" fill="#9ED8FF" ${ink(4)}/><path d="M58 100 h84" ${ink(4)}/>` +
        Array.from({ length: 9 }, (_, i) => `<rect x="${72 + (i % 3) * 20}" y="${112 + Math.floor(i / 3) * 20}" width="14" height="12" rx="4" fill="#FF9BD2" stroke="#1A1410" stroke-width="3"/>`).join('') +
        `<text x="100" y="66" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="16" fill="#2747C9">&lt;3</text></g>`,
    ),
  },
  {
    id: 'cd',
    label: 'CD',
    svg: wrap(
      cut((a) => `<circle cx="100" cy="100" r="82" ${a}/>`, 'url(#cdg)') + `<circle cx="100" cy="100" r="22" fill="#F4EDDC" ${ink(4)}/><circle cx="100" cy="100" r="8" fill="#fff" ${ink(3)}/><path d="M48 70 a62 62 0 0 1 40 -32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/>`,
      `<linearGradient id="cdg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C6F1FF"/><stop offset=".3" stop-color="#FFC6EC"/><stop offset=".55" stop-color="#E8FFC2"/><stop offset=".8" stop-color="#C9D2FF"/><stop offset="1" stop-color="#FFE0B8"/></linearGradient>`,
    ),
  },
  { id: 'xoxo', label: 'xoxo', svg: label('xoxo', '#FF9BD2', '#1A1410', { rot: -10 }) },
  { id: 'cute', label: 'so cute!', svg: label('so cute!', '#C9F25C', '#1A1410', { rot: 6, size: 34 }) },
  { id: 'click', label: 'click', svg: label('click', '#2747C9', '#FFFFFF', { rot: -14 }) },
  {
    id: 'flash',
    label: 'flash!',
    svg: wrap(
      cut((a) => `<polygon points="${starPts(100, 100, 92, 58, 12, 0)}" ${a}/>`, '#FFD43B') +
        `<text x="100" y="114" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="40" fill="#C4201A" transform="rotate(-8 100 100)">flash!</text>`,
    ),
  },
  {
    id: 'cherry',
    label: 'Ceri',
    svg: wrap(
      `<path d="M80 128 C86 80 104 46 140 26 M124 126 C122 90 128 58 140 26" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/>` +
        `<path d="M80 128 C86 80 104 46 140 26 M124 126 C122 90 128 58 140 26" fill="none" stroke="#3F7360" stroke-width="7" stroke-linecap="round"/>` +
        cut((a) => `<circle cx="72" cy="140" r="36" ${a}/>`, '#C4201A') +
        cut((a) => `<circle cx="132" cy="138" r="36" ${a}/>`, '#C4201A') +
        `<path d="M140 28 q26 -6 34 14 q-24 8 -34 -14z" fill="#C9F25C" ${ink(4)}/><circle cx="60" cy="128" r="7" fill="#fff" opacity=".8"/><circle cx="120" cy="126" r="7" fill="#fff" opacity=".8"/>`,
    ),
  },
  {
    id: 'bow',
    label: 'Pita',
    svg: wrap(
      cut((a) => `<path d="M100 96 C70 50 20 52 24 92 C28 128 76 116 100 100 C124 116 172 128 176 92 C180 52 130 50 100 96Z" ${a}/>`, '#FF9BD2') +
        cut((a) => `<path d="M92 104 L64 178 L84 170 L96 182 L100 108 L104 182 L116 170 L136 178 L108 104Z" ${a}/>`, '#FF9BD2') +
        `<rect x="86" y="84" width="28" height="30" rx="10" fill="#E23D8C" ${ink(4)}/>`,
    ),
  },
  {
    id: 'alien',
    label: 'Alien',
    svg: wrap(
      cut((a) => `<path d="M100 18 C150 18 178 54 172 96 C166 140 126 182 100 182 C74 182 34 140 28 96 C22 54 50 18 100 18Z" ${a}/>`, '#C9F25C') +
        `<path d="M50 92 C58 74 86 80 90 112 C70 122 52 112 50 92Z" fill="#1A1410"/><path d="M150 92 C142 74 114 80 110 112 C130 122 148 112 150 92Z" fill="#1A1410"/><path d="M88 150 q12 8 24 0" fill="none" ${ink(5)}/>`,
    ),
  },
  {
    id: 'camera',
    label: 'Kamera',
    svg: wrap(
      `<g transform="rotate(8 100 100)">` +
        cut((a) => `<path d="M24 64 h40 l12 -18 h48 l12 18 h40 v96 h-152z" ${a}/>`, '#F4EDDC') +
        `<circle cx="100" cy="112" r="34" fill="#1A1410"/><circle cx="100" cy="112" r="20" fill="#2747C9"/><circle cx="92" cy="104" r="6" fill="#fff"/><rect x="138" y="76" width="22" height="12" rx="3" fill="#C4201A" ${ink(3)}/></g>`,
    ),
  },
  { id: 'luv', label: '4ever', svg: label('4ever', '#C4201A', '#FFFFFF', { rot: 8, size: 42 }) },
  {
    id: 'ticket',
    label: 'Tiket VIP',
    svg: wrap(
      `<g transform="rotate(-6 100 100)">` +
        cut((a) => `<path d="M16 60 h168 v24 a16 16 0 0 0 0 32 v24 h-168 v-24 a16 16 0 0 0 0 -32z" ${a}/>`, '#FFD43B') +
        `<path d="M138 62 v76" stroke="#1A1410" stroke-width="3" stroke-dasharray="6 6"/><text x="76" y="112" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="34" fill="#C4201A">VIP</text><text x="160" y="106" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="14" fill="#1A1410" transform="rotate(90 160 100)">No.01</text></g>`,
    ),
  },
];

/** Kawaii pack first (most loved), then the classic scrapbook set. */
export const Y2K_STICKERS: Y2kSticker[] = [...CUTE_STICKERS, ...CLASSIC].map((s) => ({
  ...s,
  category: TEXT_IDS.has(s.id) ? 'teks' : CUTE_STICKERS.some((c) => c.id === s.id) ? 'lucu' : 'klasik',
}));

export const STICKER_CATEGORIES: Array<{ id: NonNullable<Y2kSticker['category']>; label: string }> = [
  { id: 'lucu', label: 'Lucu' },
  { id: 'klasik', label: 'Klasik Y2K' },
  { id: 'teks', label: 'Teks' },
];

const BY_ID = new Map(Y2K_STICKERS.map((s) => [s.id, s]));

export function y2kSticker(id: string): Y2kSticker | undefined {
  return BY_ID.get(id);
}

export function y2kStickerUrl(id: string): string {
  const s = BY_ID.get(id);
  return s ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}` : '';
}

/** A placed sticker on a photo (positions are fractions of the photo box). */
export interface WallSticker {
  id: string;
  x: number;
  y: number;
  /** Width as a fraction of the photo width. */
  s: number;
  /** Rotation in degrees. */
  r: number;
}

export const MAX_WALL_STICKERS = 8;

/** Validates untrusted wall stickers (server). Returns a clean list. */
export function sanitizeWallStickers(input: unknown): WallSticker[] {
  if (!Array.isArray(input)) return [];
  const out: WallSticker[] = [];
  for (const raw of input.slice(0, MAX_WALL_STICKERS)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.id !== 'string' || !BY_ID.has(o.id)) continue;
    const n = (v: unknown, min: number, max: number, def: number) => {
      const x = Number(v);
      return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x * 1000) / 1000)) : def;
    };
    out.push({ id: o.id, x: n(o.x, -0.2, 1.2, 0.5), y: n(o.y, -0.2, 1.2, 0.5), s: n(o.s, 0.08, 0.8, 0.25), r: n(o.r, -180, 180, 0) });
  }
  return out;
}
