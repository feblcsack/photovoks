/**
 * Built-in sticker set (client-safe). Flat vector shapes with a white die-cut
 * outline — no gradients — so they read well on any photo and print cleanly.
 * Each sticker is a 200×200 SVG turned into a data URL.
 */

const OUTLINE = 'stroke="#fff" stroke-width="12" stroke-linejoin="round" paint-order="stroke"';

function svg(body: string, viewBox = '0 0 200 200'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="400" height="400">${body}</svg>`;
}

function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function label(text: string, fill: string, color: string, width = 190): string {
  const x = (200 - width) / 2;
  return svg(
    `<rect x="${x}" y="70" width="${width}" height="60" rx="30" fill="${fill}" ${OUTLINE}/>` +
      `<text x="100" y="111" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="30" textLength="${width - 40}" lengthAdjust="spacingAndGlyphs" fill="${color}">${text}</text>`,
  );
}

export interface BuiltinSticker {
  id: string;
  label: string;
  svg: string;
}

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  {
    id: 'heart',
    label: 'Hati',
    svg: svg(`<path d="M100 172C40 130 18 98 18 68c0-26 20-44 44-44 18 0 31 10 38 24 7-14 20-24 38-24 24 0 44 18 44 44 0 30-22 62-82 104z" fill="#E8364F" ${OUTLINE}/>`),
  },
  {
    id: 'star',
    label: 'Bintang',
    svg: svg(`<polygon points="${starPoints(100, 104, 86, 38)}" fill="#FFC531" ${OUTLINE}/>`),
  },
  {
    id: 'smile',
    label: 'Senyum',
    svg: svg(
      `<circle cx="100" cy="100" r="80" fill="#FFD43B" ${OUTLINE}/>` +
        `<ellipse cx="74" cy="84" rx="9" ry="13" fill="#1B1B1F"/><ellipse cx="126" cy="84" rx="9" ry="13" fill="#1B1B1F"/>` +
        `<path d="M62 116q38 40 76 0" fill="none" stroke="#1B1B1F" stroke-width="10" stroke-linecap="round"/>`,
    ),
  },
  {
    id: 'flower',
    label: 'Bunga',
    svg: svg(
      `<g fill="#FF8FB1" ${OUTLINE}>` +
        [0, 72, 144, 216, 288].map((a) => `<circle cx="${(100 + 44 * Math.cos(((a - 90) * Math.PI) / 180)).toFixed(1)}" cy="${(100 + 44 * Math.sin(((a - 90) * Math.PI) / 180)).toFixed(1)}" r="34"/>`).join('') +
        `</g><circle cx="100" cy="100" r="28" fill="#FFD43B"/>`,
    ),
  },
  {
    id: 'crown',
    label: 'Mahkota',
    svg: svg(`<path d="M28 150 38 58l38 42 24-56 24 56 38-42 10 92z" fill="#FFC531" ${OUTLINE}/><rect x="28" y="150" width="144" height="20" rx="6" fill="#E9A800"/>`),
  },
  {
    id: 'shades',
    label: 'Kacamata',
    svg: svg(`<g ${OUTLINE}><path d="M14 80h172v14H14z" fill="#1B1B1F"/><rect x="22" y="84" width="70" height="46" rx="18" fill="#1B1B1F"/><rect x="108" y="84" width="70" height="46" rx="18" fill="#1B1B1F"/></g>`),
  },
  {
    id: 'bolt',
    label: 'Petir',
    svg: svg(`<path d="M116 14 40 112h48l-14 74 86-104h-50z" fill="#FFD43B" ${OUTLINE}/>`),
  },
  {
    id: 'note',
    label: 'Not',
    svg: svg(`<g fill="#3D5AFE" ${OUTLINE}><path d="M78 40l92-18v104h-18V56l-56 11v79H78z"/><ellipse cx="62" cy="148" rx="26" ry="20"/><ellipse cx="146" cy="128" rx="26" ry="20"/></g>`),
  },
  {
    id: 'cherry',
    label: 'Ceri',
    svg: svg(`<path d="M100 30c-6 40-30 66-48 92M100 30c10 40 26 62 48 82" fill="none" stroke="#2E7D32" stroke-width="8" stroke-linecap="round"/><path d="M100 30c18-10 40-8 54 4-20 10-38 8-54-4z" fill="#43A047"/><g fill="#D81B3C" ${OUTLINE}><circle cx="52" cy="142" r="34"/><circle cx="148" cy="132" r="34"/></g>`),
  },
  {
    id: 'bow',
    label: 'Pita',
    svg: svg(`<g fill="#FF6FA5" ${OUTLINE}><path d="M100 100 28 58c-12 26-12 58 0 84z"/><path d="M100 100l72-42c12 26 12 58 0 84z"/><circle cx="100" cy="100" r="18"/></g><path d="M90 116 72 176M110 116l18 60" stroke="#FF6FA5" stroke-width="14" stroke-linecap="round"/>`),
  },
  {
    id: 'cloud',
    label: 'Awan',
    svg: svg(`<path d="M52 150c-24 0-40-16-40-36s16-36 38-36c4-26 26-44 52-44 28 0 50 20 52 46 20 2 34 16 34 34 0 20-16 36-38 36z" fill="#fff" stroke="#BFD7FF" stroke-width="8" stroke-linejoin="round"/>`),
  },
  {
    id: 'rainbow',
    label: 'Pelangi',
    svg: svg(`<g fill="none" stroke-linecap="round" stroke-width="16"><path d="M24 160a76 76 0 0 1 152 0" stroke="#E8364F"/><path d="M44 160a56 56 0 0 1 112 0" stroke="#FFC531"/><path d="M64 160a36 36 0 0 1 72 0" stroke="#3D5AFE"/></g>`),
  },
  { id: 'cheese', label: 'Say cheese', svg: label('SAY CHEESE', '#1B1B1F', '#FFD43B') },
  { id: 'besties', label: 'Besties', svg: label('BESTIES', '#FF6FA5', '#ffffff', 170) },
  { id: 'bestday', label: 'Best day', svg: label('BEST DAY', '#3D5AFE', '#ffffff', 170) },
  { id: 'love', label: 'Love', svg: label('LOVE YOU', '#E8364F', '#ffffff', 176) },
];

export function stickerDataUrl(s: BuiltinSticker): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`;
}

export const STICKER_EMOJI = ['😂', '😍', '🥰', '😎', '🤩', '🥳', '😜', '🤪', '😘', '🫶', '👑', '💖', '🔥', '🎉', '🎈', '🌸', '🌈', '⭐', '💯', '👍', '✌️', '📸', '🍒', '🦋'];

export const TEXT_COLORS = ['#FFFFFF', '#1B1B1F', '#E8364F', '#FFC531', '#3D5AFE', '#FF6FA5', '#2E7D32'];
