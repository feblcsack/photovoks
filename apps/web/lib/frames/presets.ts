/**
 * Canvas size presets (≈300 DPI) and starter templates for the Frame Builder.
 */
import type { FrameDesign, FrameElement, PhotoElement, TextElement } from './types';
import { newId } from './types';

export interface CanvasPreset {
  id: string;
  label: string;
  group: string;
  width: number;
  height: number;
  category: string;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'strip-2x6', label: 'Strip 2×6"', group: 'Kertas foto', width: 600, height: 1800, category: 'strip' },
  { id: '4x6-p', label: '4R / 4×6" potret', group: 'Kertas foto', width: 1200, height: 1800, category: '4r' },
  { id: '4x6-l', label: '4R / 4×6" lanskap', group: 'Kertas foto', width: 1800, height: 1200, category: '4r' },
  { id: '5x7-p', label: '5×7" potret', group: 'Kertas foto', width: 1500, height: 2100, category: '5x7' },
  { id: 'square', label: 'Persegi 4×4"', group: 'Kertas foto', width: 1200, height: 1200, category: 'square' },
  { id: 'postcard', label: 'Postcard 100×148mm', group: 'Canon Selphy', width: 1181, height: 1748, category: 'postcard' },
  { id: 'thermal-58', label: 'Struk 58mm', group: 'Printer thermal', width: 384, height: 1200, category: 'receipt' },
  { id: 'thermal-80', label: 'Struk 80mm', group: 'Printer thermal', width: 576, height: 1700, category: 'receipt' },
];

function photo(slot: number, x: number, y: number, w: number, h: number, extra: Partial<PhotoElement> = {}): PhotoElement {
  return { id: newId(), type: 'photo', slot, x, y, w, h, radius: 0, borderWidth: 0, borderColor: '#000000', ...extra };
}

function text(t: string, x: number, y: number, w: number, h: number, extra: Partial<TextElement> = {}): TextElement {
  return {
    id: newId(),
    type: 'text',
    text: t,
    x,
    y,
    w,
    h,
    font: 'sans',
    size: 48,
    weight: 700,
    color: '#111111',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    ...extra,
  };
}

/** Evenly stacked vertical slots. */
function stack(count: number, x: number, y: number, w: number, totalH: number, gap: number, extra?: Partial<PhotoElement>): PhotoElement[] {
  const h = (totalH - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => photo(i, x, y + i * (h + gap), w, h, extra));
}

export interface FrameTemplate {
  id: string;
  name: string;
  description: string;
  build: () => FrameDesign;
}

