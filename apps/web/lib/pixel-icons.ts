/**
 * 16×16 pixel-art icons for the retro OS ("Photovoks 98") look — drawn here
 * as character grids in the app palette, rendered as crisp SVG rects. Original
 * art (no OS vendor assets).
 */

const PALETTE: Record<string, string> = {
  k: '#1A1410', // ink
  w: '#FFFDF6',
  l: '#D9D1BF', // light face
  g: '#8C8170', // shadow
  y: '#FFD43B', // sun
  o: '#F2B705',
  b: '#2747C9', // cobalt
  s: '#9ED8FF', // sky
  r: '#C4201A', // brand red
  p: '#FF9BD2',
  G: '#C9F25C', // lime
  d: '#3F7360', // booth green
  n: '#8B5A2B',
};

export const PIXEL_ICONS = {
  folder: [
    '................',
    '................',
    '.kkkkkk.........',
    'kyyyyyyk........',
    'kyyyyyyykkkkkkk.',
    'kywwwwwwwwwwwwyk',
    'kyyyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyyok',
    'kyyyyyyyyyyyyyok',
    'kyyyyyyyyyyyyyok',
    'kooooooooooooook',
    'kkkkkkkkkkkkkkkk',
    '................',
    '................',
  ],
  computer: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kllllllllllllk.',
    '.klkkkkkkkkkklk.',
    '.klkbbbbbbbbklk.',
    '.klkbsbbbbbbklk.',
    '.klkbbbbbbbbklk.',
    '.klkbbbbbbbbklk.',
    '.klkkkkkkkkkklk.',
    '.klllllllllllgk.',
    '.kkkkkkkkkkkkkk.',
    '......kllk......',
    '....kkkkkkkk....',
    '...kllllllllk...',
    '...kkkkkkkkkk...',
    '................',
  ],
  recycle: [
    '................',
    '...kkkkkkkkkk...',
    '..kwwwwwwwwwwk..',
    '..kkkkkkkkkkkk..',
    '...kwlwlwlwlk...',
    '...kwlwddwlwk...',
    '...kwldwwdlwk...',
    '...kwdwlwldwk...',
    '...kwlwlwlwlk...',
    '...kwldwwdlwk...',
    '...kwlwddwlwk...',
    '...kwlwlwlwlk...',
    '...kwlwlwlwlk...',
    '....kkkkkkkk....',
    '................',
    '................',
  ],
  camera: [
    '................',
    '................',
    '....kkkk........',
    '..kkkllkkkkkkk..',
    '.kllllllllllllk.',
    '.klllkkkkkllrlk.',
    '.kllkbbbbbklllk.',
    '.kllkbsbbbklllk.',
    '.kllkbbbbbklllk.',
    '.kllkbbbbbklllk.',
    '.klllkkkkkllllk.',
    '.kllllllllllllk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
    '................',
  ],
  floppy: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kbbkllllllkbbk.',
    '.kbbkllklllkbbk.',
    '.kbbkllklllkbbk.',
    '.kbbkkkkkkkkbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbwwwwwwwwbbk.',
    '.kbbwkkkkkkwbbk.',
    '.kbbwwwwwwwwbbk.',
    '.kbbwkkkkkkwbbk.',
    '.kbbwwwwwwwwbbk.',
    '.kbbwwwwwwwwbbk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
  ],
  book: [
    '................',
    '................',
    '.kkkkkk.kkkkkk..',
    'kwwwwwwkwwwwwwk.',
    'kwkkkkwkwkkkkwk.',
    'kwwwwwwkwwwwwwk.',
    'kwkkkwwkwkkkkwk.',
    'kwwwwwwkwwwwwwk.',
    'kwkkkkwkwkkkwwk.',
    'kwwwwwwkwwwwwwk.',
    'krrrrrrkrrrrrrk.',
    '.kkkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
  ],
  printer: [
    '................',
    '....kkkkkkk.....',
    '....kwwwwwk.....',
    '....kwkkkwk.....',
    '..kkkkkkkkkkkk..',
    '.kllllllllllllk.',
    '.kllllllllllGGk.',
    '.kllllllllllllk.',
    '.kggggggggggggk.',
    '.kkkkwwwwwwkkkk.',
    '....kwkkkkwk....',
    '....kwwwwwwk....',
    '....kkkkkkkk....',
    '................',
    '................',
    '................',
  ],
  pin: [
    '................',
    '.....kkkkkk.....',
    '....krrrrrrk....',
    '...krrrrrrrrk...',
    '...krrrwwrrrk...',
    '...krrwwwwrrk...',
    '...krrrwwrrrk...',
    '...krrrrrrrrk...',
    '....krrrrrrk....',
    '.....krrrrk.....',
    '......krrk......',
    '.......kk.......',
    '....dddddddd....',
    '................',
    '................',
    '................',
  ],
  warning: [
    '................',
    '.......kk.......',
    '......kyyk......',
    '......kyyk......',
    '.....kyyyyk.....',
    '.....kykkyk.....',
    '....kyykkyyk....',
    '....kyykkyyk....',
    '...kyyykkyyyk...',
    '...kyyykkyyyk...',
    '..kyyyyyyyyyyk..',
    '..kyyyykkyyyyk..',
    '.kyyyyykkyyyyyk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '................',
  ],
  info: [
    '................',
    '.....kkkkkk.....',
    '...kkbbbbbbkk...',
    '..kbbbbwwbbbbk..',
    '..kbbbbwwbbbbk..',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbwwwbbbbbk.',
    '.kbbbbbwwbbbbbk.',
    '.kbbbbbwwbbbbbk.',
    '.kbbbbbwwbbbbbk.',
    '..kbbbbwwbbbbk..',
    '..kbbbwwwwbbbk..',
    '...kkbbbbbbkk...',
    '.....kkkkkk.....',
    '................',
    '................',
  ],
  cursor: [
    'k...............',
    'kk..............',
    'kwk.............',
    'kwwk............',
    'kwwwk...........',
    'kwwwwk..........',
    'kwwwwwk.........',
    'kwwwwwwk........',
    'kwwwwwwwk.......',
    'kwwwwwkkkk......',
    'kwwkwwk.........',
    'kwk.kwwk........',
    'kk..kwwk........',
    'k....kwwk.......',
    '.....kwwk.......',
    '......kk........',
  ],
  hourglass: [
    '..kkkkkkkkkkkk..',
    '..knnnnnnnnnnk..',
    '...kwyyyyyywk...',
    '...kwyyyyyywk...',
    '....kwyyyywk....',
    '.....kwyywk.....',
    '......kyyk......',
    '......kwwk......',
    '.....kwwywk.....',
    '....kwwwywwk....',
    '...kwwwyyywwk...',
    '...kwyyyyyywk...',
    '..knnnnnnnnnnk..',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
  ],
  star: [
    '................',
    '.......kk.......',
    '......kyyk......',
    '......kyyk......',
    '.....kyyyyk.....',
    'kkkkkkyyyykkkkkk',
    '.kyyyyyyyyyyyyk.',
    '..kyyyyyyyyyyk..',
    '...kyyyyyyyyk...',
    '....kyyyyyyk....',
    '....kyyyyyyk....',
    '...kyyykkyyyk...',
    '...kyyk..kyyk...',
    '..kyk......kyk..',
    '..kk........kk..',
    '................',
  ],
  tv: [
    '................',
    '....k.....k.....',
    '.....k...k......',
    '......k.k.......',
    '.kkkkkkkkkkkkkk.',
    '.krrrrrrrrrrrrk.',
    '.krkkkkkkkkkkrk.',
    '.krkswsssssskrk.',
    '.krksssssssskrk.',
    '.krksssGGssskrk.',
    '.krkssGGGGsskrk.',
    '.krkkkkkkkkkkrk.',
    '.krrrrrrrrrrgrk.',
    '.kkkkkkkkkkkkkk.',
    '...kk......kk...',
    '................',
  ],
} as const satisfies Record<string, readonly string[]>;

export type PixelIconName = keyof typeof PIXEL_ICONS;

/** Rects for one icon, horizontal runs merged (fewer DOM nodes). */
export function pixelRects(name: PixelIconName): Array<{ x: number; y: number; w: number; fill: string }> {
  const rows = PIXEL_ICONS[name];
  const out: Array<{ x: number; y: number; w: number; fill: string }> = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      if (c !== '.' && PALETTE[c]) out.push({ x, y, w, fill: PALETTE[c] });
      x += w;
    }
  });
  return out;
}

export function pixelSvg(name: PixelIconName): string {
  const rects = pixelRects(name)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`;
}

export function pixelIconUrl(name: PixelIconName): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pixelSvg(name))}`;
}
