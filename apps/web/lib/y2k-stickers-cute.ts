/**
 * "Kawaii Y2K" sticker pack (v5) — original flat vectors in the same die-cut
 * style as the first pack: white cut line, ink outline, glossy highlights.
 * 200×200 viewBox each. Pure strings: client + server safe, zero egress.
 */

const CUT = 'stroke="#fff" stroke-width="16" stroke-linejoin="round" paint-order="stroke"';
const ink = (w = 5) => `stroke="#1A1410" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const INK = ink();
const SHINE = (d: string, w = 7) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" opacity=".85"/>`;

function wrap(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}
function cut(shape: (attrs: string) => string, fill: string): string {
  return shape(`fill="#fff" ${CUT}`) + shape(`fill="${fill}" ${INK}`);
}
const eyes = (y = 96, dx = 24, cx = 100) =>
  `<ellipse cx="${cx - dx}" cy="${y}" rx="7" ry="10" fill="#1A1410"/><ellipse cx="${cx + dx}" cy="${y}" rx="7" ry="10" fill="#1A1410"/><circle cx="${cx - dx + 2}" cy="${y - 4}" r="2.6" fill="#fff"/><circle cx="${cx + dx + 2}" cy="${y - 4}" r="2.6" fill="#fff"/>`;
const blush = (y = 112, dx = 40, cx = 100) => `<ellipse cx="${cx - dx}" cy="${y}" rx="10" ry="6" fill="#FF9BD2" opacity=".85"/><ellipse cx="${cx + dx}" cy="${y}" rx="10" ry="6" fill="#FF9BD2" opacity=".85"/>`;
const smile = (y = 110, w = 10, cx = 100) => `<path d="M${cx - w} ${y} q${w} ${w} ${w * 2} 0" fill="none" ${ink(4)}/>`;

function bubbleText(text: string, fill: string, color: string, rot = -8, size = 50): string {
  // Puffy "bubble letters": fat outline + inner fill + highlight.
  const font = "'Arial Rounded MT Bold','Arial Black','Helvetica Neue',Arial,sans-serif";
  const len = Math.min(168, text.length * size * 0.66);
  const t = (attrs: string) => `<text x="100" y="${100 + size * 0.36}" text-anchor="middle" font-family="${font}" font-weight="900" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs" ${attrs}>${text}</text>`;
  return wrap(
    `<g transform="rotate(${rot} 100 100)">` +
      t(`fill="#fff" stroke="#fff" stroke-width="26" stroke-linejoin="round"`) +
      t(`fill="${color}" stroke="#1A1410" stroke-width="12" stroke-linejoin="round"`) +
      t(`fill="${fill}"`) +
      `</g>`,
  );
}

export interface CuteSticker {
  id: string;
  label: string;
  svg: string;
}