export const FRAME_TEMPLATES: FrameTemplate[] = [
  {
    id: 'blank-strip',
    name: 'Kosong · Strip',
    description: 'Mulai dari nol, 2×6"',
    build: () => ({ version: 2, width: 600, height: 1800, background: { color: '#ffffff' }, elements: [] }),
  },
  {
    id: 'classic-strip',
    name: 'Classic Strip · 3 pose',
    description: 'Strip 2×6" klasik dengan judul',
    build: () => ({
      version: 2,
      width: 600,
      height: 1800,
      background: { color: '#ffffff' },
      elements: [
        ...stack(3, 40, 40, 520, 1460, 24, { radius: 8 }),
        text('{event}', 40, 1540, 520, 90, { font: 'serif', size: 64, weight: 700 }),
        text('{date}', 40, 1650, 520, 60, { font: 'sans', size: 30, weight: 500, color: '#555555', letterSpacing: 4 }),
      ],
    }),
  },
  {
    id: 'film-strip',
    name: 'Film · 4 pose',
    description: 'Strip hitam ala roll film',
    build: () => ({
      version: 2,
      width: 600,
      height: 1800,
      background: { color: '#111111' },
      elements: [
        ...stack(4, 60, 60, 480, 1520, 30),
        ...Array.from({ length: 16 }, (_, i): FrameElement => ({ id: newId(), type: 'rect', x: 16, y: 40 + i * 106, w: 24, h: 40, fill: '#f2f2f2', stroke: 'transparent', strokeWidth: 0, radius: 6 })),
        ...Array.from({ length: 16 }, (_, i): FrameElement => ({ id: newId(), type: 'rect', x: 560, y: 40 + i * 106, w: 24, h: 40, fill: '#f2f2f2', stroke: 'transparent', strokeWidth: 0, radius: 6 })),
        text('{event}', 60, 1620, 480, 80, { font: 'display', size: 72, weight: 400, color: '#ffffff', letterSpacing: 6 }),
        text('{date}', 60, 1705, 480, 50, { font: 'mono', size: 26, weight: 400, color: '#bbbbbb' }),
      ],
    }),
  },
  {
    id: 'grid-4r',
    name: 'Grid 4R · 4 pose',
    description: '4×6" potret, grid 2×2',
    build: () => {
      const g = 30;
      const w = (1200 - 60 * 2 - g) / 2;
      const h = 660;
      return {
        version: 2,
        width: 1200,
        height: 1800,
        background: { color: '#FFF8EE' },
        elements: [
          photo(0, 60, 60, w, h, { radius: 16 }),
          photo(1, 60 + w + g, 60, w, h, { radius: 16 }),
          photo(2, 60, 60 + h + g, w, h, { radius: 16 }),
          photo(3, 60 + w + g, 60 + h + g, w, h, { radius: 16 }),
          text('{event}', 60, 1500, 1080, 130, { font: 'script', size: 96, weight: 400, color: '#2B2B2B' }),
          text('{date}', 60, 1650, 1080, 70, { font: 'sans', size: 36, weight: 600, color: '#8A7F70', letterSpacing: 8, uppercase: true }),
        ],
      };
    },
  },
  {
    id: 'polaroid',
    name: 'Polaroid · 1 pose',
    description: '4×6" satu foto besar + caption',
    build: () => ({
      version: 2,
      width: 1200,
      height: 1800,
      background: { color: '#F4F1EA' },
      elements: [
        { id: newId(), type: 'rect', x: 90, y: 110, w: 1020, h: 1480, fill: '#ffffff', stroke: '#E4DED2', strokeWidth: 4, radius: 8 },
        photo(0, 140, 160, 920, 1150),
        text('{event}', 140, 1350, 920, 120, { font: 'marker', size: 104, weight: 700, color: '#222222' }),
        text('{date}', 140, 1480, 920, 60, { font: 'hand', size: 44, weight: 400, color: '#666666' }),
      ],
    }),
  },
  {
    id: 'receipt',
    name: 'Struk · 3 pose',
    description: 'Gaya struk thermal 80mm',
    build: () => ({
      version: 2,
      width: 576,
      height: 1700,
      background: { color: '#ffffff' },
      elements: [
        text('RECEIPT PHOTO', 24, 30, 528, 70, { font: 'sans', size: 52, weight: 800, letterSpacing: 1 }),
        text('{event}\nPRINT THE MOMENT. KEEP THE MEMORY\n{date}  {time}', 24, 108, 528, 110, { font: 'mono', size: 22, weight: 400, lineHeight: 1.4 }),
        { id: newId(), type: 'line', x: 24, y: 232, w: 528, h: 6, color: '#111111', thickness: 3, dash: 10 },
        ...stack(3, 48, 262, 480, 1150, 20),
        { id: newId(), type: 'line', x: 24, y: 1436, w: 528, h: 6, color: '#111111', thickness: 3, dash: 10 },
        text('PAYMENT  : YOUR SMILE\nLOCATION : OUR HEART\nKODE     : {code}', 24, 1462, 300, 120, { font: 'mono', size: 20, weight: 400, align: 'left', lineHeight: 1.6 }),
        { id: newId(), type: 'barcode', x: 336, y: 1470, w: 216, h: 90, color: '#111111', seed: 'photovoks' },
        text('TERIMA KASIH ♥', 24, 1610, 528, 50, { font: 'mono', size: 24, weight: 700 }),
      ],
    }),
  },
  {
    id: 'landscape-2',
    name: 'Lanskap · 2 pose',
    description: '4×6" lanskap berdampingan',
    build: () => ({
      version: 2,
      width: 1800,
      height: 1200,
      background: { color: '#1F2A44' },
      elements: [
        photo(0, 70, 70, 810, 900, { radius: 20 }),
        photo(1, 920, 70, 810, 900, { radius: 20 }),
        text('{event}', 70, 1010, 1100, 110, { font: 'serif', size: 84, weight: 700, color: '#ffffff', align: 'left' }),
        text('{date}', 1200, 1040, 530, 70, { font: 'sans', size: 40, weight: 600, color: '#C7D2FE', align: 'right', letterSpacing: 4 }),
      ],
    }),
  },
];

export function templateById(id: string | null | undefined): FrameDesign {
  const t = FRAME_TEMPLATES.find((x) => x.id === id) ?? FRAME_TEMPLATES[1];
  return t.build();
}
