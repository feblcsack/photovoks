/**
 * Frame design document (stored in frames.design, JSONB).
 *
 * Coordinates are in canvas pixels of the design (width × height). Designs are
 * authored at print resolution (≈300 DPI) so the composed output is print-ready.
 * Elements are drawn in array order (first = bottom).
 */

export type FontKey = 'sans' | 'serif' | 'mono' | 'display' | 'hand' | 'marker' | 'script' | 'bubble' | 'typewriter' | 'scribble';
export const FONT_KEYS: readonly FontKey[] = ['sans', 'serif', 'mono', 'display', 'hand', 'marker', 'script', 'bubble', 'typewriter', 'scribble'];

export interface AssetRef {
  /** Path inside the `frames` bucket, e.g. "frames/assets/<uuid>.png" */
  path: string;
  /** Signed URL resolved by the server at load time (never persisted). */
  url?: string;
}

interface BaseElement {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface PhotoElement extends BaseElement {
  type: 'photo';
  /** 0-based photo index rendered here */
  slot: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  /** Supports tokens: {date} {time} {event} {code} */
  text: string;
  font: FontKey;
  size: number;
  weight: 400 | 500 | 600 | 700 | 800;
  italic?: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  uppercase?: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  asset: AssetRef;
  fit: 'cover' | 'contain' | 'stretch';
  radius: number;
}

export interface ShapeElement extends BaseElement {
  type: 'rect' | 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  color: string;
  thickness: number;
  dash: number;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  color: string;
  seed: string;
}

/** Session QR code — rendered with the guest's softfile link at capture time. */
export interface QrElement extends BaseElement {
  type: 'qr';
  color: string;
  background: string;
  /** Quiet zone around the code, in modules (0–4). */
  margin: number;
  radius: number;
  /** Optional caption under the code, e.g. "Scan softfile". */
  caption?: string;
  captionColor?: string;
}

export type FrameElement =
  | QrElement
  | PhotoElement
  | TextElement
  | ImageElement
  | ShapeElement
  | LineElement
  | BarcodeElement;

export type ElementType = FrameElement['type'];

export interface FrameDesign {
  version: 2;
  width: number;
  height: number;
  background: {
    color: string;
    image?: AssetRef | null;
    imageFit?: 'cover' | 'contain' | 'stretch';
  };
  elements: FrameElement[];
}

/** Frame as delivered to the booth / editor (with resolved asset URLs). */
export interface FrameRecord {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  width: number;
  height: number;
  slotCount: number;
  design: FrameDesign;
  thumbnailUrl: string | null;
  updatedAt?: string;
  /** Event-specific session-QR override (only on event frame lists). */
  qrPlacement?: QrPlacement;
}

export function slotCountOf(design: FrameDesign): number {
  const slots = design.elements.filter((e): e is PhotoElement => e.type === 'photo');
  if (slots.length === 0) return 0;
  return Math.max(...slots.map((s) => s.slot)) + 1;
}

/** Aspect ratio (w/h) of the first photo slot — used as camera crop. */
export function primarySlotAspect(design: FrameDesign): number {
  const slot = design.elements.find((e): e is PhotoElement => e.type === 'photo');
  return slot && slot.h > 0 ? slot.w / slot.h : 3 / 4;
}

export function aspectOfSlot(design: FrameDesign, slotIndex: number): number {
  const slot = design.elements.find((e): e is PhotoElement => e.type === 'photo' && e.slot === slotIndex);
  return slot && slot.h > 0 ? slot.w / slot.h : primarySlotAspect(design);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function collectAssets(design: FrameDesign): AssetRef[] {
  const refs: AssetRef[] = [];
  if (design.background.image) refs.push(design.background.image);
  for (const el of design.elements) if (el.type === 'image') refs.push(el.asset);
  return refs;
}

/** New uploads: frames/assets/<id>.<ext>; legacy overlays: <uuid>.png (bucket root). */
export const FRAME_ASSET_RE = /^(frames\/[\w./-]+|[0-9a-f-]{36}\.png)$/;

/**
 * Validates + sanitises an untrusted design (server side). Returns null when
 * it is structurally broken. Strips resolved URLs so only paths are stored.
 */
export function sanitizeDesign(input: unknown): FrameDesign | null {
  if (!input || typeof input !== 'object') return null;
  const d = input as Record<string, unknown>;
  const width = Number(d.width);
  const height = Number(d.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 100 || height < 100 || width > 6000 || height > 9000) return null;
  const bg = (d.background ?? {}) as Record<string, unknown>;
  const elements = Array.isArray(d.elements) ? d.elements : [];
  if (elements.length > 200) return null;

  const color = (v: unknown, def: string) =>
    typeof v === 'string' && /^(#[0-9a-fA-F]{3,8}|transparent)$/.test(v) ? v : def;
  const num = (v: unknown, def: number, min = -100000, max = 100000) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const asset = (v: unknown): AssetRef | null => {
    if (!v || typeof v !== 'object') return null;
    const p = (v as Record<string, unknown>).path;
    return typeof p === 'string' && FRAME_ASSET_RE.test(p) && !p.includes('..') ? { path: p } : null;
  };

  const out: FrameElement[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const base = {
      id: typeof e.id === 'string' ? e.id.slice(0, 32) : newId(),
      name: typeof e.name === 'string' ? e.name.slice(0, 60) : undefined,
      x: num(e.x, 0),
      y: num(e.y, 0),
      w: num(e.w, 100, 1),
      h: num(e.h, 100, 1),
      opacity: num(e.opacity, 1, 0, 1),
      locked: e.locked === true,
      hidden: e.hidden === true,
    };
    switch (e.type) {
      case 'photo':
        out.push({ ...base, type: 'photo', slot: Math.round(num(e.slot, 0, 0, 11)), radius: num(e.radius, 0, 0), borderWidth: num(e.borderWidth, 0, 0), borderColor: color(e.borderColor, '#000000') });
        break;
      case 'text':
        out.push({
          ...base,
          type: 'text',
          text: typeof e.text === 'string' ? e.text.slice(0, 500) : '',
          font: FONT_KEYS.includes(e.font as FontKey) ? (e.font as FontKey) : 'sans',
          size: num(e.size, 48, 4, 1000),
          weight: ([400, 500, 600, 700, 800] as const).includes(Number(e.weight) as 400) ? (Number(e.weight) as 400) : 400,
          italic: e.italic === true,
          color: color(e.color, '#111111'),
          align: e.align === 'left' || e.align === 'right' ? e.align : 'center',
          letterSpacing: num(e.letterSpacing, 0, -50, 200),
          lineHeight: num(e.lineHeight, 1.2, 0.5, 4),
          uppercase: e.uppercase === true,
        });
        break;
      case 'image': {
        const a = asset(e.asset);
        if (!a) break;
        out.push({ ...base, type: 'image', asset: a, fit: e.fit === 'contain' || e.fit === 'stretch' ? e.fit : 'cover', radius: num(e.radius, 0, 0) });
        break;
      }
      case 'rect':
      case 'ellipse':
        out.push({ ...base, type: e.type, fill: color(e.fill, '#eeeeee'), stroke: color(e.stroke, 'transparent'), strokeWidth: num(e.strokeWidth, 0, 0), radius: num(e.radius, 0, 0) });
        break;
      case 'line':
        out.push({ ...base, type: 'line', color: color(e.color, '#111111'), thickness: num(e.thickness, 4, 1, 200), dash: num(e.dash, 0, 0, 200) });
        break;
      case 'qr': {
        const side = Math.max(base.w, base.h);
        out.push({
          ...base,
          w: side,
          h: side,
          type: 'qr',
          color: color(e.color, '#111111'),
          background: color(e.background, '#ffffff'),
          margin: Math.round(num(e.margin, 2, 0, 4)),
          radius: num(e.radius, 0, 0),
          caption: typeof e.caption === 'string' ? e.caption.slice(0, 40) : undefined,
          captionColor: color(e.captionColor, '#111111'),
        });
        break;
      }
      case 'barcode':
        out.push({ ...base, type: 'barcode', color: color(e.color, '#111111'), seed: typeof e.seed === 'string' ? e.seed.slice(0, 40) : 'photovoks' });
        break;
    }
  }

  const bgImage = asset(bg.image);
  return {
    version: 2,
    width: Math.round(width),
    height: Math.round(height),
    background: {
      color: color(bg.color, '#ffffff'),
      image: bgImage,
      imageFit: bg.imageFit === 'contain' || bg.imageFit === 'stretch' ? bg.imageFit : 'cover',
    },
    elements: out,
  };
}

// ── Session QR placement (per event) ─────────────────────────────────────────

export type QrCorner = 'tl' | 'tr' | 'bl' | 'br';
/** null/undefined = as designed in the Frame Builder. */
export type QrPlacement = { mode: 'off' } | { mode: 'corner'; corner: QrCorner; size: number } | null;

export function hasQr(design: FrameDesign): boolean {
  return design.elements.some((e) => e.type === 'qr' && !e.hidden);
}

export function sanitizeQrPlacement(v: unknown): QrPlacement {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.mode === 'off') return { mode: 'off' };
  if (o.mode === 'corner' && ['tl', 'tr', 'bl', 'br'].includes(o.corner as string)) {
    const size = Number(o.size);
    return { mode: 'corner', corner: o.corner as QrCorner, size: Number.isFinite(size) ? Math.min(0.5, Math.max(0.08, size)) : 0.32 };
  }
  return null;
}

/** Returns the design with the event's QR placement applied (pure). */
export function applyQrPlacement(design: FrameDesign, placement: QrPlacement | undefined): FrameDesign {
  if (!placement) return design;
  const without = design.elements.filter((e) => e.type !== 'qr');
  if (placement.mode === 'off') return { ...design, elements: without };
  const side = Math.round(Math.min(design.width, design.height) * placement.size);
  const pad = Math.round(Math.min(design.width, design.height) * 0.035);
  const x = placement.corner.endsWith('l') ? pad : design.width - side - pad;
  const y = placement.corner.startsWith('t') ? pad : design.height - side - pad;
  const qr: QrElement = { id: 'event-qr', name: 'QR sesi', type: 'qr', x, y, w: side, h: side, color: '#111111', background: '#ffffff', margin: 2, radius: Math.round(side * 0.06) };
  return { ...design, elements: [...without, qr] };
}

/** Photo slots (1-based) that a visible QR element covers. */
export function qrOverlaps(design: FrameDesign): number[] {
  const qrs = design.elements.filter((e) => e.type === 'qr' && !e.hidden);
  const hit = new Set<number>();
  for (const q of qrs) {
    for (const p of design.elements) {
      if (p.type !== 'photo' || p.hidden) continue;
      const ix = Math.min(q.x + q.w, p.x + p.w) - Math.max(q.x, p.x);
      const iy = Math.min(q.y + q.h, p.y + p.h) - Math.max(q.y, p.y);
      if (ix > 4 && iy > 4) hit.add(p.slot + 1);
    }
  }
  return Array.from(hit).sort((a, b) => a - b);
}