export const CUTE_STICKERS: CuteSticker[] = [
  {
    id: 'kitty',
    label: 'Kucing oren',
    svg: wrap(
      cut((a) => `<path d="M34 78 L40 24 L82 54 Q100 50 118 54 L160 24 L166 78 Q178 104 166 134 Q148 172 100 172 Q52 172 34 134 Q22 104 34 78Z" ${a}/>`, '#FFB347') +
        `<path d="M48 40 l4 24 l16 -10z" fill="#FF9BD2"/><path d="M152 40 l-4 24 l-16 -10z" fill="#FF9BD2"/>` +
        // tabby stripes
        `<path d="M86 60 l4 16 M100 58 v18 M114 60 l-4 16 M36 110 h16 M38 122 h14 M148 110 h16 M148 122 h14" ${ink(4)}/>` +
        `<ellipse cx="70" cy="108" rx="9" ry="12" fill="#1A1410"/><ellipse cx="130" cy="108" rx="9" ry="12" fill="#1A1410"/><circle cx="73" cy="103" r="3.5" fill="#fff"/><circle cx="133" cy="103" r="3.5" fill="#fff"/>` +
        blush(128, 46) +
        `<path d="M94 124 l6 6 l6 -6z" fill="#C4201A" ${ink(2)}/><path d="M100 130 q-10 12 -20 4 M100 130 q10 12 20 4" fill="none" ${ink(4)}/>` +
        `<path d="M58 34 l5 12 l13 1 l-10 8 l3 13 l-11 -7 l-11 7 l3 -13 l-10 -8 l13 -1z" fill="#FFE066" ${ink(3)}/>`,
    ),
  },
  {
    id: 'bunny',
    label: 'Kelinci',
    svg: wrap(
      cut((a) => `<path d="M70 92 C56 50 58 12 74 12 C90 12 92 50 88 86 Q100 82 112 86 C108 50 110 12 126 12 C142 12 144 50 130 92 Q164 110 160 140 Q154 178 100 178 Q46 178 40 140 Q36 110 70 92Z" ${a}/>`, '#F7F2FF') +
        `<path d="M74 24 C68 44 70 66 78 84" fill="none" stroke="#FFC4E6" stroke-width="10" stroke-linecap="round"/><path d="M126 24 C132 44 130 66 122 84" fill="none" stroke="#FFC4E6" stroke-width="10" stroke-linecap="round"/>` +
        eyes(128, 22) + blush(142, 38) + smile(140, 7),
    ),
  },
  {
    id: 'strawberry',
    label: 'Stroberi',
    svg: wrap(
      cut((a) => `<path d="M100 186 C50 160 26 116 34 86 C40 62 70 54 100 64 C130 54 160 62 166 86 C174 116 150 160 100 186Z" ${a}/>`, '#FF3B6B') +
        cut((a) => `<path d="M100 70 L74 40 L92 46 L100 22 L108 46 L126 40Z" ${a}/>`, '#3DDC84') +
        Array.from({ length: 10 }, (_, i) => `<ellipse cx="${62 + (i % 4) * 24 + (Math.floor(i / 4) % 2) * 12}" cy="${96 + Math.floor(i / 4) * 26}" rx="3.5" ry="5" fill="#FFE066"/>`).join('') +
        SHINE('M58 92 q6 -16 22 -20'),
    ),
  },
  {
    id: 'rainbow',
    label: 'Pelangi',
    svg: wrap(
      `<path d="M54 140 A46 46 0 0 1 146 140" fill="none" stroke="#fff" stroke-width="76"/>` +
        ['#FF3B6B', '#FF9F1C', '#FFE066', '#3DDC84', '#5B8CFF'].map((c, i) => `<path d="M${30 + i * 12} 140 A${70 - i * 12} ${70 - i * 12} 0 0 1 ${170 - i * 12} 140" fill="none" stroke="${c}" stroke-width="12"/>`).join('') +
        `<path d="M24 140 A76 76 0 0 1 176 140" fill="none" ${ink(4)}/>` +
        cut((a) => `<path d="M14 150 q0-24 24-22 q6-18 26-10 q16 6 10 32 z" ${a}/>`, '#FFFFFF') +
        cut((a) => `<path d="M186 150 q0-24 -24-22 q-6-18 -26-10 q-16 6 -10 32 z" ${a}/>`, '#FFFFFF'),
    ),
  },
  {
    id: 'cloud',
    label: 'Awan imut',
    svg: wrap(
      cut((a) => `<path d="M46 150 C18 150 14 110 42 104 C38 70 80 58 96 80 C108 52 154 56 154 92 C186 92 190 150 154 150Z" ${a}/>`, '#E2F3FF') +
        eyes(116, 18, 104) + blush(128, 32, 104) + smile(126, 6, 104),
    ),
  },
  {
    id: 'mushroom',
    label: 'Jamur',
    svg: wrap(
      cut((a) => `<path d="M76 110 h48 l6 56 q-30 14 -60 0z" ${a}/>`, '#FFF4DC') +
        cut((a) => `<path d="M18 112 C18 52 70 26 100 26 C130 26 182 52 182 112 Q100 128 18 112Z" ${a}/>`, '#FF3B3B') +
        `<circle cx="62" cy="76" r="12" fill="#fff"/><circle cx="112" cy="54" r="10" fill="#fff"/><circle cx="146" cy="88" r="13" fill="#fff"/><circle cx="96" cy="94" r="7" fill="#fff"/>` +
        eyes(138, 12) + blush(148, 22),
    ),
  },
  {
    id: 'lips',
    label: 'Bibir glossy',
    svg: wrap(
      cut((a) => `<path d="M14 104 C40 62 74 58 100 78 C126 58 160 62 186 104 C160 152 130 160 100 160 C70 160 40 152 14 104Z" ${a}/>`, 'url(#lg)') +
        `<path d="M24 104 C60 112 140 112 176 104" fill="none" ${ink(5)}/>` + SHINE('M60 128 q20 10 44 6', 8) + SHINE('M58 84 q14 -10 28 -4', 5),
      `<linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6FB8"/><stop offset="1" stop-color="#C4134E"/></linearGradient>`,
    ),
  },
  {
    id: 'gloss',
    label: 'Lip gloss',
    svg: wrap(
      `<g transform="rotate(18 100 100)">` +
        cut((a) => `<rect x="72" y="70" width="56" height="112" rx="14" ${a}/>`, 'url(#gg)') +
        cut((a) => `<rect x="78" y="16" width="44" height="58" rx="10" ${a}/>`, '#1A1410') +
        `<rect x="84" y="24" width="8" height="40" rx="4" fill="#fff" opacity=".5"/>` +
        `<text x="100" y="140" text-anchor="middle" font-family="Arial Black, Arial" font-weight="900" font-size="15" fill="#fff" transform="rotate(-90 100 132)">GLOSS</text></g>`,
      `<linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFC4E6"/><stop offset=".5" stop-color="#FF4FA8"/><stop offset="1" stop-color="#FF9BD2"/></linearGradient>`,
    ),
  },
  {
    id: 'pet',
    label: 'Peliharaan digital',
    svg: wrap(
      cut((a) => `<path d="M100 16 C150 16 176 64 172 112 C168 160 136 184 100 184 C64 184 32 160 28 112 C24 64 50 16 100 16Z" ${a}/>`, 'url(#pg)') +
        `<rect x="60" y="62" width="80" height="64" rx="10" fill="#C9F2B8" ${ink(4)}/>` +
        // pixel buddy on the LCD
        `<g fill="#1A1410">${[[88, 76], [96, 76], [104, 76], [80, 84], [112, 84], [80, 92], [88, 92], [104, 92], [112, 92], [80, 100], [112, 100], [88, 108], [96, 108], [104, 108]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="8"/>`).join('')}</g>` +
        [76, 100, 124].map((x) => `<circle cx="${x}" cy="150" r="9" fill="#FFE066" ${ink(4)}/>`).join('') + SHINE('M48 70 q6 -26 30 -38'),
      `<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9ED8FF"/><stop offset="1" stop-color="#8E5BFF"/></linearGradient>`,
    ),
  },
  {
    id: 'chromeheart',
    label: 'Hati krom',
    svg: wrap(
      cut((a) => `<path d="M100 176C40 134 16 102 16 70c0-28 22-48 48-48 16 0 28 8 36 20 8-12 20-20 36-20 26 0 48 20 48 48 0 32-24 64-84 106z" ${a}/>`, 'url(#ch)') +
        SHINE('M44 60 q8 -22 32 -18', 9) + `<path d="M150 50 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#fff"/>`,
      `<linearGradient id="ch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#B8BEC8"/><stop offset=".55" stop-color="#6E7480"/><stop offset=".75" stop-color="#E3E7EC"/><stop offset="1" stop-color="#9AA1AB"/></linearGradient>`,
    ),
  },
  {
    id: 'wings',
    label: 'Sayap malaikat',
    svg: wrap(
      cut((a) => `<path d="M96 110 C70 60 30 40 10 56 C18 70 22 80 14 92 C30 96 32 104 22 116 C44 120 48 128 42 140 C66 140 86 130 96 110Z" ${a}/>`, '#FFFFFF') +
        cut((a) => `<path d="M104 110 C130 60 170 40 190 56 C182 70 178 80 186 92 C170 96 168 104 178 116 C156 120 152 128 158 140 C134 140 114 130 104 110Z" ${a}/>`, '#FFFFFF') +
        `<ellipse cx="100" cy="40" rx="30" ry="9" fill="none" stroke="#FFD43B" stroke-width="7"/><ellipse cx="100" cy="40" rx="30" ry="9" fill="none" ${ink(2)}/>` +
        `<path d="M40 70 q20 6 36 30 M160 70 q-20 6 -36 30" fill="none" stroke="#C9D2FF" stroke-width="4"/>`,
    ),
  },
  {
    id: 'devil',
    label: 'Tanduk iblis',
    svg: wrap(
      cut((a) => `<path d="M40 120 C30 80 40 40 70 20 C66 50 70 78 90 96 Z" ${a}/>`, '#C4201A') +
        cut((a) => `<path d="M160 120 C170 80 160 40 130 20 C134 50 130 78 110 96 Z" ${a}/>`, '#C4201A') +
        // pointy tail with a heart tip
        `<path d="M58 168 C90 150 120 186 150 150" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round"/><path d="M58 168 C90 150 120 186 150 150" fill="none" stroke="#C4201A" stroke-width="8" stroke-linecap="round"/>` +
        cut((a) => `<path d="M150 126 l18 18 l-6 24 l-24 -6z" ${a}/>`, '#FF4FA8') +
        SHINE('M52 64 q4 -20 16 -30', 5) + SHINE('M148 64 q-4 -20 -16 -30', 5),
    ),
  },
  {
    id: 'flame',
    label: 'Api pink',
    svg: wrap(
      cut((a) => `<path d="M100 184 C52 184 30 150 34 116 C38 82 64 72 66 40 C82 54 88 70 86 86 C100 66 106 40 98 14 C140 36 170 80 166 124 C162 162 136 184 100 184Z" ${a}/>`, 'url(#fl)') +
        `<path d="M100 172 C76 172 66 152 70 134 C74 116 88 112 90 96 C110 110 128 128 124 150 C122 164 112 172 100 172Z" fill="#FFE066" ${ink(3)}/>`,
      `<linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF4FA8"/><stop offset="1" stop-color="#8E5BFF"/></linearGradient>`,
    ),
  },
  {
    id: 'peace',
    label: 'Damai',
    svg: wrap(
      cut((a) => `<circle cx="100" cy="100" r="80" ${a}/>`, '#C9F25C') +
        `<circle cx="100" cy="100" r="56" fill="none" ${ink(10)}/><path d="M100 44 v112 M100 100 l-40 40 M100 100 l40 40" fill="none" ${ink(10)}/>`,
    ),
  },
  {
    id: 'icecream',
    label: 'Es krim',
    svg: wrap(
      cut((a) => `<path d="M62 96 L100 188 L138 96Z" ${a}/>`, '#F2B705') +
        `<path d="M72 104 l50 40 M86 98 l40 32 M80 124 l36 -28 M92 150 l20 -16" ${ink(3)}/>` +
        cut((a) => `<path d="M54 102 C40 102 38 78 56 74 C54 46 84 36 100 50 C116 36 146 46 144 74 C162 78 160 102 146 102Z" ${a}/>`, '#FFC4E6') +
        `<circle cx="100" cy="30" r="12" fill="#FF3B6B" ${ink(4)}/>` +
        ['#3DDC84', '#5B8CFF', '#FFE066', '#FF9F1C'].map((c, i) => `<rect x="${66 + i * 18}" y="${68 + (i % 2) * 10}" width="10" height="4" rx="2" fill="${c}" transform="rotate(${i * 40 - 30} ${71 + i * 18} ${70 + (i % 2) * 10})"/>`).join('') +
        eyes(84, 14) + smile(92, 5),
    ),
  },
  {
    id: 'boba',
    label: 'Boba',
    svg: wrap(
      `<path d="M120 10 L108 70" stroke="#fff" stroke-width="22" stroke-linecap="round"/><path d="M120 10 L108 70" stroke="#FF4FA8" stroke-width="10" stroke-linecap="round"/>` +
        cut((a) => `<path d="M50 64 h100 l-12 110 q-38 12 -76 0z" ${a}/>`, '#F3DCC0') +
        cut((a) => `<rect x="42" y="54" width="116" height="20" rx="10" ${a}/>`, '#FFFFFF') +
        Array.from({ length: 9 }, (_, i) => `<circle cx="${70 + (i % 5) * 15 + (i > 4 ? 7 : 0)}" cy="${150 + (i > 4 ? 12 : 0)}" r="7" fill="#3A2416"/>`).join('') +
        eyes(108, 16) + blush(120, 28) + smile(118, 6),
    ),
  },
  {
    id: 'cassette',
    label: 'Kaset',
    svg: wrap(
      `<g transform="rotate(-8 100 100)">` +
        cut((a) => `<rect x="16" y="46" width="168" height="110" rx="12" ${a}/>`, '#8E5BFF') +
        `<rect x="34" y="60" width="132" height="44" rx="6" fill="#FFE066" ${ink(4)}/>` +
        `<circle cx="70" cy="118" r="14" fill="#fff" ${ink(4)}/><circle cx="130" cy="118" r="14" fill="#fff" ${ink(4)}/><rect x="84" y="112" width="32" height="12" rx="3" fill="#1A1410"/>` +
        `<text x="100" y="90" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="18" fill="#1A1410">MIX 2000</text>` +
        `<path d="M50 156 l10 -18 h80 l10 18" fill="none" ${ink(4)}/></g>`,
    ),
  },
  {
    id: 'disco',
    label: 'Bola disko',
    svg: wrap(
      `<path d="M100 6 v22" ${ink(4)}/>` +
        cut((a) => `<circle cx="100" cy="106" r="76" ${a}/>`, 'url(#db)') +
        Array.from({ length: 7 }, (_, i) => `<path d="M${30 + i * 2} ${62 + i * 15} H${170 - i * 2}" stroke="#1A1410" stroke-width="2" opacity=".35"/>`).join('') +
        Array.from({ length: 9 }, (_, i) => `<path d="M${36 + i * 16} 40 Q${100 + (i - 4) * 6} 106 ${36 + i * 16} 172" fill="none" stroke="#1A1410" stroke-width="2" opacity=".3"/>`).join('') +
        `<path d="M60 70 l6 0 l0 6 l-6 0z M128 120 l8 0 l0 8 l-8 0z" fill="#fff"/><path d="M150 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#FFE066" ${ink(2)}/>`,
      `<radialGradient id="db" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".4" stop-color="#C9CED6"/><stop offset=".8" stop-color="#8E95A1"/><stop offset="1" stop-color="#5B8CFF"/></radialGradient>`,
    ),
  },
  {
    id: 'shades',
    label: 'Kacamata bintang',
    svg: wrap(
      `<path d="M86 96 q14 -12 28 0" fill="none" ${ink(7)}/>` +
        [60, 140].map((cx) => cut((a) => `<polygon points="${Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 22 : 46; const ang = -Math.PI / 2 + (i * Math.PI) / 5; return `${(cx + r * Math.cos(ang)).toFixed(1)},${(104 + r * Math.sin(ang)).toFixed(1)}`; }).join(' ')}" ${a}/>`, 'url(#sg)')).join('') +
        SHINE('M44 90 l12 -10', 5) + SHINE('M124 90 l12 -10', 5),
      `<linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4FA8"/><stop offset="1" stop-color="#5B8CFF"/></linearGradient>`,
    ),
  },
  {
    id: 'moon',
    label: 'Bulan',
    svg: wrap(
      cut((a) => `<path d="M122 18 C70 22 36 62 40 112 C44 160 88 190 136 176 C100 166 76 134 78 96 C80 58 100 30 122 18Z" ${a}/>`, '#FFE066') +
        `<path d="M70 96 q6 -6 12 0" fill="none" ${ink(4)}/><path d="M74 126 q8 8 16 0" fill="none" ${ink(4)}/><ellipse cx="80" cy="112" rx="10" ry="6" fill="#FF9BD2" opacity=".85"/>` +
        `<path d="M156 52 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#fff" ${ink(2)}/><path d="M168 118 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z" fill="#9ED8FF" ${ink(2)}/>`,
    ),
  },
  {
    id: 'ghost',
    label: 'Hantu imut',
    svg: wrap(
      cut((a) => `<path d="M40 180 V92 C40 50 66 22 100 22 C134 22 160 50 160 92 V180 L140 164 L120 180 L100 164 L80 180 L60 164Z" ${a}/>`, '#F7F2FF') +
        eyes(94, 22) + blush(110, 36) + `<ellipse cx="100" cy="116" rx="8" ry="10" fill="#1A1410"/>` +
        `<path d="M168 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z" fill="#FF9BD2" ${ink(2)}/>`,
    ),
  },
  { id: 'gemoy', label: 'gemoy', svg: bubbleText('gemoy', '#FF9BD2', '#FF4FA8', -8, 48) },
  { id: 'omg', label: 'OMG', svg: bubbleText('OMG!', '#FFE066', '#FF9F1C', 6, 62) },
  { id: 'bff', label: 'BFF', svg: bubbleText('BFF', '#9ED8FF', '#5B8CFF', -6, 66) },
  { id: 'y2k', label: 'Y2K', svg: bubbleText('Y2K', '#C9F25C', '#3DDC84', 8, 66) },
  { id: 'slay', label: 'slay', svg: bubbleText('slay', '#E2D4FF', '#8E5BFF', -10, 58) },
];
